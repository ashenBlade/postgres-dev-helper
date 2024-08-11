import * as vscode from 'vscode';
import * as vars from './variables';
import * as utils from './utils';
import * as fs from 'fs';
import { NodePreviewTreeViewProvider, dumpVariableToLogCommand, Configuration as config } from './extension';

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

function registerSpecialMembersSettingsFile(smRegistry: vars.SpecialMemberRegistry, log: utils.ILogger, context: vscode.ExtensionContext) {
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
                const members = [];
                for (let index = 0; index < specialMembers.array.length; index++) {
                    const element = specialMembers.array[index];
                    members.push(vars.createArraySpecialMemberInfo(element));
                }
                smRegistry.addArraySpecialMembers(members);
                log.debug(`added ${members.length} special members from ${doc.uri.fsPath}`);
            } catch (err: any) {
                log.error(`error while parsing json settings file ${doc.uri.fsPath}`, err)
            }
        }
    }

    const processFolders = (folders: readonly vscode.WorkspaceFolder[]) => {
        const propertiesFilePath = vscode.Uri.joinPath(folders[0].uri, '.vscode', config.ExtensionSettingsFileName);
        const cmdDisposable = vscode.commands.registerCommand(config.Commands.OpenConfigFile, async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showInformationMessage('No workspaces found - open directory first');
                return;
            }

            const propertiesFileExists = await utils.fileExists(propertiesFilePath);
            /* Create default configuration file if not exists */
            if (!propertiesFileExists) {
                if (await utils.fsEntryExists(propertiesFilePath)) {
                    vscode.window.showErrorMessage(`Can not create ${config.ExtensionSettingsFileName} - fs entry exists and not file`);
                    return;
                }

                log.debug(`creating ${propertiesFilePath} configuration file`);
                const configDirectoryPath = vscode.Uri.joinPath(propertiesFilePath, '..');
                if (!await utils.directoryExists(configDirectoryPath)) {
                    try {
                        fs.mkdirSync(configDirectoryPath.fsPath);
                    } catch (err) {
                        log.error(`failed to create config directory`, err);
                        return;
                    }
                }

                try {
                    fs.writeFileSync(propertiesFilePath.fsPath, JSON.stringify({
                        version: 2,
                        specialMembers: {
                            array: []
                        }
                    }, undefined, '    '));
                } catch (err: any) {
                    log.error(`Could not write default configuration file`, err);
                    vscode.window.showErrorMessage('Error creating configuration file');
                    return;
                }
            }

            let doc;
            try {
                doc = await vscode.workspace.openTextDocument(propertiesFilePath)
            } catch (err: any) {
                log.error(`failed to open configuration file`, err);
                return;
            }

            try {
                await vscode.window.showTextDocument(doc);
            } catch (err: any) {
                log.error(`failed to show configuration file`, err);
                return;
            }
        });

        context.subscriptions.push(cmdDisposable);

        folders.forEach(folder => {
            const pathToFile = vscode.Uri.joinPath(folder.uri, '.vscode', config.ExtensionSettingsFileName);
            utils.fileExists(pathToFile).then(async exists => {
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

        const refreshConfigCmdDisposable = vscode.commands.registerCommand(config.Commands.RefreshConfigFile, async () => {
            if (!await utils.fileExists(propertiesFilePath)) {
                const answer = await vscode.window.showWarningMessage(`Config file does not exist. Create?`, 'Yes', 'No');
                if (answer !== 'Yes') {
                    return;
                }

                await vscode.commands.executeCommand(config.Commands.OpenConfigFile);
                return;
            }

            log.info(`refreshing config file due to command execution`);
            try {
                await processSettingsFile(propertiesFilePath);
            } catch (err: any) {
                log.error(`failed to update config file`, err);
            }
        });

        context.subscriptions.push(refreshConfigCmdDisposable);
    }

    /* Command to create configuration file */
    if (vscode.workspace.workspaceFolders) {
        processFolders(vscode.workspace.workspaceFolders);
    } else {
        /* Wait for folder open */
        vscode.workspace.onDidChangeWorkspaceFolders(e => {
            processFolders(e.added);
        }, context.subscriptions);
    }
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
        registerSpecialMembersSettingsFile(execCtx.specialMemberRegistry, logger, context);
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
    logger.info('Extension activated');
}

export function deactivate() { }
