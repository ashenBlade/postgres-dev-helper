import * as assert from 'assert';
import * as vscode from 'vscode';
import {TreeItemCollapsibleState as CollapsibleState} from 'vscode';
import * as pg from 'pg';
import { Configuration, NodePreviewTreeViewProvider } from '../../extension';
import * as vars from '../../variables';

class TreeItemWrapper {
    item: vscode.TreeItem;
    label: string;
    description: string;
    collapsibleState?: CollapsibleState;
    constructor(treeItem: vscode.TreeItem) {
        this.label = treeItem.label?.toString().trim() ?? '';
        this.description = treeItem.description?.toString().trim() ?? '';
        this.item = treeItem;
        this.collapsibleState = treeItem.collapsibleState;
    }

    getType() {
        /* name: [type] */
        const semicolonIdx = this.label.indexOf(':');
        if (semicolonIdx === -1) {
            /* If no : then the whole label is name */
            return '';
        }
        return this.label.substring(semicolonIdx + 1);
    }

    getName() {
        /* [name]: type */
        const semicolonIdx = this.label.indexOf(':');
        if (semicolonIdx === -1) {
            /* If no : then the whole label is name */
            return this.label;
        }

        return this.label.substring(0, semicolonIdx);
    }

    isExpandable() {
        return this.collapsibleState === CollapsibleState.Collapsed;
    }
}

interface VarTreeItemPair {
    var: vars.Variable;
    item: TreeItemWrapper;
};

type DebuggerType = 'cppdbg' | 'lldb';

class TestEnv {
    /* Version of Postgresql being tested */
    pgVersion: string;
    /* Version of VS Code we are running on */
    vscodeVersion: string;
    /* Debugger extension is used */
    debugger: DebuggerType;

    constructor(pgVersion: string, vscodeVersion: string, debuggerType: DebuggerType) {
        this.pgVersion = pgVersion;
        if (Number.isNaN(Number(this.pgVersion))) {
            throw new Error(`Invalid PostgreSQL version "${pgVersion}".` +
                            'Version must be in "major.minor" form.')
        }

        this.vscodeVersion = vscodeVersion;
        this.debugger = debuggerType;
    }

    isCodeLLDB() {
        return this.debugger === 'lldb';
    }

    isCppDbg() {
        return this.debugger === 'cppdbg';
    }

    pgVersionSatisfies(required: string) {
        const requiredVersion = Number(required);
        console.assert(!Number.isNaN(requiredVersion));
        return Number(this.pgVersion) >= requiredVersion;
    }
}

function getTestEnv(): TestEnv {
    const pgVersion = process.env.PGHH_PG_VERSION ?? '17';
    const vscodeVersion = process.env.PGHH_VSCODE_VERSION ?? 'stable';
    const dbg = process.env.PGHH_DEBUGGER ?? 'cppdbg';
    if (!(dbg === 'cppdbg' || dbg === 'lldb')) {
        throw new Error(`Unknown type of debugger: ${dbg}`);
    }

    return new TestEnv(pgVersion, vscodeVersion, dbg);
}

function getDebugConfiguration(env: TestEnv, pid: number) {
    let config: vscode.DebugConfiguration;
    if (env.debugger === 'cppdbg') {
        config = {
            name: 'Backend',
            request: 'attach',
            type: 'cppdbg',
            processId: pid,
            program: '${workspaceFolder}/src/backend/postgres',
        };
    } else {
        config = {
            name: 'Backend',
            request: 'attach',
            type: 'lldb',
            pid: pid,
            program: '${workspaceFolder}/src/backend/postgres'
        };
    }

    return config;
}

async function searchBreakpointLocation() {
    /* 
     * For simplicity/flexibility target test function must be last in the
     * file, so we set breakpoint at first 'return' statement from end.
     * Also, we do not imply any restrictions of 'vscodehelper.c' file location,
     * so search it manually.
     */
    const files = await vscode.workspace.findFiles('**/vscodehelper.c');
    if (!files || files.length === 0) {
        throw new Error('failed to find vscodehelper.c file');
    }
    const sourceFile = files[0];

    /* Iterate lines from end and find first occurrence of 'return' statement */
    const document = await vscode.workspace.openTextDocument(sourceFile);
    const lineCount = document.lineCount;
    let lineNumber;
    for (lineNumber = lineCount - 1; lineNumber >= 0; --lineNumber) {
        const line = document.lineAt(lineNumber);
        if (line.text.indexOf('return') !== -1) {
            break;
        }
    }
    if (lineNumber < 0) {
        throw new Error('failed to find position in vscodehelper.c for ' + 
                        'breakpoint: no return statement found');
    }

    return new vscode.Location(sourceFile, new vscode.Position(lineNumber, 0));
}

const sleep = async (ms: number) => await new Promise(r => setTimeout(r, ms));
const execCommand = vscode.commands.executeCommand;
const execGetTreeViewProvider = async () => {
    return await execCommand<NodePreviewTreeViewProvider>(
                                Configuration.Commands.GetTreeViewProvider);
}

const intRegexp = (value: number) => new RegExp(`^\\s*${value}\\s*$`);
const execGetVariables = async () => {
    return await execCommand<vars.Variable[] | undefined>(
                                Configuration.Commands.GetVariables);
}

suite('Variables', async () => {
    let variables: vars.Variable[] | undefined;
    const env = getTestEnv();
    const client = new pg.Client({
        host: `${process.cwd()}/pgsrc/${env.pgVersion}/data`,
        port: 5432,
        database: 'postgres',
        user: 'postgres'
    });

    /* There must be only 1 workspace */
    const workspace = vscode.workspace.workspaceFolders![0];

    suiteSetup(async () => {
        /* Connect to backend */
        await client.connect();
        
        /* Obtain backend PID */
        const pidResponse = await client.query('SELECT pg_backend_pid() AS pid');
        const pid = Number(pidResponse.rows[0].pid);
        if (Number.isNaN(pid)) {
            throw new Error('Failed to obtain PID from backend');
        }

        /* Run debug session */
        if (!await vscode.debug.startDebugging(workspace, getDebugConfiguration(env, pid))) {
            throw new Error('Failed to start debug session');
        }

        /* Set breakpoint in special function */
        vscode.debug.addBreakpoints([
            new vscode.SourceBreakpoint(await searchBreakpointLocation(), true)
        ]);

        /* Wait before breakpoint enables and run query */
        await sleep(1000);

        client.query(`SELECT *
                      FROM t1 JOIN t2 ON t1.x = t2.x 
                      WHERE t1.y > 10 AND t2.x = t1.y`);

        /*
         * Wait for breakpoint and collect variables.
         *
         * 'onDidReceiveDebugSessionCustomEvent' does not raise any events and
         * I don't know why, so just use polling with retries.
         */
        let attempt = 0;
        const maxAttempt = 5;
        const timeout = 3 * 1000;
        while (attempt < maxAttempt) {
            await sleep(timeout);
            try {
                variables = await execGetVariables();
                if (variables && 0 < variables.length) {
                    break;
                }
            } catch (err) {
                /* nothing */
            }

            attempt++;
        }

        if (!variables) {
            throw new Error('failed to obtain postgres variables');
        }
    });

    suiteTeardown(async () => {
        /* Detach debugger (and continue execution) */
        if (vscode.debug.activeDebugSession) {
            await vscode.debug.activeDebugSession.customRequest('disconnect', {});
        }

        await client.end();
    });

    const getVar = (name: string, vars?: vars.Variable[]) => {
        const v = (vars ?? variables)?.find(v => v.name === name);
        if (!v) {
            throw new Error(`failed to get variable ${name}`);
        }
        return v;
    }

    const getVarItem = async (name: string, vars?: vars.Variable[]) => {
        const v = getVar(name, vars);
        return {
            var: v,
            item: new TreeItemWrapper(await v.getTreeItem())
        } as VarTreeItemPair;
    }

    const expand = async (x: vars.Variable | VarTreeItemPair) => {
        const v = x instanceof vars.Variable ? x : x.var;
        const children = await v.getChildren();
        assert.ok(children && 0 < children.length,
                  `Failed to get children of variable ${v.name}`);
    
        const items: VarTreeItemPair[] = [];
        for (const v of children) {
            const item = await v.getTreeItem();
            if (!item) {
                assert.fail(`could not get TreeItem for ${v.name}`);
            }

            items.push({
                var: v,
                item: new TreeItemWrapper(item)
            });
        }

        return items;
    }

    
    const getMember = (pairs: VarTreeItemPair[], name: string) => {
        const pair = pairs.find(pair => pair.item.getName() === name);
        assert.ok(pair, `Failed to find ${name} member`);
        return pair;
    }
    
    const getMemberOf = async (x: vars.Variable | VarTreeItemPair, name: string) => {
        const children = await expand(x);
        return getMember(children, name);
    }

    /* Tests for handling types of variables */
    suite('Variable handling', async () => {    
        const assertExpandable = (x: TreeItemWrapper, who: string) => {
            assert.equal(x.collapsibleState, CollapsibleState.Collapsed, 
                         `${who} must be expandable`);
        }

        const assertNotExpandable = (x: TreeItemWrapper, who: string) => {
            assert.equal(x.collapsibleState, CollapsibleState.None,
                         `${who} must not be expandable`);
        }
        
        /* Scalar variable is not expandable */
        test('Scalar', async () => {
            const {item} = await getVarItem('i');
            assertNotExpandable(item, 'Scalar variable');
            assert.match(item.description, intRegexp(1), 'Value is not shown');
        });

        /* Array of integers (scalars) */
        test('Array[int]', async () => {
            const {var: v, item} = await getVarItem('int_array');
            assertExpandable(item, 'Array');
    
            const arrayMembers = await expand(v);
            assert.equal(arrayMembers.length, 16, 'Array contains 16 elements');

            for (const [i, value] of arrayMembers.entries()) {
                assert.match(value.item.description, intRegexp(i + 1),
                             `Array member at ${i} does not display valid value`);
            }

            assert.ok(arrayMembers.every(x => !x.item.isExpandable()),
                      'Scalar array elements must not be expandable');
        });

        /* Array of structures */
        test('Array[structure]', async () => {
            const {var: v, item} = await getVarItem('structure_array');
            assertExpandable(item, 'Array');

            const children = await expand(v);
            assert.equal(children.length, 16, 'Array contains 16 elements');
            assert.ok(children.every(c => c.item.isExpandable()),
                      'Structure array members must be expandable');

            for (const [i, child] of children.entries()) {
                const {item} = await getMemberOf(child, 'value');
                assert.match(item.description, intRegexp(i + 1), 
                            `Member at ${i} does not displays actual value`);
            }
        });

        /* Array of pointers to structures */
        test('Array[pointers]', async () => {
            const {var: v, item} = await getVarItem('structure_array');
            assertExpandable(item, 'Array');

            const children = await expand(v);
            assert.equal(children.length, 16, 'Array contains 16 elements');
            assert.ok(children.every(c => c.item.isExpandable()),
                      'Structure array members must be expandable');

            for (const [i, child] of children.entries()) {
                assertExpandable(child.item, 'Pointer array element');

                const valueItem = await getMemberOf(child, 'value');
                assertNotExpandable(valueItem.item, 'Scalar member');
                assert.match(valueItem.item.description, intRegexp(i + 1),
                             `Member at ${i} does not displays actual value`);
            }
        });

        /* Structure allocated on stack */
        test('Structure[value]', async () => {
            const structureVar = await getVarItem('value_struct');
            assertExpandable(structureVar.item, 'Value structure');

            const valueVar = await getMemberOf(structureVar, 'value')
            assert.match(valueVar.item.description, intRegexp(1),
                         'Displayed value of "value" member is not valid');
            assertNotExpandable(valueVar.item, 'Scalar members');
        });

        /* Pointer variable to structure */
        test('Structure[pointer]', async () => {
            const structureVar = await getVarItem('pointer_struct');
            assertExpandable(structureVar.item, 'Value structure');
            const valueVar = await getMemberOf(structureVar, 'value');
            assert.match(valueVar.item.description, intRegexp(1),
                         'Displayed value of "value" member is not valid');
            assertNotExpandable(valueVar.item, 'Scalar members');
        });

        /* Member is pointer to structure */
        test('Member[pointer]', async () => {
            const variable = await getVarItem('pointer_member');
            assertExpandable(variable.item, 'Pointer member');

            const valueMember = await getMemberOf(variable, 'value');
            assertExpandable(valueMember.item, 'Structure pointer');

            const valuePointerMember = await getMemberOf(valueMember, 'value');
            assert.match(valuePointerMember.item.description, intRegexp(1),
                         'Value of member of pointer member is not valid');
        });

        /* Member is embedded/value structure */
        test('Member[embedded]', async () => {
            const embeddedVar = await getVarItem('embedded_member');
            assertExpandable(embeddedVar.item, 'Structure');
            
            const valueMember = await getMemberOf(embeddedVar, 'value');
            assertExpandable(valueMember.item, 'Embedded value structure');
    
            const embeddedValueMember = await getMemberOf(valueMember, "value");
            assertNotExpandable(embeddedValueMember.item, 'Scalar member');
            assert.match(embeddedValueMember.item.description, intRegexp(1),
                         'Value of "value" member is not valid');
        });

        /* Member is array */
        test('Member[array]', async () => {
            const structureVar = await getVarItem('fixed_size_array_member');
            assertExpandable(structureVar.item, 'Structure');
    
            const arrayMember = await getMemberOf(structureVar, 'array');
            assertExpandable(arrayMember.item, 'Fixed size array');

            const arrayElements = await expand(arrayMember);
            assert.equal(arrayElements.length, 16, 'Array must contain 16 elements');

            for (const [i, element] of arrayElements.entries()) {
                assert.match(element.item.description, intRegexp(i + 1),
                             `Array element at ${i} does not contain valid value`);
            }
        });

        /* Member is flexible array */
        test('Member[flexible array]', async () => {
            const structureVar = await getVarItem('flexible_array_member');
            assertExpandable(structureVar.item, 'Structure');

            const {item} = await getMemberOf(structureVar, 'array');
            assertNotExpandable(item, 'Flexible array member');
        });
    });

    /* Tests for Node variables special handling */
    suite('Node variables', async () => {
        /* Reveal basic Node* type according to NodeTag */
        test('NodeTag observed', async () => {
            /* node: Node *[PlannerInfo] */
            const {var: nodeVar, item} = await getVarItem('node');
            assert.match(item.getType(), /PlannerInfo/, 'Real NodeTag is not shown');
            const children = await getMemberOf(nodeVar, 'parse');
            assert.ok(children, 'Members of Node variables must be same as real type');
        });

        /* Show elements of array and additionally reveal Node types */
        test('List', async () => {
            /* list = [T_PlannerInfo, T_Query, T_List] */
            const childrenItems = await expand(getVar('list'));
            const elementsMember = getMember(childrenItems, '$elements$');

            const listElements = await expand(elementsMember);
            assert.equal(listElements.length, 3,
                         '$elements$ does not contains all list members');

            const isOfNodeType = async (index: number, type: string) => {
                const item = listElements[index].item;
                assert.match(item.getType(), new RegExp(type), 
                            `List element at ${index} is not of actual type`);
            }

            await isOfNodeType(0, 'PlannerInfo');
            await isOfNodeType(1, 'Query');
            await isOfNodeType(2, 'List');
        });

        /* List with non-pointer elements */
        test('List[Int]', async () => {
            /* int_list = [1, 2, 4, 8] */
            const elementsMember = await getMemberOf(getVar('int_list'), '$elements$');
            const listElements = await expand(elementsMember);
            assert.equal(listElements.length, 4,
                         '$elements$ does not contains all list members');

            const elementsValues = listElements.map(x => x.item.description);
            assert.deepEqual(elementsValues, ['1', '2', '4', '8'],
                            'values of IntList are not valid');
        });

        /* Bitmapset elements shown correctly */
        test('Bitmapset', async () => {
            /* 
            * bms: Bitmapset *
            * - $length$     5
            * - $elements$
            *   - 5
            *   - 6
            *   - 7
            *   - 8
            *   - 9
            */
            const childrenItems = await expand(getVar('bms'));
            const lengthMember = getMember(childrenItems, '$length$');
            assert.match(lengthMember.item.description, intRegexp(5),
                         '$length$ member contains not valid value');
            
            const elementsMember = getMember(childrenItems, '$elements$');
            const elements = await expand(elementsMember);
            const values = elements.map(v => v.item.description);
            assert.deepEqual(values, ['5', '6', '7', '8', '9'],
                            'Bitmapset does not contains valid numbers');
        });

        /* Relids shows numbers and point to RelOptInfo/RangeTblEntry */
        test('Relids', async () => {
            /* 
             * root->allbaserels: Relids [Bitmapset *]
             * $length$       2
             * - $elements$
             *   - 1
             *     - RelOptInfo
             *     - RangeTblEntry
             *   - 2
             *     - RelOptInfo
             *     - RangeTblEntry
             */
            const rootVar = getVar('root');
            const allBaseRels = await getMemberOf(rootVar, 'all_baserels');
            const allBaseRelsChildren = await expand(allBaseRels);

            const lengthMember = getMember(allBaseRelsChildren, '$length$');
            assert.match(lengthMember.item.description, intRegexp(2),
                         'Number of elements must be 2')

            const elementsMember = getMember(allBaseRelsChildren, '$elements$');
            const allBaseRelsElements = await expand(elementsMember);
            const relids = allBaseRelsElements.map(i => i.item.description);
            assert.deepEqual(relids, ['1', '2'], 'Invalid values for relids');

            /* Check each has link to 'RelOptInfo' and 'RangeTblEntry' */
            for (const [i, pair] of allBaseRelsElements.entries()) {
                const children = await expand(pair);
                assert.ok(children.find(x => x.item.getType()
                                                   .indexOf('RelOptInfo') !== -1),
                          `No RelOptInfo link for relid ${relids[i]}`);
                assert.ok(children.find(x => x.item.getType()
                                                   .indexOf('RangeTblEntry') !== -1),
                          `No RangeTblEntry link for relid ${relids[i]}`);
            }
        });

        /* Array members are rendered as actual array */
        test('Array members', async () => {
            const rootVar = getVar('root');
            const arrayVar = await getMemberOf(rootVar, 'simple_rte_array');
            const arrayElements = await expand(arrayVar);
            assert.equal(arrayElements.length, 4,
                         'simple_rte_array must contain 4 entries');
        });

        /* RestrictInfo and Expr is rendered instead of pointer value */
        test('RestrictInfo', async () => {
            const exprRegexp = /t1\.y > 10/i;

            const {var: rinfoVar, item: rinfoItem} = await getVarItem('rinfo');
            assert.match(rinfoItem.description, exprRegexp,
                         'RestrictInfo expression is not rendered in description');

            const clauseVar = await getMemberOf(rinfoVar, 'clause');
            const {item: exprItem} = await getMemberOf(clauseVar, '$expr$');
            assert.match(exprItem.description, exprRegexp,
                         '$expr$ member does not contain valid expression');
        });
    });
    
    suite('Config file', async () => {
        /* List with Non-Node pointer array elements */
        test('List[CustomPtr]', async () => {
            /* list = [{value: 1}, {value: 2}, {value: 3}] */

            /* Check variable */
            let elementsMember = await getMemberOf(getVar('custom_list'), '$elements$');
            const elements = await expand(elementsMember);
            assert.equal(elements.length, 3,
                         '$elements$ of variable does not contains all list members');
            
            for (const [i, element] of elements.entries()) {
                const valueMember = await getMemberOf(element, 'value');
                assert.match(valueMember.item.description, intRegexp(i + 1),
                             `Element at ${i} does not contain valid value for variable`);
            }

            /* Check member */
            const valueMember = await getMemberOf(getVar('custom_list_variable'), 'value');
            elementsMember = await getMemberOf(valueMember, '$elements$');
            assert.equal(elements.length, 3,
                         '$elements$ of member does not contains all list members');

            for (const [i, element] of elements.entries()) {
                const valueMember = await getMemberOf(element, 'value');
                assert.match(valueMember.item.description, intRegexp(i + 1),
                             `Element at ${i} does not contain valid value for member`);
            } 
        });

        /* Array members are rendered as actual array */
        test('Array members', async () => {
            /*
             * array_field = [1, 2] 
             * array_expr  = [1, 2, 4, 8]
             */
            const arrayMemberVar = getVar('array_member');

            const getArrayElementsOf = async (field: string) => {
                const arrayMember = await getMemberOf(arrayMemberVar, field);
                const elements = await expand(arrayMember);
                return elements.map(x => x.item.description.trim());
            }

            const arrayFieldElements = await getArrayElementsOf('array_field');
            assert.deepStrictEqual(['1', '2'], arrayFieldElements,
                                    'array_field contains 2 elements: 1, 2');
            
            const arrayExprElements = await getArrayElementsOf('array_expr');
            assert.deepStrictEqual(['1', '2', '4', '8'], arrayExprElements,
                                    'array_expr contains 4 elements: 1, 2, 4, 8');
        });
        
        /* User defined aliases */
        test('Alias', async () => {
            const exprRegexp = /t1\.y > 10/i;
            const exprReprVar = await getMemberOf(getVar('expr_alias'), '$expr$');
            assert.match(exprReprVar.item.description, exprRegexp,
                         'Alias must be expanded and handled as original type');
        });

        /* Hash table elements are shown */
        test('HTAB', async function() {
            const elementsVar = await getMemberOf(getVar('htab'), '$elements$');
            const elementsChildren = await expand(elementsVar);
            assert.equal(elementsChildren.length, 3, 'HTAB must contain 3 elements');

            const htabElements = [];
            for (const pair of elementsChildren) {
                const x = await expand(pair);
                htabElements.push({
                    key: getMember(x, 'key').item.description,
                    value: getMember(x, 'value').item.description
                });
            }
            assert.deepEqual(
                new Set(htabElements), 
                new Set([
                    {key: '1', value: '2'}, 
                    {key: '10', value: '4'}, 
                    {key: '20', value: '8'}
                ]),
                'Shown elements of HTAB are not ones that stored');
        });

        /* Simplehash elements are shown */
        test('Simplehash', async function() {
            if (!env.pgVersionSatisfies('10')) {
                /* 9.6 does not support simple hash */
                this.skip();
            }

            const elementsVar = await getMemberOf(getVar('simplehash'), '$elements$');
            const elementsChildren = await expand(elementsVar);
            assert.equal(elementsChildren.length, 3, 'simple hash must contain 3 elements');

            const htabElements = [];
            for (const pair of elementsChildren) {
                const x = await expand(pair);
                htabElements.push({
                    key: getMember(x, 'key').item.description,
                    value: getMember(x, 'value').item.description
                });
            }
            assert.deepEqual(
                new Set(htabElements), 
                new Set([
                    {key: '1', value: '2'}, 
                    {key: '10', value: '4'}, 
                    {key: '20', value: '8'}
                ]),
                'Shown elements of simplehash are not ones that stored');
        });

    })
});
