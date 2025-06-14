import * as path from 'path';
import * as process from 'process';

import { runTests } from '@vscode/test-electron';

function getWorkspaceDir() {
    const srcDir = process.env.PGHH_SRC_DIR;
    if (srcDir) {
        return srcDir;
    }

    /* Default value */
    return '/tmp/pgsrc';
}

async function main() {
  try {
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

    /* Download VS Code, unzip it and run the integration test */
    await runTests({ extensionDevelopmentPath, extensionTestsPath,
                     launchArgs: [ 
                        /* Launch at PostgreSQL source code dir */
                        getWorkspaceDir(),
                    ]});
  } catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();