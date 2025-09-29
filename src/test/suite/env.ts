import * as path from 'path';

export enum DebuggerType {
    CppDbg = 'cppdbg',
    CodeLLDB = 'lldb',  
};

enum TestMode {
    None        = 0,
    Debug       = 1 << 0,
    Formatter   = 1 << 1,
    Unit        = 1 << 2,
};

/* if none specified - target on latest versions */
const defaultPostgresVersion = '18';
const defaultVsCodeVersion = 'stable';
/* variables related part is tested more often, so use by default */
const defaultTestMode = 'vars';

export class TestEnv {
    /* Version of Postgresql being tested */
    pgVersion: string;
    /* Version of VS Code we are running on */
    vscodeVersion: string;
    /* Which tests are enabled */
    testMode: TestMode;

    constructor(pgVersion: string,
                vscodeVersion: string,
                testMode: string) {
        if (Number.isNaN(Number(pgVersion))) {
            throw new Error(`Invalid PostgreSQL version "${pgVersion}".` +
                            'Version must be in "major.minor" form.');
        }

        let mode: TestMode = TestMode.None;
        if (testMode.indexOf('vars') !== -1) {
            mode |= TestMode.Debug;
        }
        if (testMode.indexOf('format') !== -1) {
            mode |= TestMode.Formatter;
        }
        if (testMode.indexOf('unit') !== -1) {
            mode |= TestMode.Unit;
        }
        
        if (mode === TestMode.None) {
            throw new Error(`No test modes specified: accept between "vars" and "format"`);
        }

        this.pgVersion = pgVersion;
        this.vscodeVersion = vscodeVersion;
        this.testMode = mode;
    }

    /* Determine which tests to run */
    testDebugger() {
        return this.testMode & TestMode.Debug;
    }
    
    testFormatter() {
        return this.testMode & TestMode.Formatter;
    }
    
    testUnit() {
        return this.testMode & TestMode.Unit;
    }

    /* Generic utilities */
    pgVersionSatisfies(required: string) {
        const requiredVersion = Number(required);
        console.assert(!Number.isNaN(requiredVersion));
        return Number(this.pgVersion) >= requiredVersion;
    }

    getWorkspaceFile(...parts: string[]) {
        return this.getExtensionPath('pgsrc', this.pgVersion, ...parts);
    }

    getExtensionPath(...parts: string[]) {
        /* cwd is extension root */
        /* do not use vscode.Uri, because it's not yet available in runTests.ts */
        return path.join(process.cwd(), ...parts);
    }   
}

export function getPgVersion() {
    return process.env.PGHH_PG_VERSION ?? defaultPostgresVersion;
}

/* Entry point for getting configuration for test running */
export function getTestEnv(): TestEnv {
    const pgVersion = process.env.PGHH_PG_VERSION ?? defaultPostgresVersion;
    const vscodeVersion = process.env.PGHH_VSCODE_VERSION ?? defaultVsCodeVersion;
    const testMode = process.env.PGHH_TEST_MODE ?? defaultTestMode;
    return new TestEnv(pgVersion, vscodeVersion, testMode);
}
