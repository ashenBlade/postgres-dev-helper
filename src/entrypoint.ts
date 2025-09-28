import * as vscode from 'vscode';
import { Log as logger, initLogger } from './logger';
import { setupExtension } from './extension';
import { ExtensionId } from './configuration';

function setExtensionActive(status: boolean) {
    const context = `${ExtensionId}:activated`;
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
