import * as vscode from 'vscode';
import { Log as logger, initLogger } from './logger';
import { setupExtension } from './extension';
import { ExtensionId } from './configuration';

async function setExtensionActive(status: boolean) {
    const context = `${ExtensionId}:activated`;
    vscode.commands.executeCommand('setContext', context, status);
}

export async function activate(context: vscode.ExtensionContext) {
    initLogger(context);
    try {
        logger.info('Extension is activating: version', context.extension.packageJSON?.version);
        setupExtension(context);
        await setExtensionActive(true);
        logger.info('Extension activated');
    } catch (error) {
        logger.error(error, 'Failed to activate extension');
        await setExtensionActive(false);
    }
}

export async function deactivate() {
    await setExtensionActive(false);
}
