import * as path from 'path';
import * as process from 'process';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode,
         resolveCliArgsFromVSCodeExecutablePath,
         runTests } from '@vscode/test-electron';
import { getTestEnv } from './suite/env';

async function main() {
    /*
     * The folder containing the Extension Manifest package.json.
     * Passed to `--extensionDevelopmentPath` 
     */
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    /* 
     * The path to the extension test runner script.
     * Passed to --extensionTestsPath
     */
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    const testEnv = getTestEnv();
    /*
     * The path to source code of PostgreSQL we are testing now
     */
    const vscodeExecutablePath = await downloadAndUnzipVSCode(testEnv.vscodeVersion);
    const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    /* Install required debugger extension */
    let extraArgs: string[] = [];
    if (testEnv.testDebugger()) {
        extraArgs = [];
        for (const dbgExt of ['ms-vscode.cpptools', 'vadimcn.vscode-lldb']) {
            cp.spawnSync(cliPath, [...args, '--install-extension', dbgExt],
                         { encoding: 'utf-8', stdio: 'inherit'});   
            /* Disable warnings if any */
            extraArgs.push('--enable-proposed-api', dbgExt);
        }
    }

    /*
     * Do not use TestEnv.getExtensionPath, because 'vscode' module is not
     * available yet.
     */
    const workspacePath = path.join(process.cwd(), 'pgsrc', testEnv.pgVersion);
    await runTests({ 
        extensionDevelopmentPath,
        extensionTestsPath,
        vscodeExecutablePath,
        launchArgs: [
            workspacePath,
            ...extraArgs,
        ],
    });
}

try {
    main();
} catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
}