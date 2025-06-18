import * as path from 'path';
import * as process from 'process';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode,
         resolveCliArgsFromVSCodeExecutablePath,
         runTests } from '@vscode/test-electron';

function getDebuggerExtensionId(debuggerType: string) {
    if (debuggerType === 'cppdbg') {
        return 'ms-vscode.cpptools';
    } else {
        return 'vadimcn.vscode-lldb';
    }
}

function getPgsrcDir(extPath: string, version: string) {
    return path.join(extPath, 'pgsrc', version);
}

function getTestEnv() {
    const pgVersion = process.env.PGHH_PG_VERSION;
    const debuggerType = process.env.PGHH_DEBUGGER ?? 'cppdbg';
    const vscodeVersion = process.env.PGHH_VSCODE_VERSION ?? 'stable';

    if (!pgVersion) {
        throw new Error('PGHH_PG_VERSION env variable is not set');
    }
    
    if (!debuggerType) {
        throw new Error('PGHH_DEBUGGER env variable is not set');
    }

    if (!['cppdbg', 'lldb'].includes(debuggerType)) {
        throw new Error(`Debugger ${debuggerType} is not supported`);
    }

    return {pgVersion, debuggerType, vscodeVersion};
}

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
    const pgsrcDir = getPgsrcDir(extensionDevelopmentPath, testEnv.pgVersion);
    const vscodeExecutablePath = await downloadAndUnzipVSCode(testEnv.vscodeVersion);
    const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    /* Install required debugger extension */
    const dbgExtId = getDebuggerExtensionId(testEnv.debuggerType);
    cp.spawnSync(cliPath, [...args, '--install-extension', dbgExtId],
        { encoding: 'utf-8', stdio: 'inherit'});
    
    /* Run PostgreSQL */
    cp.spawnSync('/bin/bash', ['./run.sh', '--run'], {
        cwd: pgsrcDir,
        stdio: 'inherit',
        encoding: 'utf-8',
    });
    
    try {
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
    } finally {
        cp.spawnSync('/bin/bash', ['./run.sh', '--stop'], {
            cwd: pgsrcDir,
            stdio: 'inherit',
            encoding: 'utf-8',
        });
    }
}

try {
    main();
} catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
}