// .vscode-test.js
import { defineConfig } from '@vscode/test-cli';

// npx vscode-test --config .vscode-test.mjs
export default defineConfig([
    {
        label: 'Tests',
        files: 'out/test/**/*.test.js',
        mocha: {
            ui: 'tdd',
            timeout: 20000,
            parallel: false,
        },
        version: 'stable',
        workspaceFolder: './pgsrc/18',
        env: {
            PGHH_PG_VERSION: '18',
            PGHH_VSCODE_VERSION: 'stable',
            PGHH_TEST_MODE: 'vars,format,unit',
        },
    },
]);