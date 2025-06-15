import * as path from 'path';
import * as process from 'process';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode,
         resolveCliArgsFromVSCodeExecutablePath,
         runTests } from '@vscode/test-electron';

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
        const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
        const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

        /* Install required debugger extensions */
        for (const ext of ['vadimch.vscode-lldb', 'ms-vscode.cpptools']) {
            cp.spawnSync(cliPath,
                [...args, '--install-extension', ext],
                {
                    encoding: 'utf-8',
                    stdio: 'inherit'
                }
            );
        }

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