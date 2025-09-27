import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { getTestEnv, TestEnv } from './env';

import * as utils from '../../utils';

function getFormattedFile(env: TestEnv) {
    const path = env.getExtensionPath('src', 'test', 'patches', 'formatted.c');

    /*
     * I don't know why, but if we use vscode.workspace.fs.readFile, then
     * it just crashes (or something like that, i don't even understand - just
     * nothing further happens, even no Error is thrown), so use 'fs' module
     */
    return fs.readFileSync(path, {encoding: "utf8"});
}

suite('Formatting', async function () {
    /* set big timeout: git clone + make */
    this.timeout('5m');
    
    let unformattedFilePath: string;
    let env: TestEnv;
    let expected: string;
    suiteSetup(async () => {
        const swallow = async (fn: () => Promise<void>) => {
            try {
                await fn();
            } catch {
                /* skip */
            }
        };

        /* Remove cloned pg_bsd_indent */
        await swallow(async () => {
            const pgBsdIndentDir = 
                env.getWorkspaceFile('src', 'tools', 'pgindent', 'pg_bsd_indent');
            fs.rmdirSync(pgBsdIndentDir);
        });

        /* Clean already built pg_bsd_indent */
        await swallow(async () => {
            const pgBsdIndentDir = env.getWorkspaceFile('src', 'tools', 'pg_bsd_indent');
            const pgBsdIndent = path.join(pgBsdIndentDir, 'pg_bsd_indent');
            if (fs.existsSync(pgBsdIndent)) {
                await utils.execShell(
                    'make', ['clean'],
                    {cwd: pgBsdIndentDir},
                );
            }
        });
        
        env = getTestEnv();
        unformattedFilePath = env.getWorkspaceFile('unformatted.c');        
        expected = getFormattedFile(env);
    });

    setup(async () => {
        /* Reset unformatted file (just copy) */
        const originalFile = env.getExtensionPath(
            'src', 'test', 'patches', 'unformatted.c');
        fs.copyFileSync(originalFile, unformattedFilePath);
    });

    const formatTest = async (t: Mocha.Context) => {
        if (!env.pgVersionSatisfies('10')) {
            t.skip();
        }

        /* Open test file */
        const doc = await vscode.workspace.openTextDocument(unformattedFilePath);

        /* 
         * Focus editor and run 'Format Document' (Ctrl + Shift + I)
         * just like user does this
         */
        await vscode.window.showTextDocument(doc, undefined,
                                             false /* focus */);        
        await vscode.commands.executeCommand('editor.action.formatDocument');

        const actual = doc.getText();
        assert.equal(actual, expected);
    };

    test('Format clean', async function () {
        await formatTest(this);
    });

    test('Format again', async function () {
        await formatTest(this);
    });
});
