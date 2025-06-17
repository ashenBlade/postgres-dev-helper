import * as path from 'path';
import * as process from 'process';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode,
         resolveCliArgsFromVSCodeExecutablePath,
         runTests } from '@vscode/test-electron';

function getDebuggerExtensionId() {
    const debuggerType = process.env.PGHH_DEBUGGER;
    if (!debuggerType || debuggerType === 'cppdbg') {
        return 'ms-vscode.cpptools';
    } else if (debuggerType == 'lldb') {
        return 'vadimcn.vscode-lldb';
    } else {
        throw new Error(`Unknown debugger type: ${debuggerType}`);
    }
}

async function main() {
    let error = false;
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
    /*
     * The path to source code of PostgreSQL we are testing now
     */
    const pgsrcDir = path.resolve(extensionDevelopmentPath, './pgsrc');

    try {
        const vscodeVersion = process.env.PGHH_VSCODE_VERSION ?? 'stable';
        const vscodeExecutablePath = await downloadAndUnzipVSCode(vscodeVersion);
        const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

        /* Install required debugger extension */
        const dbgExtId = getDebuggerExtensionId();
        cp.spawnSync(cliPath, [...args, '--install-extension', dbgExtId],
                     { encoding: 'utf-8', stdio: 'inherit'});

        /* Run PostgreSQL */
        cp.spawnSync('/bin/bash', ['./run.sh', '--run'], {
            cwd: pgsrcDir,
            stdio: 'inherit',
            encoding: 'utf-8',
        });

        /* Start tests */
        await runTests({ 
            extensionDevelopmentPath,
            extensionTestsPath,
            vscodeExecutablePath,
            launchArgs: [ 
               /* Launch at PostgreSQL src dir */
               pgsrcDir,
               /* Disable warnings if any */
               '--enable-proposed-api', dbgExtId,
            ],
        });
    } catch (err) {
        console.error(err);
        console.error('Failed to run tests');
        error = true;
    }
    
    cp.spawnSync('/bin/bash', ['./run.sh', '--stop'], {
        cwd: pgsrcDir,
        stdio: 'inherit',
        encoding: 'utf-8',
    });

    if (error) {
        process.exit(1);
    }
}

main();