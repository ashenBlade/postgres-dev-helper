import * as vscode from 'vscode';

import * as constants from './constants';

function binarySearchPrefix(parameters: string[], input: string) {
    let start = 0;
    let end = parameters.length;

    while (start < end) {
        const mid = Math.floor((start + end) / 2);
        const cur = parameters[mid];
        const cmp =  cur.localeCompare(input);
        if (cmp < 0) {
            start = mid + 1;
        } else if (cmp > 0) {
            // end = mid - 1;
            end = mid;
        } else {
            /* There are must be no duplicates */
            return mid;
        }
    }

    if (start === parameters.length) {
        return -1;
    }
    
    /* 
     * As an input we are searching a prefix and not exact match,
     * so 'start' can point to any element: 1) with such prefix
     * or 2) previous element of 1.
     * i.e. with input 'enabl' binary search can result in 'start'
     * pointing to either 'effective_io_concurrency' (previous) or
     * 'enable_async_append' (target), so we should check both cases.
     */
    if (parameters[start].startsWith(input)) {
        return start;
    }

    if (   start < parameters.length - 1
        && parameters[start + 1].startsWith(input)) {
        return start + 1;
    }

    return -1;
}

export function getParamsByPrefix(parameters: string[], input: string): [number, number] | number | undefined {
    const start = binarySearchPrefix(parameters, input);

    if (start === -1) {
        /* No arguments match */
        return;
    }

    /* Last argument is the only */
    if (start === parameters.length - 1) {
        return start;
    }

    /*
     * Linearly search all prefixes. This is ok, since we know that there
     * are not so many parameters
     */
    let i = start;
    while (i < parameters.length - 1 && parameters[i + 1].startsWith(input)) {
        ++i;
    }

    if (start !== i) {
        /* Return 'i + 1', so Array.slice can be used by simple array expansion */
        return [start, i + 1];
    } else {
        return start;
    }
}

class PgConfCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return;
        }

        /*
         * For now use simple prefix match for autocompletion.
         * In future versions we should add fuzzy string match,
         * i.e. based on Jaccard or Levenshtein.
         * 
         * XXX: When implementing we should keep in mind, that
         * TS/JS is slow and likes to allocate huge memory, so
         * prefer simple, but faster algorithms.
         */
        const param = document.getText(range);
        const parameters = this.getGUCs();
        const prefixRange = getParamsByPrefix(parameters, param);
        if (prefixRange === undefined) {
            return;
        }
        
        if (typeof prefixRange === 'number') {
            return [new vscode.CompletionItem(parameters[prefixRange])];
        }
        
        if (Array.isArray(prefixRange)) {
            return parameters.slice(...prefixRange).map(p => new vscode.CompletionItem(p));
        }
    }

    private getGUCs() {
        /* 
         * Use only builtin GUCs, because tracking contribs is hard task.
         * We of course can traverse 'contrib/' directory and find all *.c
         * files - that what I did just now.
         *
         * But this approach gives another pain - resources consumption, IO,
         * CPU and memory. When I tested such logic on medium sized contrib dir
         * I faced high CPU consumption (even fans started making noise) and
         * memory (extension profiler showed up to 1GB heap size with sawtooth
         * shaped graph).
         * 
         * Another approach is to keep track of all contribs in code, i.e. have
         * another 'contribGucs' in 'constants.ts' with Map contrib -> it's GUCs,
         * but it will require to constant monitoring for changes, which is now
         * doesn't sound appealing yet.
         */
        return constants.getWellKnownConfigurationParameters();
    }
}

export function setupPgConfSupport(context: vscode.ExtensionContext) {
    const provider = new PgConfCompletionProvider();
    const d = vscode.languages.registerCompletionItemProvider('pgconf', provider);
    context.subscriptions.push(d);
}
