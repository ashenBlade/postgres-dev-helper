import * as vscode from 'vscode';
import * as vars from './variables';
import * as utils from './utils';
import { NodePreviewTreeViewProvider, dumpVariableToLogCommand, Configuration as config, setupConfigFiles } from './extension';

async function processNodeTagFiles(vars: vars.NodeVarRegistry, log: utils.ILogger, context: vscode.ExtensionContext): Promise<undefined> {
    const section = vscode.workspace.getConfiguration(config.ConfigSections.TopLevelSection);
    const nodeTagFiles = section.get<string[]>(config.ConfigSections.NodeTagFiles);

    if (!(nodeTagFiles && 0 < nodeTagFiles.length)) {
        const fullSectionName = config.ConfigSections.fullSection(config.ConfigSections.NodeTagFiles);
        log.error(`no NodeTag files defined. check ${fullSectionName} setting`);
        return;
    }

    const handleNodeTagFile = async (path: vscode.Uri) => {
        if (!await utils.fileExists(path)) {
            return;
        }

        log.debug(`processing ${path.fsPath} NodeTags file`);
        const document = await vscode.workspace.openTextDocument(path)
        try {
            const added = vars.updateNodeTypesFromFile(document);
            log.debug(`added ${added} NodeTags from ${path.fsPath} file`);
        } catch (err: any) {
            log.error(`could not initialize node tags array`, err);
        }
    }

    const processFolder = async (folder: vscode.WorkspaceFolder) => {
        await Promise.all(nodeTagFiles.map(async filePath => {
            await handleNodeTagFile(vscode.Uri.file(folder.uri.fsPath + '/' + filePath));

            /* 
            * Create watcher to handle file updates and creations, but not deletions.
            * This is required, because extension can be activated before running
            * of 'configure' script and NodeTags are not created at that moment.
            * We will handle them later
            */

            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, filePath), false, false, true);
            watcher.onDidChange(uri => {
                log.info(`detected change in NodeTag file: ${uri.fsPath}`);
                handleNodeTagFile(uri);
            }, context.subscriptions);
            watcher.onDidCreate(uri => {
                log.info(`detected creation of NodeTag file: ${uri.fsPath}`);
                handleNodeTagFile(uri);
            }, context.subscriptions);

            context.subscriptions.push(watcher);
        }));
    }

    if (vscode.workspace.workspaceFolders?.length) {
        await Promise.all(
            vscode.workspace.workspaceFolders.flatMap(async folder =>
                await processFolder(folder)
            )
        );
    }

    vscode.workspace.onDidChangeWorkspaceFolders(async e => {
        for (let i = 0; i < e.added.length; i++) {
            const folder = e.added[i];
            await processFolder(folder);
        }
    }, undefined, context.subscriptions);
}

function createNodeVariablesDataProvider(logger: utils.VsCodeLogger, debug: utils.VsCodeDebuggerFacade, context: vscode.ExtensionContext) {
    const nodeRegistry = new vars.NodeVarRegistry();
    const execCtx: vars.ExecContext = {
        debug,
        nodeVarRegistry: nodeRegistry,
        specialMemberRegistry: new vars.SpecialMemberRegistry(),
    }
    const dataProvider = new NodePreviewTreeViewProvider(logger, execCtx);

    /* 
    * When registering special members all NodeTags must be known to figure out 
    * errors in configuration. So wait for tags initialization and process
    * special members after that.
    */
    processNodeTagFiles(nodeRegistry, logger, context).then(_ => {
        execCtx.specialMemberRegistry.addArraySpecialMembers(vars.getWellKnownSpecialMembers());
        setupConfigFiles(execCtx, logger, context);
    });
    return dataProvider;
}

function createLogger(context: vscode.ExtensionContext): utils.VsCodeLogger {
    const outputChannel = vscode.window.createOutputChannel(config.ExtensionPrettyName, 'log');
    const configuration = vscode.workspace.getConfiguration(config.ConfigSections.TopLevelSection);
    const getLogLevel = () => {
        const configValue = configuration.get(config.ConfigSections.LogLevel);
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
                outputChannel.appendLine(`Unknown log level '${configValue}' - setting to 'INFO'`);
                return utils.LogLevel.Info;
        }
    }
    const logger = new utils.VsCodeLogger(outputChannel, getLogLevel());
    const fullConfigSectionName = config.ConfigSections.fullSection(config.ConfigSections.LogLevel);
    vscode.workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration(fullConfigSectionName)) {
            return;
        }

        logger.minLogLevel = getLogLevel();
    }, undefined, context.subscriptions);

    context.subscriptions.push(outputChannel);
    return logger;
}

export function activate(context: vscode.ExtensionContext) {
    const logger = createLogger(context);
    logger.info('Extension is activating');
    const debug = new utils.VsCodeDebuggerFacade();

    /* Register command to dump variable to log */
    const dumpVarsToLogCmd = vscode.commands.registerCommand(config.Commands.DumpNodeToLog, async (args) => {
        try {
            await dumpVariableToLogCommand(args, logger, debug);
        } catch (err: any) {
            logger.error(`could not dump node to log`, err);
        }
    });

    /* Setup Node variable support */

    const dataProvider = createNodeVariablesDataProvider(logger, debug, context);

    const treeDisposable = vscode.window.registerTreeDataProvider(config.Views.NodePreviewTreeView, dataProvider);
    const asiDisposable = vscode.debug.onDidChangeActiveStackItem(() => dataProvider.refresh());
    const refreshVariablesCommand = vscode.commands.registerCommand(config.Commands.RefreshPostgresVariables, () => {
        dataProvider.refresh();
    });

    context.subscriptions.push(refreshVariablesCommand);
    context.subscriptions.push(asiDisposable);
    context.subscriptions.push(dumpVarsToLogCmd);
    context.subscriptions.push(treeDisposable);
    context.subscriptions.push(debug);
    vscode.commands.executeCommand('setContext', config.Contexts.ExtensionActivated, true);

    logger.info('Extension activated');
}

export function deactivate() {
    vscode.commands.executeCommand('setContext', config.Contexts.ExtensionActivated, false);
 }
