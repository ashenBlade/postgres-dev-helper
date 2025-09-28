import * as vscode from 'vscode';
import { Log as logger, initLogger } from './logger';
import {
    Configuration as config,
    setupExtension,
} from './extension';

function setExtensionActive(status: boolean) {
    const context = `${config.ExtensionName}:activated`;
    vscode.commands.executeCommand('setContext', context, status);
}

export function activate(context: vscode.ExtensionContext) {
    initLogger(context);
    try {
        logger.info('Extension is activating');
        setupExtension(context);
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
