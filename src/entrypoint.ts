import * as vscode from 'vscode';
import * as vars from './variables';
import * as formatter from './formatter';
import { Log as logger, initLogger } from './logger';
import { setupDebugger } from './debugger';
import {
    NodePreviewTreeViewProvider as PgVariablesView,
    Configuration as config,
    setupExtension,
} from './extension';

function setExtensionActive(status: boolean) {
    const context = `${config.ExtensionName}:activated`;
    vscode.commands.executeCommand('setContext', context, status);
}

function createPostgresVariablesView(context: vscode.ExtensionContext,
                                     nodeVars: vars.NodeVarRegistry) {
    const nodesView = new PgVariablesView(nodeVars);
    const nodesViewName = config.Views.NodePreviewTreeView;
    const treeDisposable = vscode.window.registerTreeDataProvider(nodesViewName,
                                                                  nodesView);
    context.subscriptions.push(treeDisposable);
    return nodesView;
}

export function activate(context: vscode.ExtensionContext) {
    initLogger(context);
    try {
        logger.info('Extension is activating');
        const nodeVars = new vars.NodeVarRegistry();
        const nodesView = createPostgresVariablesView(context, nodeVars);

        setupExtension(context, nodeVars, nodesView);
        setupDebugger(nodesView, context);

        formatter.registerFormatting();

        setExtensionActive(true);

        logger.info('Extension activated');
    } catch (error) {
        logger.error('Failed to activate extension', error);
        setExtensionActive(false);
    }
}

export function deactivate() {
    setExtensionActive(false);
}
