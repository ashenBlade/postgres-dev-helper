import * as vscode from "vscode";
import * as dbg from './debugger';
import * as constants from './constants';
import { Log as logger } from './logger';
import { ExecContext, HashTableTypes, NodeVariable, NodeVarRegistry, SpecialMemberRegistry, Variable, VariablesRoot } from "./variables";
import {Configuration, getWorkspaceFolder, getWorkspacePgSrcFile} from './configuration';
import { unnullify } from "./error";
import { DebugVariable } from "./dap";

interface ExecContextData {
    hashTables: HashTableTypes;
    nodeVars: NodeVarRegistry;
    specialMembers: SpecialMemberRegistry;
};

/*
 * Container with runtime information shared between views.
 *
 * Shared between all views (variables and watch), so if one requires to create
 * ExecContext then another will also have it created.
 */
export class DebuggingContext {
    /* 
     * Execution context with different information.
     *
     * This is large structure with lots of information, so initialized lazily.
     */
    exec?: ExecContext;

    /* 
     * Debugger facade used to execute/evaluate expressions.
     */
    debug?: dbg.GenericDebuggerFacade;

    /* 
     * Cached pair [Cached type info, PG version] from previous run.
     * Can be used only if configuration file have not changed since previous run.
     */
    cachedTypes?: [ExecContextData, number];
};

/* TODO: remove unnecessary enum - can use boolean */
/**
 * Which executable we are debugging
 */
enum ExecutableType {
    /* Main 'postgres' executable */
    Server,
    /* Frontend utils: pg_ctl, pg_waldump, initdb, etc... */
    Frontend,
};

function pgVersionIsValid(version: number) {
    /*
     * PG_VERSION_NUM is a 6 digit number in form: MAJOR_MINOR_PATCH,
     * so perform not only Integer check, but also a value range.
     */
    return Number.isInteger(version) && 1_00_00 < version && version < 99_99_99;
}

function isSpace(char: string) {
    return char === ' ' || char === '\t' || char === '\n';
}

/* 
 * Base class for all ViewProvider classes containing infrastructure code
 */
export abstract class BasePgViewProvider<T> implements vscode.TreeDataProvider<T>, vscode.Disposable {
    /* 
     * Extension configuration.
     */
    config: Configuration;

    /* 
     * Shared execution context.
     */
    context: DebuggingContext;

    constructor(config: Configuration, context: DebuggingContext) {
        this.config = config;
        this.context = context;
    }

    getDebug() {
        return unnullify(this.context.debug, 'this.debug');
    }

    /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this.clean();
        this._onDidChangeTreeData.fire();
    }

    /*
     * Version of refresh used when only 1 entry was changed, so we do not
     * have to evaluate every other expression
     */
    refreshNoClean() {
        this._onDidChangeTreeData.fire();
    }

    private _onDidDebugStart = new vscode.EventEmitter<ExecContext>();
    readonly onDidDebugStart = this._onDidDebugStart.event;

    /* Get top level variables during debug session */
    abstract getTopLevelChildren(frameId: number, exec: ExecContext): vscode.ProviderResult<T[]>;
    /* Get children of specific child during debug session */
    abstract getChildrenOf(element: T, exec: ExecContext): vscode.ProviderResult<T[]>;
    /*
     * Get some "filler" entries when not in debug session'.
     *
     * Now used to get entries in watch view, because we should show them even
     * without debug.
     */
    abstract getNonDebugChildren(): vscode.ProviderResult<T[]>;
    abstract getTreeItem(element: T): Promise<vscode.TreeItem>;
    abstract getParent(element: T): vscode.ProviderResult<T>;

    /* invoked when debug session is over and we should clean view */
    abstract clean(): void;

    async getChildrenGuts(element?: T) {
        if (element) {
            const exec = unnullify(this.context.exec, 'this.context.exec');
            return await this.getChildrenOf(element, exec);
        }

        const debug = this.context.debug;
        if (debug == undefined) {
            return this.getNonDebugChildren();
        }

        const frameId = await debug.getCurrentFrameId();
        if (frameId == undefined) {
            return this.getNonDebugChildren();
        }

        if (!this.context.exec) {
            this.context.exec = await this.getExecContext(frameId, debug);
        }

        return await this.getTopLevelChildren(frameId, this.context.exec);
    }

    async getChildren(element?: T) {
        if (!this.context.debug) {
            /* No debug session */
            return;
        }

        try {
            return await this.getChildrenGuts(element);
        } catch (err) {
            if (!(err instanceof Error)) {
                throw err;
            }

            /* 
             * There may be race condition when our state of debugger 
             * is 'ready', but real debugger is not, so we can not send
             * commands to debugger.
             * Such cases include debugger detach, continue after
             * breakpoint or the case when 'PG Variables' view reveals
             * when user start debug session.
             * 
             * In such cases we return empty array, so view will be cleared.
             */
            if (err instanceof dbg.DebuggerNotAvailableError) {
                /* debugger is unavailable, so nothing we can show */
                this.clean();
                return this.getNonDebugChildren();
            }

            /* 
             * It would be better to just log error, otherwise if we re-throw
             * then user will see error popup and just freeze without
             * understanding where this error comes from.
             */
            logger.error(err, 'error occurred during obtaining members');
            return;
        }
    }

    async getExecContext(frameId: number, debug: dbg.GenericDebuggerFacade) {
        const {pgversion, isServer} = await this.getDebugContext(frameId);

        let data: ExecContextData | undefined;
        if (pgversion) {
            logger.info('detected PostgreSQL version:', pgversion);
            data = this.tryGetCache(pgversion);
        } else {
            logger.warn('could not detect PostgreSQL version');
        }

        if (!data) {
            data = await this.createExecContext(pgversion);

            /* Store cache */
            if (pgversion) {
                this.context.cachedTypes = [data, pgversion];
            }
        }

        const exeType = isServer ? ExecutableType.Server : ExecutableType.Frontend;
        const context = new ExecContext(debug, data, pgversion, exeType);
        if (pgversion) {
            context.adjustProperties(pgversion);
        }

        this._onDidDebugStart.fire(context);
        return context;
    }

    tryGetCache(pgversion: number) {
        /*
         * We can use cache only if configuration have not changed AND 
         * we are debugging the same PG version (executable type may not
         * be checked).
         */
        if (   this.context.cachedTypes?.[1] === pgversion
            && !this.config.isDirty()) {
            return this.context.cachedTypes[0];
        }
    }

    async createExecContext(pgversion: number | undefined): Promise<ExecContextData> {
        const specialMembers = new SpecialMemberRegistry();
        specialMembers.addArrays(constants.getArrays());
        specialMembers.addListCustomPtrSpecialMembers(constants.getKnownCustomListPtrs());
    
        const hashTables = new HashTableTypes();
        hashTables.addHTABTypes(constants.getWellKnownHTABTypes());
        
        const nodeVars = new NodeVarRegistry();
        
        /* Version specific initialization */
        if (pgversion) {
            if (10_00_00 <= pgversion) {
                hashTables.addSimplehashTypes(constants.getWellKnownSimpleHashTableTypes());
            }

            /* 
             * Initialize flags only if we know PostgreSQL version for sure,
             * otherwise we will lead developer in the wrong way - this is
             * even worse.
             */
            specialMembers.addFlagsMembers(constants.getWellKnownFlagsMembers(pgversion));
        } else {
            hashTables.addSimplehashTypes(constants.getWellKnownSimpleHashTableTypes());
        }

        this.initializeExecContextFromConfig(nodeVars, specialMembers, hashTables);
        
        return {
            specialMembers,
            hashTables,
            nodeVars,
        };
    }

    async getDebugContext(frameId: number) {
        /* 
         * For correct initialization we must know PG version, so
         * some version-dependent type information is initialized
         * correctly.
         * 
         * Also, in some cases we must know which executable we are
         * debugging: 'postgres' server or frontend utility.
         * 
         * We derive executable type from the place where we got
         * pg version, because "server_version_num" is only available
         * at the server.
         */
        let pgversion;

        try {
            pgversion = await this.tryGetServerVersionNumGuc(frameId);
        } catch (err) {
            /* Do not check EvaluationError - fallback to parsing pg_config.h */
            logger.error(err, 'could not get "server_version_num" GUC');
        }

        if (pgversion) {
            return {
                pgversion,
                /* GUC is present only in server */
                isServer: true,
            };
        }
        
        try {
            pgversion = await this.tryGetPgVersionNumPgConfig();
        } catch (err) {
            logger.error(err, 'could not parse pg_config.h file for PG_VERSION_NUM');
        }

        if (pgversion) {
            return {
                pgversion,
                /* If no GUC we are in frontend */
                isServer: false,
            };
        }

        /*
         * This is a safe default value which will disable many features
         * and make our work more "safe", because we will not touch many
         * things.
         */
        return {
            pgversion: undefined,
            isServer: false,
        };
    }

    async tryGetServerVersionNumGuc(frameId: number) {
        const result = await this.getDebug().evaluate('server_version_num', frameId);
        const pgversion = Number(result.result);
        if (!pgVersionIsValid(pgversion)) {
            logger.warn('"server_version_num" is not valid, evaluated:', result.result);
            return undefined;
        }

        return pgversion;
    }

    async tryGetPgVersionNumPgConfig() {
        const path = getWorkspacePgSrcFile(
            getWorkspaceFolder(), 'src', 'include', 'pg_config.h');
        
        let text;
        try {
            const doc = await vscode.workspace.openTextDocument(path);
            text = doc.getText();
        } catch (err) {
            logger.error(err, 'could not open pg_config.h file', path.fsPath);
            return;
        }
    
        /*
         * Assume there are no other entries with the same name
         * in the generated pg_config.h file, so no check in loop.
         */
        const macro = 'PG_VERSION_NUM';
        const macroIndex = text.indexOf(macro);
        if (macroIndex === -1) {
            return;
        }
        
        /* Next character must be space, so skip it right away */
        let start = macroIndex + macro.length + 1;
        while (   start < text.length
               && isSpace(text[start])) {
            start++;
        }
    
        let end = start + 1;
        while (   end < text.length
               && !isSpace(text[end])) {
            end++;
        }
        
        const versionString = text.substring(start, end);
        const version = Number(versionString);
        if (!pgVersionIsValid(version)) {
            logger.warn('parsed PG_VERSION_NUM "', versionString, '" is not valid');
            return;
        }
        
        return version;
    }

    async initializeExecContextFromConfig(nodeVars: NodeVarRegistry,
                                          specialMembers: SpecialMemberRegistry,
                                          hashTables: HashTableTypes) {
        const config = await this.config.getVariablesConfiguration();
        if (!config) {
            return;
        }
        
        if (config.arrays?.length) {
            logger.debug('adding', config.arrays.length, 'arrays from config file');
            try {
                specialMembers.addArrays(config.arrays);
            } catch (err) {
                logger.error(err, 'could not add custom array special members');
            }
        }

        if (config.aliases?.length) {
            logger.debug('adding', config.aliases.length, 'aliases from config file');
            try {
                nodeVars.addAliases(config.aliases);
            } catch (err) {
                logger.error(err, 'could not add aliases from configuration');
            }
        }

        if (config.customListTypes?.length) {
            logger.debug('adding', config.customListTypes.length, 'custom list types');
            try {
                specialMembers.addListCustomPtrSpecialMembers(config.customListTypes);
            } catch (err) {
                logger.error(err, 'error occurred during adding custom List types');
            }
        }

        if (config.htab?.length) {
            logger.debug('adding', config.htab.length, 'htab types');
            try {
                hashTables.addHTABTypes(config.htab);
            } catch (err) {
                logger.error(err, 'error occurred during adding custom HTAB types');
            }
        }

        if (config.simplehash?.length) {
            logger.debug('adding', config.simplehash.length, 'simplehash types');
            try {
                hashTables.addSimplehashTypes(config.simplehash);
            } catch (err) {
                logger.error(err, 'error occurred during adding custom simple hash table types');
            }
        }
        
        if (config.enums?.length) {
            logger.debug('adding', config.enums.length, 'enum bitmask types');
            try {
                specialMembers.addFlagsMembers(config.enums);
            } catch (err) {
                logger.error(err, 'error occurred during adding enum bitmask types');
            }
        }

        if (config.nodetags?.length) {
            logger.debug('adding', config.nodetags.length, 'custom NodeTags');
            try {
                for (const tag of config.nodetags) {
                    nodeVars.nodeTags.add(tag);
                }
            } catch (err) {
                logger.error(err, 'could not add custom NodeTags');
            }
        }
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}

export class PgVariablesViewProvider extends BasePgViewProvider<Variable> {
    async getTopLevelVariables(context: ExecContext, frameId: number) {
        const variables = await context.debug.getVariables(frameId);
        return await Variable.mapVariables(variables, frameId, context, undefined);
    }

    override async getTreeItem(variable: Variable) {
        return await variable.getTreeItem();
    }

    override async getTopLevelChildren(frameId: number, exec: ExecContext) {
        const variables = await this.getTopLevelVariables(exec, frameId);
        if (!variables) {
            return variables;
        }

        const root = new VariablesRoot(variables, exec);
        
        variables.forEach(v => v.parent = root);
        return variables;

    }

    override async getChildrenOf(element: Variable, _: ExecContext) {
        return await element.getChildren();
    }

    override getParent(element: Variable) {
        return element.parent;
    }

    override clean() {
        /* no actions required - on refresh we will clean everything */
    }

    override getNonDebugChildren() {
        /* We show only real variables */
        return undefined;
    }
}


export async function dumpNodeVariableToLogCommand(view: PgVariablesViewProvider,
                                                   ...args: unknown[]) {
    if (!view.context.exec) {
        return;
    }

    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }

    const debug = view.context.debug;
    if (!debug) {
        logger.warn('context.debug is undefined, but debug session is active');
        return;
    }

    if (!(typeof args === 'object' && args !== null && 'variable' in args)) {
        return;
    }

    const variable = args.variable as DebugVariable;
    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        logger.warn('could not get current frame id');
        return;
    }

    const expression = `pprint((const void *) ${debug.getPointer(variable)})`;
    logger.info('executing pprint');
    await debug.evaluate(expression,
                         frameId, 
                         undefined  /* context */, 
                         true       /* no return */);
}

function isDebugVariable(o: unknown): o is DebugVariable {
    return    (typeof o === 'object' && !!o)
           && ('name' in o && typeof o.name === 'string' && o.name.length > 0)
           && ('value' in o && typeof o.value === 'string' && o.value.length > 0)
           && ('type' in o && typeof o.type === 'string' && o.type.length > 0);
}

export async function dumpNodeVariableToDocumentCommand(pgvars: PgVariablesViewProvider,
                                                        ...args: unknown[]) {
    if (!pgvars.context?.debug) {
        return;
    }
    
    if (!args?.length) {
        return;
    }

    let variable: DebugVariable;

    /*
     * Command can be run for 'Variable' or 'pg variables' views,
     * so use a common denominator.
     */
    const arg = args[0];
    if (arg instanceof Variable) {
        const nodeVar = args;
        if (!(nodeVar instanceof NodeVariable)) {
            return;
        }

        variable = {
            name: nodeVar.name,
            type: nodeVar.type,
            value: nodeVar.value,
            variablesReference: nodeVar.variablesReference,
            memoryReference: nodeVar.memoryReference,
        };
    } else if (   !!args && typeof args === 'object'
               && 'variable' in args && isDebugVariable(args.variable)) {
        variable = args.variable;
    } else {
        logger.warn('could not get DebugVariable from given "args" =', args);
        return;
    }

    const session = vscode.debug.activeDebugSession;
    if (!session) {
        return;
    }

    const debug = pgvars.context.debug;
    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        vscode.window.showWarningMessage(`Could not get current stack frame id to invoke functions`);
        return;
    }

    let response;

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
    response = await debug.evaluate(nodeToStringExpr, frameId);

    /* Save to call pfree later */
    const savedNodeToStringPtr = response.memoryReference;

    const prettyFormatExpr = `pretty_format_node_dump((const char *) ${response.memoryReference})`;
    response = await debug.evaluate(prettyFormatExpr, frameId);

    const debugVariable: dbg.IDebugVariable = {
        type: response.type,
        value: response.result,
        memoryReference: response.memoryReference,
    };
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
    } catch (err: unknown) {
        if (!dbg.isEvaluationError(err)) {
            throw err;
        }

        logger.error(err, 'could not dump variable', variable.name, 'to log');
        
        /* continue - this is not critical error for dump logic */
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

export async function addVariableToWatchCommand(...args: unknown[]) {
    if (!args.length) {
        return;
    }
    
    const variable = args[0];
    if (!(variable instanceof Variable)) {
        logger.warn('given argument is not Variable type:', variable);
        return;
    }

    const expr = await variable.getUserWatchExpression();
    if (!expr) {
        return;
    }

    await vscode.commands.executeCommand('debug.addToWatchExpressions', {
        variable: {
            evaluateName: expr,
        },
    });
}

class WatchEntry {
    /* 
     * User-defined expression for entry
     */
    expression: string;
    /* 
     * Variable representing evaluation result (if any)
     */
    variable?: Variable;

    constructor(expression: string) {
        this.expression = expression;
    }

    async getVariable(exec: ExecContext, frameId: number) {
        if (!this.variable) {
            const response = await exec.debug.evaluate(this.expression, frameId);
            const debugVar = {
                name: this.expression,
                type: response.type,
                value: response.result,
                variablesReference: response.variablesReference,
                memoryReference: response.memoryReference,
            } as DebugVariable;
            this.variable = await Variable.create(debugVar, frameId, exec);
        }

        return this.variable;
    }
}

export class PgWatchViewProvider extends BasePgViewProvider<WatchEntry | Variable> {
    /* Entries of this view */
    entries: WatchEntry[] = [];

    /* Cached frame id from last getTopLevelChildren invocation */
    frameId?: number;

    override async getTreeItem(element: WatchEntry | Variable) {
        if (element instanceof Variable) {
            return await element.getTreeItem();
        }

        const item = {
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            label: element.expression,
        } as vscode.TreeItem;

        if (!(this.context.exec && this.frameId !== undefined)) {
            /* not in debug session */
            return item;
        }

        try {
            const v = await element.getVariable(this.context.exec, this.frameId);
            const vitem = await v.getTreeItem();

            /* watch entry must behave like the variable it represents */
            item.description = vitem.description;
            item.collapsibleState = vitem.collapsibleState;
        } catch (e) {
            logger.error(e, 'could not get variable for expression %s', element.expression);
        }

        return item;
    }

    override async getTopLevelChildren(frameId: number, __: ExecContext) {
        /* save frame id for future use */
        this.frameId = frameId;
        return this.entries;
    }

    override async getChildrenOf(element: WatchEntry | Variable, exec: ExecContext) {
        if (element instanceof Variable) {
            return await element.getChildren();
        }

        if (!this.frameId) {
            return;
        }

        const v = await element.getVariable(exec, this.frameId);
        return v.getChildren();
    }

    override getParent(element: WatchEntry | Variable) {
        if (element instanceof WatchEntry) {
            /* WatchEntry is top level */
            return undefined;
        }

        if (element.parent) {
            return element.parent;
        }

        /* 
         * For direct children of WatchEntry we have to iterate over all entries
         * and compare pointers, because we do not store Variable.parent for
         * WatchEntry
         */
        for (const entry of this.entries) {
            if (entry.variable == element) {
                return entry;
                
            }
        }

        /* found nothing */
        return undefined;
    }

    override clean() {
        this.entries.forEach(entry => entry.variable = undefined);
    }

    override getNonDebugChildren() {
        return this.entries;
    }

    async addExpression(expression: string) {
        this.entries.push(new WatchEntry(expression));
    }

    async removeEntry(entry: WatchEntry) {
        const idx = this.entries.findIndex((v) => v == entry);
        if (idx >= 0) {
            this.entries.splice(idx, 1);
        }
    }
}

export async function addVariableToPgWatch(watchView: PgWatchViewProvider, ...args: unknown[]) {
    let expr: string | null | undefined;

    const arg = args[0];
    if (!arg) {
        return;
    }

    if (arg instanceof Variable) {
        /* Variable came from PG VARIABLES */
        expr = await arg.getUserWatchExpression();
    } else if (arg && typeof arg == 'object' && 'variable' in arg && arg.variable &&
                      typeof arg.variable === 'object' && 'evaluateName' in arg.variable &&
                      typeof arg.variable.evaluateName === 'string') {
        /* Variable from VARIABLES */
        expr = arg.variable.evaluateName;

        /* 
         * CodeLLDB in native expression mode returns '/nat' prefixed expressions.
         * Debugger handler will automatically add this prefix, but we should
         * show expressions to user without it to be more convenient.
         */
        if (watchView.context.debug?.type == dbg.DebuggerType.CodeLLDB) {
            if (expr.startsWith('/nat')) {
                expr = expr.substring(5);
            }
        }
    }

    if (expr) {
        watchView.addExpression(expr);

        /* force update view to show results */
        watchView.refresh();
    }
}

export async function removePgWatchEntry(watchView: PgWatchViewProvider, ...args: unknown[]) {
    const arg = args[0];
    if (!(arg instanceof WatchEntry)) {
        /* this is not entry */
        return;
    }

    watchView.removeEntry(arg);
    watchView.refreshNoClean();
}

export async function editPgWatchEntry(watchView: PgWatchViewProvider, ...args: unknown[]) {
    const arg = args[0];
    if (!(arg instanceof WatchEntry)) {
        /* this is not entry */
        return;
    }

    let newExpr = await vscode.window.showInputBox({
        value: arg.expression,
        title: 'Edit watch expression',
    });

    if (!newExpr) {
        return;
    }

    newExpr = newExpr.trim();
    if (newExpr.length === 0) {
        return;
    }

    arg.expression = newExpr;
    arg.variable = undefined;

    watchView.refreshNoClean();
}

export async function addPgWatchEntry(watchView: PgWatchViewProvider) {
    let newExpr = await vscode.window.showInputBox({
        title: 'Enter expression',
    });

    if (!newExpr) {
        return;
    }

    newExpr = newExpr.trim();
    if (newExpr.length === 0) {
        return;
    }

    watchView.addExpression(newExpr);
    watchView.refreshNoClean();
}

export async function removeAllPgWatchEntries(watchView: PgWatchViewProvider) {
    watchView.entries = [];
    watchView.refresh();
}
