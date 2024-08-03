import * as vscode from 'vscode';
import * as sm from './special_member';
import { NodePreviewTreeViewProvider, dumpVariableToLogCommand, NodeVarFacade, Configuration as config } from './extension';
import { ILogger, OutputChannelLogger as VsCodeLogger, VsCodeDebuggerFacade, fileExists, LogLevel } from './utils';

async function processNodeTagFiles(vars: NodeVarFacade, log: ILogger, context: vscode.ExtensionContext): Promise<undefined> {
    const section = vscode.workspace.getConfiguration(config.ConfigSections.TopLevelSection);
    const nodeTagFiles = section.get<string[]>(config.ConfigSections.NodeTagFiles);

    if (!(nodeTagFiles && 0 < nodeTagFiles.length)) {
        const fullSectionName = config.ConfigSections.fullSection(config.ConfigSections.NodeTagFiles);
        log.error(`no NodeTag files defined. check ${fullSectionName} setting`);
        return;
    }

    const handleNodeTagFile = async (path: vscode.Uri) => {
        if (!await fileExists(path)) {
            return;
        }

        log.debug(`processing ${path.fsPath} NodeTags file`);
        const document = await vscode.workspace.openTextDocument(path)
        try {
            vars.updateNodeTypesFromFile(document);
        } catch (err: any) {
            log.error(`could not initialize node tags array`, err);
        }
    }
    await Promise.all(
        vscode.workspace.workspaceFolders!.flatMap(folder => 
            nodeTagFiles.map(async filePath => {
                filePath = filePath.trim();
                const fullPath = filePath.startsWith('/')
                    ? filePath                              /* Absolute path - user defined global tag file (maybe) */
                    : folder.uri.fsPath + '/' + filePath;   /* Relative path - search current workspace */
                await handleNodeTagFile(vscode.Uri.file(fullPath));

                /* 
                 * Create watcher to handle file updates and creations, but not deletions.
                 * This is required, because extension can be activated before running
                 * of 'configure' script and NodeTags are not created at that moment.
                 * We will handle them later
                 */
                const watcher = vscode.workspace.createFileSystemWatcher(filePath, false, false, true);
                watcher.onDidChange(uri => {
                    log.info(`detected change in NodeTag file: ${uri.fsPath}`);
                    handleNodeTagFile(uri);
                }, context.subscriptions);
                watcher.onDidCreate(uri => {
                    log.info(`detected creation of NodeTag file: ${uri.fsPath}`);
                    handleNodeTagFile(uri);
                }, context.subscriptions);
                
                context.subscriptions.push(watcher);
            })
        )
    );
}

function registerSpecialMembersSettingsFile(provider: NodePreviewTreeViewProvider, log: ILogger, context: vscode.ExtensionContext) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return;
    }

    const processSettingsFile = async (pathToFile: vscode.Uri) => {
        let doc = undefined;
        try {
            doc = await vscode.workspace.openTextDocument(pathToFile);
        } catch (err: any) {
            log.error(`failed to read settings file ${pathToFile.fsPath}`, err);
            return;
        }

        let data = undefined;
        let text = undefined;
        try {
            text = doc.getText();
        } catch (err: any) {
            log.error(`failed to read settings file ${doc.uri.fsPath}`, err);
            return;
        }

        try {
            data = JSON.parse(text);
        } catch (err: any) {
            log.error(`failed to parse JSON settings file ${doc.uri.fsPath}`, err);
            return;
        }
        const specialMembers = data.specialMembers;
        if (!specialMembers) {
            return;
        }

        if (Array.isArray(specialMembers.array) && 0 < specialMembers.array.length) {
            try {
                const members: sm.SpecialMember[] = [];
                for (let index = 0; index < data.array.length; index++) {
                    const element = data.array[index];
                    members.push(sm.createSpecialMember({
                        type: 'array',
                        ...element,
                    }, log));
                }
                provider.addSpecialMembers(members);
                log.debug(`added ${members.length} special members from ${doc.uri.fsPath}`);
            } catch (err: any) {
                log.error(`error while parsing json settings file ${doc.uri.fsPath}`, err)
            }
        }
    }

    vscode.workspace.workspaceFolders.forEach((folder, i) => {
        const pathToFile = vscode.Uri.joinPath(folder.uri, '.vscode', config.ExtensionSettingsFileName);
        fileExists(pathToFile).then(async exists => {
            /* 
             * Track change and create events, but not delete -
             * currently no mechanism to track deltas in files.
             */
            let trackCreateEvent = true;
            if (exists) {
                trackCreateEvent = false;
                await processSettingsFile(pathToFile);
                return;
            }

            const watcher = vscode.workspace.createFileSystemWatcher(pathToFile.fsPath, trackCreateEvent, false, true);
            if (trackCreateEvent) {
                watcher.onDidCreate(processSettingsFile);
            }
            watcher.onDidChange(processSettingsFile);
            
            context.subscriptions.push(watcher);
        }, () => log.debug(`settings file ${pathToFile.fsPath} does not exist`));
    });

    /* TODO: 
     * - command - create settings file
     * - command - referesh variables view (+ button)
     */
}

function createNodeVariablesDataProvider(logger: VsCodeLogger, debug: VsCodeDebuggerFacade, context: vscode.ExtensionContext) {
    const vars = new NodeVarFacade();
    const dataProvider = new NodePreviewTreeViewProvider(logger, vars, debug);
    /* 
     * When registering special members all NodeTags must be known to figure out 
     * errors in configuration. So wait for tags initialization and process
     * special members after that.
     */
    processNodeTagFiles(vars, logger, context).then(_ => {
        dataProvider.addSpecialMembers(sm.getWellKnownSpecialMembers(logger));
        registerSpecialMembersSettingsFile(dataProvider, logger, context);
    });
    return dataProvider;
}

function createLogger(context: vscode.ExtensionContext): VsCodeLogger {
    const outputChannel = vscode.window.createOutputChannel(config.ExtensionPrettyName, 'log');
    const configuration = vscode.workspace.getConfiguration(config.ConfigSections.TopLevelSection);
    const getLogLevel = () => {
        const configValue = configuration.get(config.ConfigSections.LogLevel);
        if (typeof configValue !== 'string') {
            return LogLevel.Info;
        }
        switch (configValue) {
            case 'INFO':
                return LogLevel.Info;
            case 'DEBUG':
                return LogLevel.Debug;
            case 'WARNING':
                return LogLevel.Warn;
            case 'ERROR':
                return LogLevel.Error;
            case 'DISABLE':
                return LogLevel.Disable;
            default:
                outputChannel.appendLine(`Unknown log level '${configValue}' - setting to 'INFO'`);
                return LogLevel.Info;
        }
    }
    const logger = new VsCodeLogger(outputChannel, getLogLevel());
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
    if (!vscode.workspace.workspaceFolders) {
        return;
    }

    const logger = createLogger(context);
    logger.info('Extension is activating');
    const debug = new VsCodeDebuggerFacade();

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

    context.subscriptions.push(asiDisposable);
    context.subscriptions.push(dumpVarsToLogCmd);
    context.subscriptions.push(treeDisposable);
    context.subscriptions.push(debug);
    logger.info('Extension activated');
}

export function deactivate() { }
