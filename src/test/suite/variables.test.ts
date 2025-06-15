import * as assert from 'assert';
import * as vscode from 'vscode';
import * as pg from 'pg';
import { Configuration, NodePreviewTreeViewProvider } from '../../extension';
import * as vars from '../../variables';

class TreeItemWrapper {
    label: string;
    description: string;
    constructor(treeItem: vscode.TreeItem) {
        this.label = treeItem.label?.toString().trim() ?? '';
        this.description = treeItem.description?.toString().trim() ?? '';
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
}

interface VarTreeItemPair {
    var: vars.Variable;
    item: TreeItemWrapper;
};

interface TestEnv {
    /* Version of Postgresql being tested */
    pgVersion: string;
    /* Version of VS Code we are running on */
    vscodeVersion: string;
    /* Debugger extension is used */
    debugger: 'cppdbg' | 'lldb';
}

function getTestEnv(): TestEnv {
    const pgVersion = process.env.PGHH_PG_VERSION ?? '17.4';
    const vscodeVersion = process.env.PGHH_VSCODE_VERSION ?? 'stable';
    const dbg = process.env.PGHH_DEBUGGER ?? 'cppdbg';
    if (!(dbg === 'cppdbg' || dbg === 'lldb')) {
        throw new Error(`Unknown type of debugger: ${dbg}`);
    }

    return {
        pgVersion,
        vscodeVersion,
        debugger: dbg
    }
}

function getDebugConfiguration(env: TestEnv, pid: number): vscode.DebugConfiguration {
    if (env.debugger === 'cppdbg') {
        return {
            name: 'Backend',
            request: 'attach',
            type: 'cppdbg',
            processId: pid,
            program: '${workspaceFolder}/src/backend/postgres',
        };
    } else {
        return {
                name: 'Backend',
                request: 'attach',
                type: 'lldb',
                pid: pid,
                program: '${workspaceFolder}/src/backend/postgres',
        };
    }
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
        throw new Error('failed to find position in vscodehelper.c for breakpoint - no return statement found');
    }

    return new vscode.Location(sourceFile, new vscode.Position(lineNumber, 0));
}

const sleep = async (ms: number) => await new Promise(r => setTimeout(r, ms));
const execCommand = vscode.commands.executeCommand;
const execGetTreeViewProvider = async () => {
    return await execCommand<NodePreviewTreeViewProvider>(
                                Configuration.Commands.GetTreeViewProvider);
}
const execGetVariables = async () => {
    return await execCommand<vars.Variable[] | undefined>(
                                Configuration.Commands.GetVariables);
}

suite('Node variables', async () => {
    let variables: vars.Variable[] | undefined;
    const client = new pg.Client({
        /* TODO: move to env */
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        user: 'postgres'
    });
    /* There must be only 1 workspace */
    const workspace = vscode.workspace.workspaceFolders![0];
    const env = getTestEnv();

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

        /* 
         * Register some types used for debugging.
         * 
         * This is done without configuration file involving, because that
         * logic can be broken.
         */
        const treeViewProvider = await execGetTreeViewProvider();
        if (!treeViewProvider) {
            throw new Error('Failed to get NodeTreeViewProvider');
        }
        if (!treeViewProvider.execContext) {
            throw new Error('ExecContext of NodeTreeViewProvider does not exist');
        }
        treeViewProvider.execContext.hashTableTypes.addHTABTypes([
            {
                parent: 'vscode_test_helper',
                member: 'htab',
                type: 'TestHtabEntry *'
            }
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

            if (maxAttempt <= attempt) {
                throw new Error('failed to obtain postgres variables');
            }
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

    const mapTreeItems = async (v: vars.Variable) => {
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
        assert.ok(pair !== undefined, `Failed to find ${name} member`);
        return pair;
    }
    /* Reveal basic Node* type according to NodeTag */
    test('NodeTag observed', async () => {
        /* 
         * node: Node *[PlannerInfo]
         */
        const nodeVar = getVar('node');
        const item = new TreeItemWrapper(await nodeVar.getTreeItem());
        assert.notEqual(item.getType().indexOf('PlannerInfo'), -1, 'Real NodeTag is not shown');
        const children = await nodeVar.getChildren();
        assert.ok(children !== undefined, 'Failed to get children of "node" variable')
        assert.ok(children.length > 1, 'Children of "node" variable must be same as for real type');
    });

    /* Show elements of array and additionally reveal Node types */
    test('List', async () => {
        /* list = [T_PlannerInfo, T_Query, T_List] */
        const childrenItems = await mapTreeItems(getVar('list'));
        const elementsMember = getMember(childrenItems, '$elements$');

        const listElements = await elementsMember.var.getChildren();
        assert.ok(listElements !== undefined, '$elements$ member does not exist');
        assert.equal(listElements.length, 3, '$elements$ does not contains all list members');

        const isOfNodeType = async (index: number, type: string) => {
            const item = new TreeItemWrapper(await listElements[index].getTreeItem());
            assert.match(item.getType(), new RegExp(type), 
                         `List element in index ${index} must be of type ${type}, but have ${item.getType()}`);
        }

        await isOfNodeType(0, 'PlannerInfo');
        await isOfNodeType(1, 'Query');
        await isOfNodeType(2, 'List');
    });

    /* List with non-pointer elements */
    test('IntList', async () => {
        /* int_list = [1, 2, 4, 8] */
        const childrenItems = await mapTreeItems(getVar("int_list"));
        const elementsMember = getMember(childrenItems, '$elements$');
        const listElements = await mapTreeItems(elementsMember.var);
        assert.equal(listElements.length, 4, '$elements$ does not contains all list members');

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
        const childrenItems = await mapTreeItems(getVar('bms'));
        const elementsMember = getMember(childrenItems, '$elements$');
        const lengthMember = getMember(childrenItems, '$length$');

        assert.equal(lengthMember.item.description, '5',
                     '$length$ member contains not valid value');

        const elements = await mapTreeItems(elementsMember.var);
        const values = elements.map(v => v.item.description);
        assert.deepEqual(values, ['5', '6', '7', '8', '9'],
                         'Bitmapset does not contains valid numbers');
    });

    /* Relids shows numbers and point to RelOptInfo/RangeTblEntry */
    test('Relids', async () => {
        /* 
         * relids: Relids [Bitmapset *]
         * $length$       2
         * - $elements$
         *   - 1
         *     - RelOptInfo
         *     - RangeTblEntry
         *   - 2
         *     - RelOptInfo
         *     - RangeTblEntry
         */
        const allQueryRels = getVar('all_query_rels', await getVar('root').getChildren());
        const allQueryRelsChildren = await mapTreeItems(allQueryRels);
        const allQueryRelsElementsVar = getMember(allQueryRelsChildren, '$elements$');
        const allQueryRelsLengthVar = getMember(allQueryRelsChildren, '$length$');
        assert.equal(allQueryRelsLengthVar.item.description, '2', 'Number of elements must be 2')

        const allQueryRelsElements = await mapTreeItems(allQueryRelsElementsVar.var);
        const relids = allQueryRelsElements.map(i => i.item.description);
        assert.deepEqual(relids, ['1', '2'], 
                         'root->all_query_rels does not contain all Bitmapset elements');
        
        const relidsChildren = [];
        for (const pair of allQueryRelsElements) {
            const children = await mapTreeItems(pair.var);
            relidsChildren.push(children);
        }

        for (const [i, arr] of relidsChildren.entries()) {
            const rel = arr.find(x => x.item.getType().indexOf('RelOptInfo') !== -1);
            const rte = arr.find(x => x.item.getType().indexOf('RangeTblEntry') !== -1);
            assert.ok(rel !== undefined, `No RelOptInfo link for relid ${relids[i]}`);
            assert.ok(rte !== undefined, `No RangeTblEntry link for relid ${relids[i]}`);
        }
    });

    /* Hash table elements are shown */
    test('HTAB', async function() {
        if (env.debugger === 'lldb') {
            /* CodeLLDB has troubles with 'HASH_SEQ_STATUS' structure (ambiguity) */
            this.skip();
        }

        const elementsVar = getMember(await mapTreeItems(getVar('htab')), '$elements$');
        const elementsChildren = await mapTreeItems(elementsVar.var);
        assert.equal(elementsChildren.length, 3, 'HTAB must contain 3 elements');

        const htabElements = [];
        for (const pair of elementsChildren) {
            const x = await mapTreeItems(pair.var);
            htabElements.push({
                key: getMember(x, 'key').item.description,
                value: getMember(x, 'value').item.description
            });
        }
        assert.deepEqual(new Set(htabElements), 
            new Set([
                {key: '1', value: '2'}, 
                {key: '10', value: '4'}, 
                {key: '20', value: '8'}
            ]),
            'Shown elements of HTAB are not ones that stored');
    });

    /* Array members are rendered as actual array */
    test('Array members', async () => {
        const rootVar = getVar('root');
        const simpleRteArrayVar = getMember(await mapTreeItems(rootVar), 'simple_rte_array');
    
        const simpleRteArrayElements = await mapTreeItems(simpleRteArrayVar.var);
        assert.equal(simpleRteArrayElements.length, 4, 'simple_rte_array must contain 4 entries');
    });

    /* RestrictInfo and Expr is rendered instead of pointer value */
    test('RestrictInfo', async () => {
        let expr;
        if (env.debugger === 'cppdbg') {
            expr = /t1\.y > 10/i;
        } else {
            /* CodeLLDB has troubles with 'getTypeOutputInfo' invocation */
            expr = /t1\.y > \?\?\?/i;
        }
        const rinfoVar = getVar('rinfo');
        const item = new TreeItemWrapper(await rinfoVar.getTreeItem());
        assert.match(item.description, expr, 'RestrictInfo expression is not rendered in description');

        const clauseVar = getMember(await mapTreeItems(rinfoVar), 'clause');
        const pseudoExprMember = getMember(await mapTreeItems(clauseVar.var), '$expr$');
        assert.match(pseudoExprMember.item.description, expr, '$expr$ member does not contain valid expression');
    });
});
