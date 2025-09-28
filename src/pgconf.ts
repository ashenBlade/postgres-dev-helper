import * as vscode from 'vscode';

import * as constants from './constants';

class PgConfCompletionProvider implements vscode.CompletionItemProvider {
    items?: vscode.CompletionItem[];;
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            /* Check this is a word (parameter) */
            return;
        }

        return this.items ??= constants.getWellKnownConfigurationParameters()
                                       .map(x => new vscode.CompletionItem(x));
    }
}

export function setupPgConfSupport(context: vscode.ExtensionContext) {
    const provider = new PgConfCompletionProvider();
    const d = vscode.languages.registerCompletionItemProvider('pgconf', provider);
    context.subscriptions.push(d);
}
