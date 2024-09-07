import * as vscode from 'vscode';
import * as vars from './variables';
import * as utils from './utils';
import {
    NodePreviewTreeViewProvider as PostgresVariablesView,
    Configuration as config,
    setupExtension
} from './extension';

function createDebugFacade(context: vscode.ExtensionContext) {
    const debug = new utils.VsCodeDebuggerFacade();
    if (!utils.Features.hasEvaluateArrayLength()) {
        debug.switchToManualArrayExpansion();
    }
    context.subscriptions.push(debug);
    return debug;
}

function createOutputChannel() {
    if (utils.Features.logOutputLanguageEnabled()) {
        return vscode.window.createOutputChannel(config.ExtensionPrettyName, 'log');
    } else {
        return vscode.window.createOutputChannel(config.ExtensionPrettyName);
    }
}

function createLogger(context: vscode.ExtensionContext): utils.VsCodeLogger {
    const outputChannel = createOutputChannel();
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
    const logLevel = config.ConfigSections.LogLevel;
    const fullConfigSectionName = config.ConfigSections.fullSection(logLevel);
    vscode.workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration(fullConfigSectionName)) {
            return;
        }

        logger.minLogLevel = getLogLevel();
    }, undefined, context.subscriptions);

    context.subscriptions.push(outputChannel);
    return logger;
}

function createPostgresVariablesView(context: vscode.ExtensionContext, logger: utils.ILogger,
                                     execContext: vars.ExecContext) {
    const nodesView = new PostgresVariablesView(logger, execContext);
    const treeDisposable = vscode.window.registerTreeDataProvider(config.Views.NodePreviewTreeView,
                                                                  nodesView);
    context.subscriptions.push(treeDisposable);
    return nodesView;
}

function setupDebugger(
    dataProvider: PostgresVariablesView,
    logger: utils.ILogger,
    context: vscode.ExtensionContext) {

    if (utils.Features.debugFocusEnabled()) {
        vscode.debug.onDidChangeActiveStackItem(() => dataProvider.refresh(),
            undefined, context.subscriptions);
    } else {
        logger.warn(
            `Current version of VS Code (${vscode.version}) do not support ` +
            'debugFocus API, falling back to compatible event-based implementation. ' +
            'Some features might be not accessible. ' +
            'Please update VS Code to version 1.90 or higher',
        );

        dataProvider.switchToEventBasedRefresh(context);
    }
    return;
}

export function activate(context: vscode.ExtensionContext) {
    const logger = createLogger(context);
    try {
        logger.info('Extension is activating');
        const execContext = {
            debug: createDebugFacade(context),
            nodeVarRegistry: new vars.NodeVarRegistry(),
            specialMemberRegistry: new vars.SpecialMemberRegistry(),
        } as vars.ExecContext;
        const nodesView = createPostgresVariablesView(context, logger, execContext);
        
        setupExtension(context, execContext, logger, nodesView);
                
        setupDebugger(nodesView, logger, context);

        vscode.commands.executeCommand('setContext', config.Contexts.ExtensionActivated, true);
        logger.info('Extension activated');
    } catch (error) {
        logger.error('Failed to activate extension', error);
    }
}

export function deactivate() {
    vscode.commands.executeCommand('setContext', config.Contexts.ExtensionActivated, false);
}
