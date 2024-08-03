import * as vscode from 'vscode';
import * as sm from './special_member';
import { NodePreviewTreeViewProvider, dumpVariableToLogCommand, NodeVarFacade, Configuration as config } from './extension';
import { ILogger, OutputChannelLogger, VsCodeDebuggerFacade, fileExists } from './utils';

function processNodeTagFiles(vars: NodeVarFacade, folders: readonly vscode.WorkspaceFolder[],
    log: ILogger, context: vscode.ExtensionContext) {
    const section = vscode.workspace.getConfiguration(config.ConfigSections.TopLevelSection);
    const nodeTagFiles = section.get<string[]>(config.ConfigSections.NodeTagFiles);

    if (!(nodeTagFiles && 0 < nodeTagFiles.length)) {
        const fullSectionName = `${config.ConfigSections.TopLevelSection}.${config.ConfigSections.NodeTagFiles}`;
        log.error(`no NodeTag files defined. check ${fullSectionName} setting`);
        return;
    }

    const handleNodeTagFile = async (path: vscode.Uri) => {
        if (!await fileExists(path)) {
            return;
        }

        const document = await vscode.workspace.openTextDocument(path)
        try {
            vars.updateNodeTypesFromFile(document);
        } catch (err: any) {
            log.error(`could not initialize node tags array`, err);
        }
    }

    folders.forEach(folder => {
        nodeTagFiles.forEach(filePath => {
            filePath = filePath.trim();
            const fullPath = filePath.startsWith('/')
                ? filePath                              /* Absolute path - user defined global tag file (maybe) */
                : folder.uri.fsPath + '/' + filePath;   /* Relative path - search current workspace */

            handleNodeTagFile(vscode.Uri.file(fullPath));

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
            });
            watcher.onDidCreate(uri => {
                log.info(`detected creation of NodeTag file: ${uri.fsPath}`);
                handleNodeTagFile(uri);
            });

            context.subscriptions.push(watcher);
        });
    });
}

function registerSpecialMembersSettingsFile(provider: NodePreviewTreeViewProvider, log: ILogger, context: vscode.ExtensionContext) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return;
    }

    vscode.workspace.workspaceFolders.forEach((folder, i) => {
        const pathToFile = vscode.Uri.joinPath(folder.uri, '.vscode', config.ExtensionSettingsFileName);
        fileExists(pathToFile).then(async exists => {
            if (!exists) {
                log.debug(`settings file ${pathToFile} does not exist`)
                return;
            }

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

            if (data.array && data.array instanceof Array && data.array.length > 0) {
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
        }, () => log.debug(`settings file ${pathToFile} does not exist`));
    });

    /* TODO: 
     * - register file watcher 
     * - schema for settings json file
     * - log level filter in settings
     */
}

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel(config.ExtensionPrettyName, 'log');
    const log = new OutputChannelLogger(outputChannel);
    
    if (!vscode.workspace.workspaceFolders) {
        log.error('no workspaces found - not activating extension');
        return;
    }
    log.info('Extension is activating');
    const debug = new VsCodeDebuggerFacade();

    /* Register command to dump variable to log */
    const dumpVarsToLogCmd = vscode.commands.registerCommand(config.Commands.DumpNodeToLog, async (args) => {
        try {
            await dumpVariableToLogCommand(args, log, debug);
        } catch (err: any) {
            log.error(`could not dump node to log`, err);
        }
    });
    
    /* Setup Node variable support */
    const vars = new NodeVarFacade();
    processNodeTagFiles(vars, vscode.workspace.workspaceFolders, log, context);
    const dataProvider = new NodePreviewTreeViewProvider(log, vars, debug);
    dataProvider.addSpecialMembers(sm.getWellKnownSpecialMembers(log));
    registerSpecialMembersSettingsFile(dataProvider, log, context);
    const treeDisposable = vscode.window.registerTreeDataProvider(config.Views.NodePreviewTreeView, dataProvider);
    const asiDisposable = vscode.debug.onDidChangeActiveStackItem(() => dataProvider.refresh());

    context.subscriptions.push(asiDisposable);
    context.subscriptions.push(dumpVarsToLogCmd);
    context.subscriptions.push(treeDisposable);
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(debug);
    log.info('Extension activated');
}

export function deactivate() { }
