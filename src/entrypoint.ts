import * as vscode from 'vscode';
import * as vars from './variables';
import * as utils from './utils';
import * as formatter from './formatter';
import { setupDebugger } from './debugger';

import {
    NodePreviewTreeViewProvider,
    NodePreviewTreeViewProvider as PgVariablesView,
    Configuration as config,
    getCurrentLogLevel,
    setupExtension
} from './extension';

function createLogger(context: vscode.ExtensionContext): utils.ILogger {
    let outputChannel;
    let logger;
    
    if (utils.Features.hasLogOutputChannel()) {
        outputChannel = vscode.window.createOutputChannel(config.ExtensionPrettyName, {log: true});
        logger = new utils.VsCodeLogger(outputChannel);
    } else {
        if (utils.Features.logOutputLanguageEnabled()) {
            outputChannel = vscode.window.createOutputChannel(config.ExtensionPrettyName, 'log');
        } else {
            outputChannel = vscode.window.createOutputChannel(config.ExtensionPrettyName);
        }
        
        const logLevelConfigSection = config.ConfigSections.LogLevel;
        const fullConfigSectionName = config.getFullConfigSection(logLevelConfigSection);
        const vsLogger = new utils.ObsoleteVsCodeLogger(outputChannel, getCurrentLogLevel());
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
            if (!event.affectsConfiguration(fullConfigSectionName)) {
                return;
            }
    
            vsLogger.minLogLevel = getCurrentLogLevel();
        }, undefined, context.subscriptions));
        logger = vsLogger;
    }

    context.subscriptions.push(outputChannel);
    return logger;
}

function createPostgresVariablesView(context: vscode.ExtensionContext,
                                     logger: utils.ILogger,
                                     nodeVars: vars.NodeVarRegistry,
                                     specialMembers: vars.SpecialMemberRegistry,
                                     hashTableTypes: vars.HashTableTypes) {
    const nodesView = new PgVariablesView(logger, nodeVars, 
                                          specialMembers, hashTableTypes);
    const nodesViewName = config.Views.NodePreviewTreeView;
    const treeDisposable = vscode.window.registerTreeDataProvider(nodesViewName,
                                                                  nodesView);
    context.subscriptions.push(treeDisposable);
    return nodesView;
}

export function activate(context: vscode.ExtensionContext) {
    const logger = createLogger(context);
    try {
        logger.info('Extension is activating');
        const nodeVars = new vars.NodeVarRegistry();
        const specialMembers = new vars.SpecialMemberRegistry();
        const hashTableTypes = new vars.HashTableTypes();

        const nodesView = createPostgresVariablesView(context, logger, nodeVars, 
                                                      specialMembers, hashTableTypes);

        setupExtension(context, specialMembers, nodeVars, hashTableTypes, logger, nodesView);
        setupDebugger(nodesView, context);

        formatter.registerFormatting(logger);

        config.setExtensionActive(true);

        logger.info('Extension activated');
    } catch (error) {
        logger.error('Failed to activate extension', error);
        config.setExtensionActive(false);
    }
}

export function deactivate() {
    config.setExtensionActive(false);
}
