import * as vscode from 'vscode';
import { NodePreviewTreeViewProvider, dumpVariableToLogCommand, NodeVarFacade, Configuration as config } from './extension';
import { ILogger, OutputChannelLogger, VsCodeDebuggerFacade } from './utils';

function processNodeTagFiles(vars: NodeVarFacade, folders: readonly vscode.WorkspaceFolder[],
    log: ILogger, context: vscode.ExtensionContext) {
    const section = vscode.workspace.getConfiguration(config.ConfigSections.TopLevelSection);
    const nodeTagFiles = section.get<string[]>(config.ConfigSections.NodeTagFiles);

    if (!(nodeTagFiles && 0 < nodeTagFiles.length)) {
        const fullSectionName = `${config.ConfigSections.TopLevelSection}.${config.ConfigSections.NodeTagFiles}`;
        log.error(`no NodeTag files defined. check ${fullSectionName} setting`);
        return;
    }

    const handleNodeTagFile = (path: vscode.Uri) => {
        vscode.workspace.openTextDocument(path).then(document => {
            try {
                vars.updateNodeTypesFromFile(document);
            } catch (err: any) {
                log.error(`could not initialize node tags array - ${err.toString()}`);
            }
        }, reason => {
            log.info(`could not open file ${path} to obtain node tags: ${JSON.stringify(reason)}`);
        });
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

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel(config.ExtensionPrettyName, 'log');
    const log = new OutputChannelLogger(outputChannel);
    
    if (!vscode.workspace.workspaceFolders) {
        log.error('no workspaces found - not activating extension');
        return;
    }
    log.info('Extension is activating');
    const debug = new VsCodeDebuggerFacade();
    
    
    /* Read files with NodeTag and register watcher to track updates */
    const vars = new NodeVarFacade();
    processNodeTagFiles(vars, vscode.workspace.workspaceFolders, log, context);
    
    /* Register command to dump variable to log */
    const dumpVarsToLogCmd = vscode.commands.registerCommand(config.Commands.DumpNodeToLog, async (args) => {
        try {
            await dumpVariableToLogCommand(args, log, debug);
        } catch (err: any) {
            const msg = err instanceof Error ? err.message : JSON.stringify(err);
            log.error(`could not dump node to log - ${msg}`);
        }
    });

    /* Setup Node* view in debug view container */
    const dataProvider = new NodePreviewTreeViewProvider(log, vars, debug);
    const treeDisposable = vscode.window.registerTreeDataProvider(config.Views.NodePreviewTreeView, dataProvider);
    const asiDisposable = vscode.debug.onDidChangeActiveStackItem(() => dataProvider.refresh());

    context.subscriptions.push(asiDisposable);
    context.subscriptions.push(dumpVarsToLogCmd);
    context.subscriptions.push(treeDisposable);
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(debug);
    log.info('Extension activated successfully');
}

export function deactivate() { }
