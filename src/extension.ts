import * as vscode from 'vscode';
import * as utils from './utils';
import { Features } from './utils';
import * as vars from './variables';
import * as constants from './constants';
import * as dbg from './debugger';
import * as dap from './dap';
import path from 'path';


function createDebuggerFacade(type: string, provider: NodePreviewTreeViewProvider): dbg.GenericDebuggerFacade | undefined {
    let debug;
    switch (type) {
        case 'cppdbg':
            debug = new dbg.CppDbgDebuggerFacade(provider.log);
            if (!Features.hasEvaluateArrayLength()) {
                debug.switchToManualArrayExpansion();
            }
            break;
        case 'lldb':
            debug = new dbg.CodeLLLDBDebuggerFacade(provider.log);
            break;
        default:
            return;
    }
    if (Features.debugFocusEnabled()) {
        vscode.debug.onDidChangeActiveStackItem(() => provider.refresh(),
                                                 undefined, debug.registrations);
    } else {
        debug.switchToEventBasedRefresh();
    }

    return debug;
}

export class NodePreviewTreeViewProvider implements vscode.TreeDataProvider<vars.Variable>, vscode.Disposable {
    subscriptions: vscode.Disposable[] = [];

    /* 
     * Representation of parsed configuration file.
     * Used to seed ExecContext during initialization.
     */
    configFile?: ConfigFile;

    /**
     * ExecContext used to pass to all members.
     * Updated on each debug session start/end.
     */
    execContext?: vars.ExecContext;

    constructor(public log: utils.ILogger,
                private nodeVars: vars.NodeVarRegistry) { 
        this.subscriptions = [
            vscode.debug.onDidStartDebugSession(s => {
                if (!this.execContext) {
                    const debug = createDebuggerFacade(s.type, this);
                    if (!debug) {
                        return;
                    }

                    this.execContext = new vars.ExecContext(this.nodeVars, debug);
                }
            }),
            vscode.debug.onDidTerminateDebugSession(s => {
                if (this.execContext) {
                    /* I know the hierarchy for sure - no surprises */
                    const debug = <dbg.GenericDebuggerFacade>this.execContext.debug;
                    debug.dispose();
                    this.execContext = undefined;
                }
            }),
        ];
    }

    /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
    private _onDidChangeTreeData = new vscode.EventEmitter<vars.Variable | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this.execContext?.step.reset();
        this._onDidChangeTreeData.fire();
    }

    async getTreeItem(variable: vars.Variable) {
        return variable.getTreeItem();
    }
    
    initializeExecContextFromConfig(context: vars.ExecContext) {
        if (!this.configFile) {
            return;
        }
        
        const config = this.configFile;
        
        if (config.arrayInfos?.length) {
            this.log.debug('adding %i array special members from config file', config.arrayInfos.length);
            try {
                context.specialMemberRegistry.addArraySpecialMembers(config.arrayInfos);
            } catch (err) {
                this.log.error('could not add custom array special members', err);
            }
        }

        if (config.aliasInfos?.length) {
            this.log.debug('adding %i aliases from config file', config.aliasInfos.length);
            try {
                context.nodeVarRegistry.addAliases(config.aliasInfos);
            } catch (err) {
                this.log.error('could not add aliases from configuration', err);
            }
        }

        if (config.customListTypes?.length) {
            this.log.debug('adding %i custom list types', config.customListTypes.length);
            try {
                context.specialMemberRegistry.addListCustomPtrSpecialMembers(config.customListTypes);
            } catch (e) {
                this.log.error('error occurred during adding custom List types', e);
            }
        }

        if (config.htabTypes?.length) {
            this.log.debug('adding %i htab types', config.htabTypes.length);
            try {
                context.hashTableTypes.addHTABTypes(config.htabTypes);
            } catch (e) {
                this.log.error('error occurred during adding custom HTAB types', e);
            }
        }

        if (config.simpleHashTableTypes?.length) {
            this.log.debug('adding %i simplehash types', config.simpleHashTableTypes.length);
            try {
                context.hashTableTypes.addSimplehashTypes(config.simpleHashTableTypes);
            } catch (e) {
                this.log.error('error occurred during adding custom simple hash table types', e);
            }
        }
        
        if (config.bitmaskEnumMembers?.length) {
            this.log.debug('adding %i enum bitmask types', config.bitmaskEnumMembers.length);
            try {
                context.specialMemberRegistry.addFlagsMembers(config.bitmaskEnumMembers);
            } catch (e) {
                this.log.error('error occurred during adding enum bitmask types', e);
            }
        }
    }

    initializeExecContext() {
        const context = this.execContext!;

        /* Initialize using default builtin values */
        const sm = context.specialMemberRegistry;
        sm.addArraySpecialMembers(constants.getArraySpecialMembers());
        sm.addListCustomPtrSpecialMembers(constants.getKnownCustomListPtrs());
        sm.addFlagsMembers(constants.getWellKnownFlagsMembers());

        const hash = context.hashTableTypes;
        hash.addHTABTypes(constants.getWellKnownHTABTypes());
        hash.addSimplehashTypes(constants.getWellKnownSimpleHashTableTypes());
        
        /* Initialize using configuration file */
        this.initializeExecContextFromConfig(context);   
    }

    async getChildren(element?: vars.Variable | undefined) {
        if (!this.execContext) {
            return;
        }

        try {
            if (element) {
                return await element.getChildren();
            } else {
                const frameId = await this.execContext.debug.getCurrentFrameId();
                if (!frameId) {
                    return;
                }

                this.initializeExecContext();

                const context = this.execContext;
                const topLevel = await this.getTopLevelVariables(context, frameId);
                if (!topLevel) {
                    return;
                }

                const topLevelVariable = new vars.VariablesRoot(topLevel, context, this.log);
                topLevel.forEach(v => v.parent = topLevelVariable);
                return topLevel;
            }
        } catch (err) {
            /* 
             * There may be race condition when our state of debugger 
             * is 'ready', but real debugger is not. Such cases include
             * debugger detach, continue after breakpoint etc. 
             * (we can not send commands to debugger).
             * 
             * In this cases we must return empty array - this will 
             * clear our tree view.
             */
            if (err instanceof Error &&
                err.message.indexOf('No debugger available') !== -1) {
                return;
            }
        }
    }

    async getTopLevelVariables(context: vars.ExecContext, frameId: number) {
        const variables = await context.debug.getVariables(frameId);
        return await vars.Variable.mapVariables(variables, frameId, context,
            this.log, undefined);
    }

    dispose() {
        this.subscriptions.forEach(s => s.dispose());
        this.subscriptions = [];
    }
}

export async function dumpVariableToLogCommand(args: any, log: utils.ILogger,
                                               debug: dbg.IDebuggerFacade) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }

    const variable: dap.DebugVariable = args.variable;

    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        vscode.window.showWarningMessage(`Could not get current stack frame id in order to invoke 'pprint'`);
        return;
    }

    if (!(debug.isValidPointerType(variable))) {
        vscode.window.showWarningMessage(`Variable ${variable.value} is not valid pointer`);
        return;
    }

    const expression = `pprint((const void *) ${debug.getPointer(variable)})`;
    try {
        await debug.evaluate(expression,
                             frameId, 
                             undefined  /* context */, 
                             true       /* no return */);
    } catch (err: any) {
        log.error('could not dump variable %s to log', variable.name, err);
        vscode.window.showErrorMessage(`Could not dump variable ${variable.name}. `
                                     + 'See errors in Output log');
    }
}

export async function dumpVariableToDocumentCommand(variable: dap.DebugVariable,
                                                    log: utils.ILogger,
                                                    debug: dbg.IDebuggerFacade) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        return;
    }

    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        vscode.window.showWarningMessage(`Could not get current stack frame id to invoke functions`);
        return;
    }

    if (!(debug.isValidPointerType(variable))) {
        vscode.window.showWarningMessage(`Variable ${variable.value} is not valid pointer`);
        return;
    }

    /* 
     * In order to make node dump we use 2 functions:
     * 
     * 1. 'nodeToStringWithLocations' - dump arbitrary node object into string form
     * 2. 'pretty_format_node_dump' - prettify dump returned from 'nodeToString'
     * 
     * This sequence is well known and also used in 'pprint' itself, so feel
     * free to use it.
     */
    const nodeToStringExpr = `nodeToStringWithLocations((const void *) ${debug.getPointer(variable)})`;
    let response;
    try {
        response = await debug.evaluate(nodeToStringExpr, frameId);
    } catch (err: any) {
        log.error('could not dump variable %s to string', variable.name, err);
        vscode.window.showErrorMessage(`Could not dump variable ${variable.name}. `
                                     + 'See errors in Output log');
        return;
    }

    /* Save to pfree later */
    const savedNodeToStringPtr = response.memoryReference;

    const prettyFormatExpr = `pretty_format_node_dump((const char *) ${response.memoryReference})`;
    try {
        response = await debug.evaluate(prettyFormatExpr, frameId);
    } catch (err: any) {
        log.error('could not pretty print node dump', variable.name, err);
        vscode.window.showErrorMessage(`Could pretty print variable ${variable.name}. `
                                     + 'See errors in Output log');
        return;
    }

    const debugVariable: dbg.IDebugVariable = {
        type: response.type,
        value: response.result,
        memoryReference: response.memoryReference,
    }
    const ptr = debug.extractPtrFromString(debugVariable);
    const node = await debug.extractLongString(debugVariable, frameId);

    /*
     * Perform pfree'ing ONLY after extracting string, otherwise there will
     * be garbage '\\177' in string buffer.
     */
    try {
        await debug.evaluate(`pfree((const void *) ${ptr})`, frameId,
                             undefined, true);
        await debug.evaluate(`pfree((const void *) ${savedNodeToStringPtr})`, frameId,
                             undefined, true);           
    } catch (err: any) {
        /* This is not critical error actually, so just log and continue */
        log.error('could not dump variable %s to log', variable.name, err);
    }

    if (node === null) {
        vscode.window.showErrorMessage('Could not obtain node dump: NULL is returned from nodeToString');
        return;
    }

    /* 
     * Finally, show document with node dump.  It would be nice to also set
     * appropriate title, but I don't known how to do it without saving file.
     */
    const document = await vscode.workspace.openTextDocument({content: node});
    vscode.window.showTextDocument(document);
}

export class ConfigFile {
    /* Array special members */
    arrayInfos?: vars.ArraySpecialMemberInfo[];
    /* Information about type aliases */
    aliasInfos?: vars.AliasInfo[];
    /* Path to custom typedef's file */
    typedefs?: string[];
    /* Custom List types */
    customListTypes?: vars.ListPtrSpecialMemberInfo[];   
    /* Types stored in HTABs */
    htabTypes?: vars.HtabEntryInfo[];
    /* Types for simple hash */
    simpleHashTableTypes?: vars.SimplehashEntryInfo[];
    /* Enum values for integer fields */
    bitmaskEnumMembers?: vars.BitmaskMemberInfo[];
}

function parseConfigurationFile(configFile: any): ConfigFile | undefined {
    const parseArraySm1 = (obj: any): vars.ArraySpecialMemberInfo | undefined => {
        if (!(obj && typeof obj === 'object' && obj !== null)) {
            return;
        }
        
        let nodeTag = obj.nodeTag;
        if (!nodeTag) {
            vscode.window.showErrorMessage('"nodeTag" field not provided');
            return;
        }

        if (typeof nodeTag !== 'string') {
            vscode.window.showErrorMessage(`nodeTag type must be string, given: ${typeof nodeTag}`);
            return;
        }

        nodeTag = nodeTag.trim().replace('T_', '');

        /* NodeTag used also as type name, so it must be valid identifier */
        if (!utils.isValidIdentifier(nodeTag)) {
            vscode.window.showErrorMessage(`nodeTag must be valid identifier. given: ${obj.nodeTag}`);
            return;
        }

        let memberName = obj.memberName;
        if (!memberName) {
            vscode.window.showErrorMessage(`"memberName" field not provided for type with NodeTag: ${obj.nodeTag}`);
            return;
        }

        if (typeof memberName !== 'string') {
            vscode.window.showErrorMessage(`"memberName" field must be string for type with NodeTag: ${obj.nodeTag}`);
            return;
        }

        memberName = memberName.trim();
        if (!utils.isValidIdentifier(memberName)) {
            vscode.window.showErrorMessage(`"memberName" field ${memberName} is not valid identifier`);
            return;
        }

        let lengthExpr = obj.lengthExpression;
        if (!lengthExpr) {
            vscode.window.showErrorMessage(`lengthExpression not provided for: ${obj.nodeTag}->${memberName}`);
            return;
        }

        if (typeof lengthExpr !== 'string') {
            vscode.window.showErrorMessage(`lengthExpression field must be string for: ${obj.nodeTag}->${memberName}`);
            return;
        }

        lengthExpr = lengthExpr.trim();
        if (!lengthExpr) {
            vscode.window.showErrorMessage('lengthExpression can not be empty string');
            return;
        }

        return {
            typeName: nodeTag,
            memberName,
            lengthExpr,
        }
    }

    const parseArraySm2 = (obj: any): vars.ArraySpecialMemberInfo | undefined => {
        if (!(obj && typeof obj === 'object' && obj !== null)) {
            return;
        }
        
        let typeName = obj.typeName;
        if (!typeName) {
            vscode.window.showErrorMessage('"typeName" field not provided');
            return;
        }

        if (typeof typeName !== 'string') {
            vscode.window.showErrorMessage(`"typeName" type must be string, given: ${typeof typeName}`);
            return;
        }

        typeName = typeName.trim();

        /* NodeTag used also as type name, so it must be valid identifier */
        if (!utils.isValidIdentifier(typeName)) {
            vscode.window.showErrorMessage(`typeName must be valid identifier. given: ${typeName}`);
            return;
        }

        let memberName = obj.memberName;
        if (!memberName) {
            vscode.window.showErrorMessage(`memberName field not provided for type: ${typeName}`);
            return;
        }

        if (typeof memberName !== 'string') {
            vscode.window.showErrorMessage(`memberName field must be string for type: ${typeName}`);
            return;
        }

        memberName = memberName.trim();
        if (!utils.isValidIdentifier(memberName)) {
            vscode.window.showErrorMessage(`memberName field ${memberName} is not valid identifier`);
            return;
        }

        let lengthExpr = obj.lengthExpression;
        if (!lengthExpr) {
            vscode.window.showErrorMessage(`lengthExpression not provided for: ${typeName}->${memberName}`);
            return;
        }

        if (typeof lengthExpr !== 'string') {
            vscode.window.showErrorMessage(`lengthExpression field must be string for: ${typeName}->${memberName}`);
            return;
        }

        lengthExpr = lengthExpr.trim();
        if (!lengthExpr) {
            vscode.window.showErrorMessage('lengthExpression can not be empty string');
            return;
        }
        return {
            typeName,
            memberName,
            lengthExpr,
        }
    }

    const parseAliasV2 = (obj: any): vars.AliasInfo | undefined => {
        if (typeof obj !== 'object') {
            return;
        }

        if (!(obj.alias && typeof obj.alias === 'string')) {
            vscode.window.showErrorMessage(`"alias" field must be string. given: ${typeof obj.alias}`);
            return;
        }

        const alias = obj.alias.trim();
        if (!alias) {
            vscode.window.showErrorMessage(`"alias" field must not be empty`);
            return;
        }

        if (!(obj.type && typeof obj.type === 'string')) {
            vscode.window.showErrorMessage(`"type" field must be string. given: ${typeof obj.type}`);
            return;
        }

        const type = obj.type.trim();
        if (!type) {
            vscode.window.showErrorMessage(`"type" field must not be empty`);
            return;
        }

        return {
            alias,
            type,
        }
    }

    const parseTypedefs = (obj: any): string[] | undefined => {
        if (!obj) {
            return;
        }

        if (typeof obj === 'string') {
            return [obj.trim()];
        } else if (Array.isArray(obj)) {
            return obj.map(x => x.toString());
        }
    }

    const parseListTypes = (obj: any): vars.ListPtrSpecialMemberInfo[] | undefined => {
        /* 
         * [
         *     {
         *         "type": "string",
         *         "member": ["string", "string"],
         *         "variable": ["string", "string"]
         *     }
         * ]
         */
        if (!Array.isArray(obj)) {
            return;
        }

        const elements: vars.ListPtrSpecialMemberInfo[] = [];
        for (const o of obj) {
            if (!(typeof o === 'object' && o)) {
                continue;
            }

            const type = o.type;
            if (typeof type !== 'string' && type) {
                vscode.window.showErrorMessage(`"type" field must be non-empty string. given ${typeof type}`);
                continue;
            }

            let memberEntry: [string, string] | undefined;
            if (Array.isArray(o.member) && o.member.length === 2) {
                const struct = o.member[0];
                const member = o.member[1];
                if (!(typeof struct === 'string' && typeof member === 'string' &&
                             struct              &&        member)) {
                    vscode.window.showErrorMessage(`"member" entry should be array of struct and member strings. given: [${typeof struct}, ${typeof member}]`);
                    continue;
                }

                memberEntry = [struct, member];
            }

            let variableEntry: [string, string] | undefined;
            if (Array.isArray(o.variable) && o.variable.length === 2) {
                const func = o.variable[0];
                const variable = o.variable[1];
                if (!(typeof func === 'string' && typeof variable === 'string' &&
                             func              &&        variable)) {
                    vscode.window.showErrorMessage(`"variable" entry should be array of function name and variable strings. given: [${typeof func}, ${typeof variable}]`);
                    continue;
                }

                variableEntry = [func, variable];
            }
            
            elements.push({
                type,
                member: memberEntry,
                variable: variableEntry
            })
        }

        return elements;
    }

    const parseHtabTypes = (obj: any): vars.HtabEntryInfo[] | undefined => {
        /*
         * {
         *     "parent": "string",
         *     "member": ["string", "string"],
         *     "variable": ["string", "string"]
         * }
         */
        const extractParentMember = (o: any): [string, string] | undefined => {
            if (!(Array.isArray(o) && o.length === 2)) {
                return;
            }

            const [parent, member] = o;
            if (typeof parent === 'string' && typeof member === 'string'
                    && parent              &&        member) {
                return [parent, member];
            }

            return;
        }

        if (!Array.isArray(obj)) {
            return;
        }

        const elements: vars.HtabEntryInfo[] = [];
        for (const o of obj) {
            if (!(o && typeof o === 'object')) {
                continue;
            }

            const type = o.type;
            if (typeof type !== 'string' && type) {
                continue;
            }

            let pair = extractParentMember(o.member);
            if (!pair) {
                pair = extractParentMember(o.variable);
            }
            
            if (!pair) {
                continue;
            }

            elements.push({
                type, 
                member: pair[1],
                parent: pair[0],
            });
        }

        return elements;
    }

    const parseSimplehashTypes = (obj: any): vars.SimplehashEntryInfo[] | undefined => {
        /* 
         * [
         *     {
         *         "prefix": "string",
         *         "type": "string"
         *     }
         * ]
         */

        if (!Array.isArray(obj)) {
            return;
        }

        const elements = [];
        for (const o of obj) {
            if (!(typeof o === 'object' && o)) {
                continue;
            }


            const prefix = o.prefix;
            const type = o.type;

            if (!(prefix && typeof prefix === 'string' &&
                  type && typeof type === 'string')) {
                continue;
            }

            elements.push({
                prefix,
                canIterate: true,
                elementType: type
            } as vars.SimplehashEntryInfo);
        }
        
        return elements;
    }
    
    const parseEnumBitmasks = (obj: any): vars.BitmaskMemberInfo[] | undefined => {
        /* 
         * "enums": [
         *      {
         *          "type": "ParentType",
         *          "member": "MemberName",
         *          "flags": [
         *              ["FIRST_MACRO", "0x01"],
         *              ["SECOND_MACRO", "0x02"],
         *          ],
         *          "fields": [
         *              {
         *                  "name": "Field Name",
         *                  "mask": "FIELD_MASK_MACRO",
         *                  "numeric": "0xF0"
         *              }
         *          ]
         *      }
         * ]
         */
        
        if (!Array.isArray(obj)) {
            return;
        }
        
        const members: vars.BitmaskMemberInfo[] = [];
        for (const o of obj) {
            const type = o.type;
            const member = o.member;
            if (typeof type !== 'string') {
                continue;
            }
            
            if (typeof member !== 'string') {
                continue;
            }
            
            const flags: vars.FlagMemberInfo[] = [];
            if (Array.isArray(o.flags)) {
                for (const flag of o.flags) {
                    if (!Array.isArray(flag)) {
                        continue;
                    }

                    if (!(flag.length === 1 || flag.length === 2)) {
                        continue;
                    }

                    if (typeof flag[0] !== 'string') {
                        continue;
                    }
                    
                    if (flag.length === 2 && typeof flag[1] !== 'string') {
                        continue;
                    }

                    flags.push({
                        flag: flag[0],
                        numeric: flag[1],
                    });
                }
            }
            
            const fields: vars.FieldMemberInfo[] = [];
            if (Array.isArray(o.fields)) {
                for (const f of o.fields) {
                    const name = f.name;
                    const mask = f.mask;
                    const numeric = f.numeric;
                    if (typeof name !== 'string') {
                        continue;
                    }
                    
                    if (typeof mask !== 'string') {
                        continue;
                    }
                    
                    if (numeric && typeof numeric !== 'string') {
                        continue;
                    }

                    fields.push({name, mask, numeric});
                }
            }
            
            if (fields || flags) {
                members.push({type, member, fields, flags});
            }
        }
        
        return members;
    }

    if (!(typeof configFile === 'object' && configFile)) {
        return;
    }

    const configVersion = Number(configFile.version);
    if (!(Number.isInteger(configVersion) && 1 <= configVersion && configVersion <= 5)) {
        vscode.window.showErrorMessage(`unknown version of config file: ${configFile.version}`);
        return;
    }

    const arrayMemberParser = configVersion == 1
        ? parseArraySm1
        : parseArraySm2;

    const arrayInfos = Array.isArray(configFile.specialMembers?.array) &&
                       configFile.specialMembers.array.length > 0
                ? configFile.specialMembers.array.map(arrayMemberParser).filter((a: any) => a !== undefined)
                : undefined;

    const aliasInfos = configVersion >= 2 &&
                       Array.isArray(configFile.aliases) &&
                       configFile.aliases.length > 0
                ? configFile.aliases.map(parseAliasV2).filter((a: any) => a !== undefined)
                : undefined;

    const typedefs = configVersion >= 3
                ? parseTypedefs(configFile.typedefs)
                : undefined;

    const customListTypes = configVersion >= 4
                ? parseListTypes(configFile.customListTypes)
                : undefined;

    const htabTypes = configVersion >= 5
                ? parseHtabTypes(configFile.htab)
                : undefined;
    
    const simpleHashTableTypes = configVersion >= 5
                ? parseSimplehashTypes(configFile.simplehash)
                : undefined;
                
    const bitmaskEnumMembers = configVersion >= 5
                ? parseEnumBitmasks(configFile.enums)
                : undefined;

    return {
        arrayInfos,
        aliasInfos,
        typedefs,
        customListTypes,
        htabTypes,
        simpleHashTableTypes,
        bitmaskEnumMembers,
    }
}

async function promptWorkspace() {
    if (!vscode.workspace.workspaceFolders) {
        throw new Error('No workspaces opened');
    }

    if (vscode.workspace.workspaceFolders.length === 1) {
        return vscode.workspace.workspaceFolders[0];
    }

    const name = await vscode.window.showQuickPick(
                        vscode.workspace.workspaceFolders.map(wf => wf.name), {
                            title: 'Choose workspace',
                            placeHolder: vscode.workspace.workspaceFolders[0].name
                        });
    if (!name) {
        throw new Error('No workspaces chosen');
    }

    return vscode.workspace.workspaceFolders.find(wf => wf.name === name)!;
}

async function promptExtensionName() {
    const extensionName = await vscode.window.showInputBox({
        prompt: 'Enter extension name'
    });
    if (!extensionName) {
        throw new Error('User did not specified extension name');
    }

    const workspace = await promptWorkspace();
    return {
        path: utils.getWorkspacePgSrcFile(workspace.uri, 'contrib', extensionName),
        name: extensionName,
    };
}

async function promptExtensionFlags() {
    async function promptFlag(title: string) {
        const result = await vscode.window.showQuickPick([
            'Yes', 'No'
        ], {title, placeHolder: 'Yes'});
        if (!result) {
            throw new Error('User declined to answer');
        }

        return result === 'Yes';
    }

    async function promptString(title: string) {
        const result = await vscode.window.showInputBox({
            prompt: title,
        });

        return result ?? '';
    }

    return {
        c: await promptFlag('Use C sources?'),
        sql: await promptFlag('Use SQL sources?'),
        tap: await promptFlag('Include TAP tests?'),
        regress: await promptFlag('Include regress tests?'),
        comment: await promptString('Enter extension description'),
    }
}

async function bootstrapExtensionCommand() {
    async function bootstrapFile(name: string, contents: string[]) {
        const filePath = utils.joinPath(path, name);
        await utils.writeFile(filePath, contents.join('\n'));
    }

    const {path, name} = await promptExtensionName();

    if (await utils.directoryExists(path)) {
        if (!await utils.directoryEmpty(path)) {
            vscode.window.showErrorMessage(`Extension ${name} directory already exists and is not empty`);
            return;
        }
    } else {
        await utils.createDirectory(path);
    }

    const flags = await promptExtensionFlags();

    /* 
     * Makefile
     * *.control
     * *.sql
     * *.c
     * README
     */
    const makefile = [];
    if (flags.c) {
        makefile.push(`EXTENSION = ${name}`,
                      '',
                      `MODULE_big = ${name}`,
                      `OBJS = $(WIN32RES) ${name}.o`,
                      '');
    }

    if (flags.sql) {
        makefile.push(`DATA = ${name}--0.1.0.sql`, '');
    }

    if (flags.regress) {
        makefile.push(`REGRESS = init`, '');
    }
    
    if (flags.tap) {
        makefile.push(`TAP_TESTS = 1`, '');
    }

    makefile.push(
        'ifdef USE_PGXS',
        'PG_CONFIG := pg_config',
        'PGXS := $(shell $(PG_CONFIG) --pgxs)',
        'include $(PGXS)',
        'else',
        `subdir = contrib/${name}`,
        'top_builddir = ../..',
        'include $(top_builddir)/src/Makefile.global',
        'include $(top_srcdir)/contrib/contrib-global.mk',
        'endif',
        ''
    );

    await bootstrapFile('Makefile', makefile);

    const control = [
        `# ${name} extension`,
        "default_version = '0.1.0'"
    ];

    if (flags.comment) {
        control.push(`comment = '${flags.comment}'`);
    }

    if (flags.c) {
        control.push(`module_pathname = '$libdir/${name}'`);
    }
    
    control.push('relocatable = false');
    await bootstrapFile(`${name}.control`, control);

    await bootstrapFile('README', [
        `# ${name}`,
        '',
        flags.comment
    ]);

    if (flags.c) {
        await bootstrapFile(`${name}.c`, [
            '#include "postgres.h"',
            '#include "fmgr.h"',
            '#include "utils/builtins.h"',
            '',
            '#ifdef PG_MODULE_MAGIC',
            'PG_MODULE_MAGIC;',
            '#endif',
            '',
            'void _PG_init(void);',
            'void _PG_fini(void);',
            '',
            'PG_FUNCTION_INFO_V1(hello_world);',
            '',
            'Datum',
            'hello_world(PG_FUNCTION_ARGS)',
            '{',
            '\tPG_RETURN_TEXT_P(cstring_to_text("hello, world!"));',
            '}',
            '',
            'void',
            '_PG_init(void)',
            '{',
            '}',
            '',
            'void',
            '_PG_fini(void)',
            '{',
            '}',
            ''
        ]);
    }

    if (flags.sql) {
        const sql = [
            'CREATE FUNCTION hello_world()',
            'RETURNS text',
        ];

        if (flags.c) {
            sql.push(
                'AS \'MODULE_PATHNAME\'',
                'LANGUAGE C IMMUTABLE;'
            );
        } else {
            sql.push(
                'AS $$',
                '\tSELECT \'hello, world!\';',
                '$$ LANGUAGE SQL IMMUTABLE;'
            );
        }

        await bootstrapFile(`${name}--0.1.0.sql`, sql);
    }

    if (flags.regress) {
        const regressDir = utils.joinPath(path, 'sql');
        const expectedDir = utils.joinPath(path, 'expected');

        await utils.createDirectory(regressDir);
        await utils.createDirectory(expectedDir);

        await utils.writeFile(
                utils.joinPath(regressDir, 'init.sql'), [
                    `CREATE EXTENSION ${name};`,
                    'SELECT hello_world() as text;'
                ].join('\n'));

        await utils.writeFile(
                utils.joinPath(expectedDir, 'init.out'), [
                    `CREATE EXTENSION ${name};`,
                    'SELECT hello_world() as text;',
                    '     text      ',
                    '---------------',
                    ' hello, world!',
                    '(1 row)',
                    '',
                    '',
                ].join('\n'));
    }

    if (flags.tap) {
        const tapDir = utils.joinPath(path, 't');
        await utils.createDirectory(tapDir);

        await utils.writeFile(
            utils.joinPath(tapDir, '001_basic.pl'), [
                'use strict;',
                'use warnings;',
                '',
                'use PostgreSQL::Test::Cluster;',
                'use PostgreSQL::Test::Utils;',
                'use Test::More tests => 1;',
                '',
                'my $node = PostgreSQL::Test::Cluster->new(\'main\');',
                '$node->init;',
                flags.c 
                    ? `$node->append_conf(\'postgresql.conf\', qq{shared_preload_libraries=\'${name}\'});` 
                    : '',
                '$node->start;',
                '',
                `$node->safe_psql('postgres', q(CREATE EXTENSION ${name}));`,
                "my $out = $node->safe_psql('postgres', 'SELECT hello_world();');",
                "is($out, 'hello, world!', 'Unexpected string');",
                '',
                'done_testing();',
                '',
            ].join('\n')
        );
    }

    const td = await vscode.workspace.openTextDocument(utils.joinPath(path, 'Makefile'));
    await vscode.window.showTextDocument(td);
}

export function setupExtension(context: vscode.ExtensionContext,
                               nodeVars: vars.NodeVarRegistry,  logger: utils.ILogger,
                               nodesView: NodePreviewTreeViewProvider) {

    function registerCommand(name: string, command: (...args: any[]) => void) {
        const disposable = vscode.commands.registerCommand(name, command);
        context.subscriptions.push(disposable);
    }

    const processSingleConfigFile = async (pathToFile: vscode.Uri) => {
        let doc = undefined;
        try {
            doc = await vscode.workspace.openTextDocument(pathToFile);
        } catch (err: any) {
            logger.error('failed to read settings file %s', pathToFile, err);
            return;
        }

        let text;
        try {
            text = doc.getText();
        } catch (err: any) {
            logger.error('failed to read settings file %s', doc.uri.fsPath, err);
            return;
        }

        if (text.length === 0) {
            /* JSON file can be used as activation event */
            logger.debug('JSON settings file %s is empty', doc.uri.fsPath);
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (err: any) {
            logger.error('failed to parse JSON settings file %s', doc.uri.fsPath, err);
            return;
        }

        let parsedConfigFile: ConfigFile | undefined;
        try {
            parsedConfigFile = parseConfigurationFile(data);
        } catch (err: any) {
            logger.error('failed to parse JSON settings file %s', doc.uri.fsPath, err);
            return;
        }
        
        if (parsedConfigFile) {
            nodesView.configFile = parsedConfigFile;
        }
        
        if (parsedConfigFile?.typedefs?.length) {
            const typedefs = [];
            for (const typedef of parsedConfigFile.typedefs) {
                let p;
                if (path.isAbsolute(typedef)) {
                    p = vscode.Uri.file(typedef);
                } else {
                    const workspace = vscode.workspace.workspaceFolders?.length
                                ? vscode.workspace.workspaceFolders[0]
                                : undefined;
                    if (!workspace) {
                        logger.warn('could not determine workspace for file %s to add typedef file', typedef);
                        continue;
                    }

                    p = utils.joinPath(workspace.uri, typedef);
                }

                if (await utils.fileExists(p)) {
                    typedefs.push(p);
                } else {
                    logger.warn('typedef file %s does not exist', p.fsPath);
                }
            }

            if (typedefs.length) {
                Configuration.CustomTypedefsFiles = typedefs;
            }
        }
    }

    const refreshConfigurationFromFolders = async (folders: readonly vscode.WorkspaceFolder[]) => {
        for (const folder of folders) {
            const pathToFile = utils.joinPath(
                folder.uri, '.vscode', Configuration.ExtensionSettingsFileName);

            if (await utils.fileExists(pathToFile)) {
                await processSingleConfigFile(pathToFile);
            }
        }
    }

    /* Refresh config files when debug session starts */
    vscode.debug.onDidStartDebugSession(async _ => {
        if (vscode.workspace.workspaceFolders?.length) {
            logger.info('refreshing configuration files due to debug session start')
            await refreshConfigurationFromFolders(vscode.workspace.workspaceFolders);
        }
    }, undefined, context.subscriptions);

    /* Register command to dump variable to log */
    const pprintVarToLogCmd = async (args: any) => {
        try {
            if (!nodesView.execContext) {
                return;
            }

            await dumpVariableToLogCommand(args, logger, nodesView.execContext.debug);
        } catch (err: any) {
            logger.error('error while dumping node to log', err);
        }
    };

    const dumpNodeToDocCmd = async (args: any) => {
        try {
            if (!nodesView.execContext) {
                return;
            }

            /* Command can be run for 'Variable' or 'pg variables' views */
            let variable: dap.DebugVariable;
            if (args instanceof vars.Variable) {
                const nodeVar = args;
                if (!(nodeVar instanceof vars.NodeVariable)) {
                    return;
                }

                variable = {
                    name: nodeVar.name,
                    type: nodeVar.type,
                    value: nodeVar.value,
                    evaluateName: nodeVar.name,
                    variablesReference: nodeVar.variablesReference,
                    memoryReference: nodeVar.memoryReference
                }
            } else {
                variable = args.variable;
            }

            await dumpVariableToDocumentCommand(variable, logger, nodesView.execContext.debug);
        } catch (err: any) {
            logger.error('error while dumping node to log', err);
        }
    }

    const openConfigFileCmd = async () => {
        if (!vscode.workspace.workspaceFolders?.length) {
            vscode.window.showInformationMessage('No workspaces found - open directory first');
            return;
        }

        for (const folder of vscode.workspace.workspaceFolders) {
            const configFilePath = utils.joinPath(
                folder.uri,
                '.vscode',
                Configuration.ExtensionSettingsFileName);
            const propertiesFileExists = await utils.fileExists(configFilePath);
            /* Create default configuration file if not exists */
            if (!propertiesFileExists) {
                if (await utils.fsEntryExists(configFilePath)) {
                    vscode.window.showErrorMessage(`Can not create ${Configuration.ExtensionSettingsFileName} - fs entry exists and not file`);
                    return;
                }

                logger.debug('creating %s configuration file', configFilePath.fsPath);
                const configDirectoryPath = utils.joinPath(configFilePath, '..');
                if (!await utils.directoryExists(configDirectoryPath)) {
                    try {
                        await utils.createDirectory(configDirectoryPath);
                    } catch (err) {
                        logger.error('failed to create config directory', err);
                        return;
                    }
                }

                try {
                    await utils.writeFile(configFilePath, JSON.stringify(
                        /* Example config file */
                        {
                            version: 5,
                            specialMembers: {
                                array: []
                            },
                            aliases: [],
                            customListTypes: [],
                            htab: [],
                            simplehash: []
                        },
                        undefined, '    '));
                } catch (err: any) {
                    logger.error('Could not write default configuration file', err);
                    vscode.window.showErrorMessage('Error creating configuration file');
                    return;
                }
            }

            let doc;
            try {
                doc = await vscode.workspace.openTextDocument(configFilePath);
            } catch (err: any) {
                logger.error('failed to open configuration file', err);
                return;
            }

            try {
                await vscode.window.showTextDocument(doc);
            } catch (err: any) {
                logger.error('failed to show configuration file', err);
                return;
            }

            /* Stop at first success folder to process */
            break;
        }
    };

    const bootstrapExtensionCmd = async () => {
        try {
            await bootstrapExtensionCommand();
        } catch (err) {
            logger.error('Failed to bootstrap extension', err);
        }
    }

    /* Refresh config file command register */
    const refreshConfigCmd = async () => {
        if (!vscode.workspace.workspaceFolders?.length) {
            return;
        }

        logger.info('refreshing config file due to command execution');
        for (const folder of vscode.workspace.workspaceFolders) {
            const configFilePath = utils.joinPath(
                folder.uri,
                '.vscode',
                Configuration.ExtensionSettingsFileName);
            if (!await utils.fileExists(configFilePath)) {
                const answer = await vscode.window.showWarningMessage(
                    'Config file does not exist. Create?',
                    'Yes', 'No');
                if (answer !== 'Yes') {
                    return;
                }

                await vscode.commands.executeCommand(Configuration.Commands.OpenConfigFile);
                return;
            }

            try {
                await processSingleConfigFile(configFilePath);
            } catch (err: any) {
                logger.error('failed to update config file', err);
            }
        }
    };

    const refreshVariablesCmd = () => {
        logger.info('refreshing variables view due to command')
        nodesView.refresh();
    };

    const addVariableToWatchCmd = async (args: any) => {
        const expr = vars.getWatchExpressionCommandHandler(args);
        if (!expr) {
            return;
        }

        await vscode.commands.executeCommand('debug.addToWatchExpressions', {
            variable: {
                evaluateName: expr
            }
        });
    }
    
    const findCustomTypedefsListCmd = async (args: any) => {
        const cmd = "find . -name '*typedefs.list' | grep -vE '^\\./(src|\\.vscode)'";
        const terminal = vscode.window.createTerminal();
        terminal.sendText(cmd, true /* shouldExecute */);
        terminal.show();
    }

    /* Used for testing only */
    const getVariablesCmd = async () => {
        try {
            return await nodesView.getChildren(undefined);
        } catch (err) {
            logger.error('failed to get variables', err);
        }
    }

    const getNodeTreeProviderCmd = async () => {
        return nodesView;
    }

    registerCommand(Configuration.Commands.RefreshConfigFile, refreshConfigCmd);
    registerCommand(Configuration.Commands.OpenConfigFile, openConfigFileCmd);
    registerCommand(Configuration.Commands.DumpNodeToLog, pprintVarToLogCmd);
    registerCommand(Configuration.Commands.DumpNodeToDoc, dumpNodeToDocCmd);
    registerCommand(Configuration.Commands.RefreshPostgresVariables, refreshVariablesCmd);
    registerCommand(Configuration.Commands.BootstrapExtension, bootstrapExtensionCmd);
    registerCommand(Configuration.Commands.AddToWatchView, addVariableToWatchCmd);
    registerCommand(Configuration.Commands.GetVariables, getVariablesCmd);
    registerCommand(Configuration.Commands.GetTreeViewProvider, getNodeTreeProviderCmd);
    registerCommand(Configuration.Commands.FindCustomTypedefsLists, findCustomTypedefsListCmd);

    /* Process config files immediately */
    if (vscode.workspace.workspaceFolders) {
        refreshConfigurationFromFolders(vscode.workspace.workspaceFolders);
    } else {
        let disposable: vscode.Disposable | undefined;
        /* Wait for folder open */
        disposable = vscode.workspace.onDidChangeWorkspaceFolders(e => {
            refreshConfigurationFromFolders(e.added);

            /*
             * Run only once, otherwise multiple commands will be registered - 
             * it will spoil up everything
            */
            disposable?.dispose();
        }, context.subscriptions);
    }

    /* Read files with NodeTags */
    setupNodeTagFiles(logger, nodeVars, context);
}

async function setupNodeTagFiles(log: utils.ILogger, nodeVars: vars.NodeVarRegistry,
    context: vscode.ExtensionContext): Promise<undefined> {

    const getNodeTagFiles = () => {
        const customNodeTagFiles = Configuration.getCustomNodeTagFiles();
        if (customNodeTagFiles?.length) {
            return customNodeTagFiles;
        }

        return [
            utils.getPgSrcFile('src', 'include', 'nodes', 'nodes.h'),
            utils.getPgSrcFile('src', 'include', 'nodes', 'nodetags.h'),
        ]
    }
    
    const handleNodeTagFile = async (path: vscode.Uri) => {
        if (!await utils.fileExists(path)) {
            return;
        }

        log.debug('processing %s NodeTags file', path.fsPath);
        const document = await vscode.workspace.openTextDocument(path);
        try {
            const added = nodeVars.updateNodeTypesFromFile(document);
            log.debug('added %i NodeTags from %s file', added, path.fsPath);
        } catch (err: any) {
            log.error('could not initialize node tags array', err);
        }
    }

    const setupSingleFolder = async (folder: vscode.WorkspaceFolder) => {
        const nodeTagFiles = getNodeTagFiles();

        for (const filePath of nodeTagFiles) {
            const file = utils.joinPath(folder.uri, filePath);
            await handleNodeTagFile(file);
            const pattern = new vscode.RelativePattern(folder, filePath);
            const watcher = vscode.workspace.createFileSystemWatcher(pattern,
                false, false, 
                /* ignoreDeleteEvents */ true);
            watcher.onDidChange(async uri => {
                log.info('detected change in NodeTag file: %s', uri);
                await handleNodeTagFile(uri);
            }, context.subscriptions);
            watcher.onDidCreate(async uri => {
                log.info('detected creation of NodeTag file: %s', uri);
                await handleNodeTagFile(uri);
            }, context.subscriptions);
    
            context.subscriptions.push(watcher);
        }
    }

    if (vscode.workspace.workspaceFolders?.length) {
        await Promise.all(
            vscode.workspace.workspaceFolders.map(async folder =>
                await setupSingleFolder(folder)
            )
        );
    }

    vscode.workspace.onDidChangeWorkspaceFolders(async e => {
        for (let i = 0; i < e.added.length; i++) {
            const folder = e.added[i];
            await setupSingleFolder(folder);
        }
    }, undefined, context.subscriptions);
}

export function getCurrentLogLevel() {
    const configValue = Configuration.getLogLevel();
    switch (configValue) {
        case 'INFO':
            return utils.LogLevel.Info;
        case 'DEBUG':
            return utils.LogLevel.Debug;
        case 'WARNING':
            return utils.LogLevel.Warn;
        case 'ERROR':
            return utils.LogLevel.Error;
        case 'DISABLE':
            return utils.LogLevel.Disable;
        default:
            return utils.LogLevel.Info;
    }
}

export class Configuration {
    static ExtensionName = 'postgresql-hacker-helper';
    static ExtensionPrettyName = 'PostgreSQL Hacker Helper';
    static ConfigSections = {
        TopLevelSection: this.ExtensionName,
        NodeTagFiles: 'nodeTagFiles',
        LogLevel: 'logLevel',
        PgbsdindentPath: 'pg_bsd_indentPath',
        SrcPath: 'srcPath'
    };
    static Commands = {
        DumpNodeToLog: `${this.ExtensionName}.dumpNodeToLog`,
        DumpNodeToDoc: `${this.ExtensionName}.dumpNodeToDoc`,
        OpenConfigFile: `${this.ExtensionName}.openConfigurationFile`,
        RefreshPostgresVariables: `${this.ExtensionName}.refreshPostgresVariablesView`,
        RefreshConfigFile: `${this.ExtensionName}.refreshConfigFile`,
        FormatterDiffView: `${this.ExtensionName}.formatterShowDiff`,
        BootstrapExtension: `${this.ExtensionName}.bootstrapExtension`,
        AddToWatchView: `${this.ExtensionName}.addVariableToWatch`,
        GetVariables: `${this.ExtensionName}.getVariables`,
        GetTreeViewProvider: `${this.ExtensionName}.getTreeViewProvider`,
        FindCustomTypedefsLists: `${this.ExtensionName}.formatterFindTypedefsList`,
    };
    static Views = {
        NodePreviewTreeView: `${this.ExtensionName}.node-tree-view`,
    };
    static ExtensionSettingsFileName = 'pgsql_hacker_helper.json';

    /* Paths to custom typedefs.list files in pgsql_hacker_helper.json file */
    static CustomTypedefsFiles: vscode.Uri[] | undefined = undefined;

    static getLogLevel() {
        return this.getConfig<string>(this.ConfigSections.LogLevel);
    };

    static getCustomNodeTagFiles() {
        return this.getConfig<string[]>(this.ConfigSections.NodeTagFiles);
    };

    static getCustomPgbsdindentPath() {
        return this.getConfig<string>(this.ConfigSections.PgbsdindentPath);
    }

    static getSrcPath() {
        return this.getConfig<string>(this.ConfigSections.SrcPath);
    }

    static getConfig<T>(section: string) {
        const topLevelSection = this.ConfigSections.TopLevelSection
        const config = vscode.workspace.getConfiguration(topLevelSection);
        return config.get<T>(section);
    };
    static getFullConfigSection(section: string) {
        return `${this.ConfigSections.TopLevelSection}.${section}`;
    }
    static setExtensionActive(status: boolean) {
        const context = `${this.ExtensionName}:activated`;
        vscode.commands.executeCommand('setContext', context, status);
    }
}
