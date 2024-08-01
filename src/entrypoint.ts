import * as vscode from 'vscode';
import { NodePreviewTreeViewProvider, dumpVariableToLogCommand, NodeVarFacade } from './extension';
import { OutputChannelLogger } from './utils';

export function activate(context: vscode.ExtensionContext) {
    const ExtensionName = 'postgresql-hacker-helper';
    const ExtensionPrettyName = 'PostgreSQL Hacker Helper';
    const outputChannel = vscode.window.createOutputChannel(ExtensionPrettyName, 'log');
    const log = new OutputChannelLogger(outputChannel);

    if (!vscode.workspace.workspaceFolders) {
        log.error('no workspaces found - not activating extension');
        return;
    }

    const vars = new NodeVarFacade();
    vscode.workspace.workspaceFolders.forEach(folder => {
        /* TODO: move to settings */
        ['/src/include/nodes/nodes.h', '/src/include/nodes/nodetags.h'].forEach(filePath => {
            const fullPath = filePath.startsWith('/')
                ? filePath                              /* Absolute path - user defined global tag file (maybe) */
                : folder.uri.fsPath + '/' + filePath;   /* Relative path - search current workspace */
            vscode.workspace.openTextDocument(vscode.Uri.file(folder.uri.fsPath + filePath)).then(document => {
                try {
                    vars.updateNodeTypesFromFile(document);
                } catch (err: any) {
                    log.error(`could not initialize node tags array - ${err.toString()}`);
                }
            }, _ => {
                log.info(`could not open file ${filePath} to obtain node tags`);
            });
        });
    });

    const dumpVarsToLogCmd = vscode.commands.registerCommand(`${ExtensionName}.dumpNodeToLog`, async (args) => {
        try {
            await dumpVariableToLogCommand(args, log);
        } catch (err: any) {
            log.error('could not dump node to log - ' + JSON.stringify(err));
        }
    });

    const dataProvider = new NodePreviewTreeViewProvider(log, vars);
    const treeDisposable = vscode.window.registerTreeDataProvider(`${ExtensionName}.node-tree-view`, dataProvider);
    const asiDisposable = vscode.debug.onDidChangeActiveStackItem(() => dataProvider.refresh());

    context.subscriptions.push(asiDisposable);
    context.subscriptions.push(dumpVarsToLogCmd);
    context.subscriptions.push(treeDisposable);
    context.subscriptions.push(outputChannel);
}

export function deactivate() { }
