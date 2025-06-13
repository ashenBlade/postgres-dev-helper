import * as vscode from 'vscode';
import * as vars from './variables';
import * as utils from './utils';
import * as dbg from './debugger';
import * as formatter from './formatter';
import {
    NodePreviewTreeViewProvider as PgVariablesView,
    Configuration as config,
    getCurrentLogLevel,
    setupExtension
} from './extension';

function createDebugFacade(context: vscode.ExtensionContext) {
    const debug = new dbg.CppDbgDebuggerFacade();
    if (!utils.Features.hasEvaluateArrayLength()) {
        debug.switchToManualArrayExpansion();
    }
    context.subscriptions.push(debug);
    return debug;
}

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
                                     debug: dbg.CppDbgDebuggerFacade,
                                     hashTableTypes: vars.HashTableTypes) {
    const nodesView = new PgVariablesView(logger, nodeVars, 
                                          specialMembers, debug, hashTableTypes);
    const nodesViewName = config.Views.NodePreviewTreeView;
    const treeDisposable = vscode.window.registerTreeDataProvider(nodesViewName,
                                                                  nodesView);
    context.subscriptions.push(treeDisposable);
    return nodesView;
}

function setupDebugger(
    dataProvider: PgVariablesView,
    logger: utils.ILogger,
    debug: dbg.CppDbgDebuggerFacade,
    context: vscode.ExtensionContext) {

    if (utils.Features.debugFocusEnabled()) {
        vscode.debug.onDidChangeActiveStackItem(() => dataProvider.refresh(),
            undefined, context.subscriptions);
    } else {
        logger.warn(
            'Current version of VS Code (%s) do not support ' +
            'debugFocus API, falling back to compatible event-based implementation. ' +
            'Some features might be not accessible. ' +
            'Please update VS Code to version 1.90 or higher', vscode.version
        );

        debug.switchToEventBasedRefresh(context, dataProvider);
    }
    return;
}

export function activate(context: vscode.ExtensionContext) {
    const logger = createLogger(context);
    try {
        logger.info('Extension is activating');
        const debug = createDebugFacade(context);
        const nodeVars = new vars.NodeVarRegistry();
        const specialMembers = new vars.SpecialMemberRegistry();
        const hashTableTypes = new vars.HashTableTypes();

        const nodesView = createPostgresVariablesView(context, logger, nodeVars, 
                                                      specialMembers, debug, hashTableTypes);

        setupExtension(context, specialMembers, nodeVars, hashTableTypes, debug, logger, nodesView);
                
        setupDebugger(nodesView, logger, debug, context);

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
