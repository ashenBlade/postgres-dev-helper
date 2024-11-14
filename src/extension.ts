import * as vscode from 'vscode';
import * as utils from './utils';
import * as dap from './dap';
import * as vars from './variables';


export class NodePreviewTreeViewProvider implements vscode.TreeDataProvider<vars.Variable> {
    subscriptions: vscode.Disposable[] = [];

    private getCurrentFrameId = async (_: vars.ExecContext) => {
        /* debugFocus API */
        return (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    }

    constructor(
        private log: utils.ILogger,
        private context: vars.ExecContext) { }

    /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
    private _onDidChangeTreeData = new vscode.EventEmitter<vars.Variable | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getSpecialMember(variable: vars.Variable): vars.ArraySpecialMemberInfo | undefined {
        if (!variable.parent) {
            return;
        }

        return this.context.specialMemberRegistry
            .getArraySpecialMember(variable.parent.type, variable.name)
    }

    async getTreeItem(variable: vars.Variable) {
        return variable.getTreeItem();
    }

    async getChildren(element?: vars.Variable | undefined) {
        if (!this.context.debug.isInDebug) {
            return;
        }

        try {
            if (element) {
                return await element.getChildren(this.context);
            } else {
                const topLevel = await this.getTopLevelVariables();
                if (!topLevel) {
                    return;
                }

                const topLevelVariable = new vars.VariablesRoot(topLevel);
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

    async getTopLevelVariables() {
        const frameId = await this.getCurrentFrameId(this.context);
        if (!frameId) {
            return;
        }

        const variables = await this.context.debug.getVariables(frameId);
        return await vars.Variable.mapVariables(variables, frameId, this.context,
            this.log, undefined);
    }

    switchToEventBasedRefresh(context: vscode.ExtensionContext) {
        /* 
         * Prior to VS Code version 1.90 there is no debugFocus API - 
         * we can not track current stack frame. It is very convenient,
         * because single event refreshes state and also we keep track
         * of stack frame selected in debugger view.
         * 
         * For older versions we use event based implementation -
         * subscribe to debugger events and filter out needed:
         * continue execution, stopped (breakpoint), terminated etc...
         * 
         * NOTES:
         *  - We can not track current stack frame, so this feature is
         *    not available for users.
         *  - Support only 'cppdbg' configuration - tested only for it
         */

        const provider = this;
        let savedThreadId: undefined | number = undefined;
        const disposable = vscode.debug.registerDebugAdapterTrackerFactory('cppdbg', {
            createDebugAdapterTracker(_: vscode.DebugSession) {
                return {
                    onDidSendMessage(message: dap.ProtocolMessage) {
                        if (message.type === 'response') {
                            if (message.command === 'continue') {
                                /* 
                                 * `Continue' command - clear
                                 */
                                provider.refresh();
                            }

                            return;
                        }

                        if (message.type === 'event') {
                            if (message.event === 'stopped' || message.event === 'terminated') {
                                /* 
                                 * Hit breakpoint - show variables
                                 */
                                provider.refresh();
                                savedThreadId = message.body?.threadId as number | undefined;
                            }
                        }
                    },

                    onWillStopSession() {
                        /* Debug session terminates - clear */
                        provider.refresh();
                    },
                }
            },
        });
        context.subscriptions.push(disposable);
        this.getCurrentFrameId = async (context: vars.ExecContext) => {
            /* 
             * We can not track selected stack frame - return last (top)
             */
            if (!(context.debug.isInDebug && savedThreadId)) {
                return;
            }

            return await context.debug.getTopStackFrameId(savedThreadId);
        }
    }
}

export async function dumpVariableToLogCommand(args: any, log: utils.ILogger,
    debug: utils.IDebuggerFacade) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }

    const variable = args.variable;
    if (!variable?.value) {
        log.warn('Variable info not present in args');
        return;
    }

    console.assert(typeof variable.value === 'string');

    if (!(utils.isValidPointer(variable.value))) {
        vscode.window.showWarningMessage(`Variable ${variable.name} is not valid pointer`);
        return;
    }

    /* Simple `pprint(Node*)' function call */
    const expression = `-exec call pprint((const void *) ${variable.value})`;

    try {
        await debug.evaluate(expression, undefined);
    } catch (err: any) {
        log.error('could not dump variable %s to log', variable.name, err);
        vscode.window.showErrorMessage(`Could not dump variable ${variable.name}. `
                                     + `See errors in Output log`)
    }
}

class ConfigFileParseResult {
    arrayInfos?: vars.ArraySpecialMemberInfo[];
    aliasInfos?: vars.AliasInfo[];
}

function parseConfigurationFile(configFile: any): ConfigFileParseResult | undefined {
    if (!configFile === undefined) {
        return;
    }

    if (typeof configFile !== 'object') {
        return;
    }

    const parseArraySm1 = (obj: any): vars.ArraySpecialMemberInfo => {
        let nodeTag = obj.nodeTag;
        if (!nodeTag) {
            throw new Error("nodeTag field not provided");
        }

        if (typeof nodeTag !== 'string') {
            throw new Error(`nodeTag type must be string, given: ${typeof nodeTag}`);
        }

        nodeTag = nodeTag.trim().replace('T_', '');

        /* NodeTag used also as type name, so it must be valid identifier */
        if (!utils.isValidIdentifier(nodeTag)) {
            throw new Error(`nodeTag must be valid identifier. given: ${obj.nodeTag}`);
        }

        let memberName = obj.memberName;
        if (!memberName) {
            throw new Error(`memberName field not provided for type with NodeTag: ${obj.nodeTag}`);
        }

        if (typeof memberName !== 'string') {
            throw new Error(`memberName field must be string for type with NodeTag: ${obj.nodeTag}`);
        }

        memberName = memberName.trim();
        if (!utils.isValidIdentifier(memberName)) {
            throw new Error(`memberName field ${memberName} is not valid identifier`);
        }

        let lengthExpr = obj.lengthExpression;
        if (!lengthExpr) {
            throw new Error(`lengthExpression not provided for: ${obj.nodeTag}->${memberName}`);
        }

        if (typeof lengthExpr !== 'string') {
            throw new Error(`lengthExpression field must be string for: ${obj.nodeTag}->${memberName}`);
        }

        lengthExpr = lengthExpr.trim();
        if (!lengthExpr) {
            throw new Error('lengthExpression can not be empty string');
        }
        return {
            typeName: nodeTag,
            memberName,
            lengthExpr,
        }
    }

    const parseArraySm2 = (obj: any): vars.ArraySpecialMemberInfo => {
        let typeName = obj.typeName;
        if (!typeName) {
            throw new Error("typeName field not provided");
        }

        if (typeof typeName !== 'string') {
            throw new Error(`typeName type must be string, given: ${typeof typeName}`);
        }

        typeName = typeName.trim();

        /* NodeTag used also as type name, so it must be valid identifier */
        if (!utils.isValidIdentifier(typeName)) {
            throw new Error(`typeName must be valid identifier. given: ${typeName}`);
        }

        let memberName = obj.memberName;
        if (!memberName) {
            throw new Error(`memberName field not provided for type: ${typeName}`);
        }

        if (typeof memberName !== 'string') {
            throw new Error(`memberName field must be string for type: ${typeName}`);
        }

        memberName = memberName.trim();
        if (!utils.isValidIdentifier(memberName)) {
            throw new Error(`memberName field ${memberName} is not valid identifier`)
        }

        let lengthExpr = obj.lengthExpression;
        if (!lengthExpr) {
            throw new Error(`lengthExpression not provided for: ${typeName}->${memberName}`);
        }

        if (typeof lengthExpr !== 'string') {
            throw new Error(`lengthExpression field must be string for: ${typeName}->${memberName}`);
        }

        lengthExpr = lengthExpr.trim();
        if (!lengthExpr) {
            throw new Error('lengthExpression can not be empty string');
        }
        return {
            typeName,
            memberName,
            lengthExpr,
        }
    }

    const configVersion = Number(configFile.version);
    if (Number.isNaN(configVersion) ||
        !(configVersion == 1 || configVersion == 2)) {
        throw new Error(`unknown version of config file: ${configFile.version}`);
    }

    const parseAliasV2 = (obj: any): vars.AliasInfo => {
        if (typeof obj !== 'object') {
            throw new Error(`AliasInfo object must be object type. given: ${typeof obj}`);
        }

        if (!(obj.alias && typeof obj.alias === 'string')) {
            throw new Error(`"alias" field must be string. given: ${typeof obj.alias}`);
        }

        const alias = obj.alias.trim();
        if (!alias) {
            throw new Error(`"alias" field must not be empty`);
        }

        if (!(obj.type && typeof obj.type === 'string')) {
            throw new Error(`"type" field must be string. given: ${typeof obj.type}`);
        }

        const type = obj.type.trim();
        if (!type) {
            throw new Error(`"type" field must not be empty`);
        }

        return {
            alias,
            type,
        }
    }

    const arrayMemberParser = configVersion == 1
        ? parseArraySm1
        : parseArraySm2;

    const arrayInfos = Array.isArray(configFile.specialMembers?.array)
        && configFile.specialMembers.array.length > 0
        ? configFile.specialMembers.array.map(arrayMemberParser)
        : undefined;

    const aliasInfos = configVersion == 2
        && Array.isArray(configFile.aliases)
        && configFile.aliases.length > 0
        ? configFile.aliases.map(parseAliasV2)
        : undefined;

    return {
        arrayInfos,
        aliasInfos,
    }
}

export function setupExtension(context: vscode.ExtensionContext, execCtx: vars.ExecContext,
    logger: utils.ILogger, nodesView: NodePreviewTreeViewProvider) {

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
            logger.error('failed to read settings file %s', doc.uri, err);
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (err: any) {
            logger.error('failed to parse JSON settings file %s', doc.uri, err);
            return;
        }

        let parseResult: ConfigFileParseResult | undefined;
        try {
            parseResult = parseConfigurationFile(data);
        } catch (err: any) {
            logger.error('failed to parse JSON settings file %s', doc.uri, err);
            return;
        }

        if (parseResult) {
            if (parseResult.arrayInfos?.length) {
                logger.debug('adding %i array special members from config file', parseResult.arrayInfos.length);
                execCtx.specialMemberRegistry.addArraySpecialMembers(parseResult.arrayInfos);
            }
            if (parseResult.aliasInfos?.length) {
                logger.debug('adding %i aliases from config file', parseResult.aliasInfos.length);
                execCtx.nodeVarRegistry.addAliases(parseResult.aliasInfos);
            }
        }
    }

    const refreshConfigurationFromFolders = async (folders: readonly vscode.WorkspaceFolder[]) => {
        for (const folder of folders) {
            const pathToFile = utils.joinPath(
                folder.uri,
                '.vscode',
                Configuration.ExtensionSettingsFileName);
            if (await utils.fileExists(pathToFile)) {
                await processSingleConfigFile(pathToFile);
            } else {
                logger.debug('config file %s does not exist', pathToFile.fsPath);
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
            await dumpVariableToLogCommand(args, logger, execCtx.debug);
        } catch (err: any) {
            logger.error('error while dumping node to log', err);
        }
    };

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
                            version: 2,
                            specialMembers: {
                                array: []
                            }
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

    const refreshVariablesCommand = () => {
        logger.info('refreshing variables view due to command')
        nodesView.refresh();
    };

    registerCommand(Configuration.Commands.RefreshConfigFile, refreshConfigCmd);
    registerCommand(Configuration.Commands.OpenConfigFile, openConfigFileCmd);
    registerCommand(Configuration.Commands.DumpNodeToLog, pprintVarToLogCmd);
    registerCommand(Configuration.Commands.RefreshPostgresVariables, refreshVariablesCommand);

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
    setupNodeTagFiles(execCtx, logger, context);
}

async function setupNodeTagFiles(execCtx: vars.ExecContext, log: utils.ILogger,
    context: vscode.ExtensionContext): Promise<undefined> {
    const nodeTagFiles = Configuration.getNodeTagFiles();

    if (!nodeTagFiles?.length) {
        log.error('no NodeTag files defined in configuration');
        return;
    }

    const handleNodeTagFile = async (path: vscode.Uri) => {
        if (!await utils.fileExists(path)) {
            return;
        }

        log.debug('processing %s NodeTags file', path.fsPath);
        const document = await vscode.workspace.openTextDocument(path)
        try {
            const added = execCtx.nodeVarRegistry.updateNodeTypesFromFile(document);
            log.debug('added %i NodeTags from %s file', added, path.fsPath);
        } catch (err: any) {
            log.error('could not initialize node tags array', err);
        }
    }

    const setupSingleFolder = async (folder: vscode.WorkspaceFolder) => {
        for (const file of nodeTagFiles) {
            const filePath = utils.joinPath(folder.uri, file);
            await handleNodeTagFile(filePath);

            7
            const filePattern = new vscode.RelativePattern(folder, file);
            const watcher = vscode.workspace.createFileSystemWatcher(filePattern,
                false, false, true);
            watcher.onDidChange(uri => {
                log.info('detected change in NodeTag file: %s', uri);
                handleNodeTagFile(uri);
            }, context.subscriptions);
            watcher.onDidCreate(uri => {
                log.info('detected creation of NodeTag file: %s', uri);
                handleNodeTagFile(uri);
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
    if (typeof configValue !== 'string') {
        return utils.LogLevel.Info;
    }
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
        PgindentPath: 'pgindentPath',
        PgbsdindentPath: 'pgindentPath'
    };
    static Commands = {
        DumpNodeToLog: `${this.ExtensionName}.dumpNodeToLog`,
        OpenConfigFile: `${this.ExtensionName}.openConfigurationFile`,
        RefreshPostgresVariables: `${this.ExtensionName}.refreshPostgresVariablesView`,
        RefreshConfigFile: `${this.ExtensionName}.refreshConfigFile`,
        FormatterDiffView: `${this.ExtensionName}.formatterShowDiff`,
    };
    static Views = {
        NodePreviewTreeView: `${this.ExtensionName}.node-tree-view`,
    };
    static ExtensionSettingsFileName = 'pgsql_hacker_helper.json';

    static getLogLevel() {
        return this.getConfig<string>(this.ConfigSections.LogLevel) ?? '';
    };
    static getNodeTagFiles() {
        return this.getConfig<string[]>(this.ConfigSections.NodeTagFiles) ?? [];
    };

    static getPgindentPath() {
        return this.getConfig<string>(this.ConfigSections.PgindentPath);
    }

    static getCustomPgbsdindentPath() {
        return this.getConfig<string>(this.ConfigSections.PgbsdindentPath);
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