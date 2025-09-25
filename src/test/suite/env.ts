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

export class TestEnv {
    /* Version of Postgresql being tested */
    pgVersion: string;
    /* Version of VS Code we are running on */
    vscodeVersion: string;
    /* Debugger extension is used */
    debugger: DebuggerType | undefined;
    testMode: TestMode;

    constructor(pgVersion: string,
                vscodeVersion: string,
                debuggerType: string | undefined,
                testMode: string) {
        if (Number.isNaN(Number(pgVersion))) {
            throw new Error(`Invalid PostgreSQL version "${pgVersion}".` +
                            'Version must be in "major.minor" form.');
        }

        if (   debuggerType !== undefined
            && !(debuggerType === DebuggerType.CppDbg || debuggerType === DebuggerType.CodeLLDB)) {
            throw new Error(`Debugger ${debuggerType} is not supported`);
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
        
        if (mode === 0) {
            throw new Error(`No test modes specified: accept between "vars" and "format"`);
        }
        
        if (mode & TestMode.Debug && !debuggerType) {
            throw new Error('Test mode is "vars", but debugger is not specified');
        }

        this.pgVersion = pgVersion;
        this.vscodeVersion = vscodeVersion;
        this.debugger = debuggerType;
        this.testMode = mode;
    }

    /* Which debugger is used to test variables */
    debuggerIsCodeLLDB() {
        return this.debugger === 'lldb';
    }

    debuggerIsCppDbg() {
        return this.debugger === 'cppdbg';
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
    return process.env.PGHH_PG_VERSION ?? '17';
}

export function getTestMode() {
    const testMode = process.env.PGHH_TEST_MODE;
    if (!testMode) {
        return TestMode.Debug;
    }
    
    let mode: TestMode = 0;
    if (testMode.indexOf('vars') !== -1) {
        mode |= TestMode.Debug;
    }
    if (testMode.indexOf('format') !== -1) {
        mode |= TestMode.Formatter;
    }
    
    if (mode === 0) {
        throw new Error(`No test modes specified: "vars" and/or "format" are accepted`);
    }
    return mode;
}

/* Entry point for getting configuration for test running */
export function getTestEnv(): TestEnv {
    /* if none specified - target on latest versions */
    const pgVersion = process.env.PGHH_PG_VERSION ?? '17';
    const vscodeVersion = process.env.PGHH_VSCODE_VERSION ?? 'stable';
    /* variables related part is tested more often, so use by default */
    const testMode = process.env.PGHH_TEST_MODE ?? 'vars';

    /* Flag for variables tests */
    const dbg = process.env.PGHH_DEBUGGER;
    return new TestEnv(pgVersion, vscodeVersion, dbg, testMode);
}
