import * as vscode from 'vscode';
import path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { Configuration } from './extension';

const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Check that given string represents valid C identifier.
 * Identifier can represent struct fields, type names, variable names etc...
 * 
 * @param value String to test
 * @returns true if string represents valid C identifier
 */
export function isValidIdentifier(value: string) {
    return identifierRegex.test(value);
}

export function getStructNameFromType(type: string) {
    /* [const] [struct] NAME [*]+ */
    let index = 0;
    const typeParts = type.split(' ');
    if (typeParts[0] === 'const') {
        if (typeParts[1] === 'struct') {
            index = 2;
        }
        index = 1;
    } else if (typeParts[0] === 'struct') {
        index = 1;
    }
    return typeParts[index];
}

/**
 * Count number '*' in type string
 * 
 * @param type Type string to test
 * @returns Number of '*' in type
 */
export function getPointersCount(type: string) {
    /* All pointers go sequentially from end without spaces */
    let count = 0;
    for (let index = type.length - 1; index > -1; --index) {
        if (type[index] === '*') {
            count++;
        } else {
            break;
        }
    }
    return count;
}

/**
 * Substitute struct name from type to provided struct name.
 * This takes qualifiers into account (const, volatile, *, etc...)
 * 
 * @param type Whole type name of original variable (including qualifiers)
 * @param target The name of the type (or base type) to be substituted
 * @returns Result type name
 */
export function substituteStructName(type: string, target: string) {
    /* [const] [struct] NAME [*]+ */
    let index = 0;
    const typeParts = type.split(' ');
    if (typeParts[0] === 'const') {
        if (typeParts[1] === 'struct') {
            index = 2;
        }
        index = 1;
    } else if (typeParts[0] === 'struct') {
        index = 1;
    }
    typeParts[index] = target;
    return typeParts.join(' ');
}

/**
 * Check that output from evaluation is correct enum value.
 * That is it is not error message, pointer or something else.
 * So, 'result' looks like real enum value.
 * 
 * @returns 'true' if looks like enum value, 'false' otherwise
 */
export function isEnumResult(result: string) {
    return isValidIdentifier(result);
}

export interface ILogger {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
    focus: () => void;
}

/* Start with 2 as in vscode.LogLevel */
export enum LogLevel {
    Debug = 2,
    Info = 3,
    Warn = 4,
    Error = 5,
    Disable = 6,
}

abstract class BaseLogger implements ILogger {
    constructor(protected channel: vscode.OutputChannel) { }
    
    protected format(msg: string, args: any[]) {
        if (args.length && args[args.length - 1] instanceof Error) {
            const err: Error = args.pop();
            return `${util.format(msg, ...args)}\n${err.stack}`;
        } else {
            return util.format(msg, ...args);
        }
    }
    
    focus() {
        this.channel.show(true);
    }
    
    abstract debug(message: string, ...args: any[]): void;
    abstract info(message: string, ...args: any[]): void;
    abstract warn(message: string, ...args: any[]): void;
    abstract error(message: string, ...args: any[]): void;
}

export class ObsoleteVsCodeLogger extends BaseLogger implements ILogger {
    constructor(
        channel: vscode.OutputChannel,
        public minLogLevel: LogLevel) {
        super(channel);
    }

    logGeneric(level: LogLevel, levelStr: string, message: string, args: any[]) {
        if (level < this.minLogLevel) {
            return;
        }
        /* 
         * VS Code prior to 1.74.0 does not have LogOutputChannel
         * with builtin level/timing features
         */

        /* YYYY-mm-ddTHH:MM:SS.ffffZ -> YYYY-mm-dd HH:MM:SS.ffff */
        const timestamp = new Date().toISOString()
                                    .replace('T', ' ')
                                    .replace('Z', '');
        /* TIMESTAMP [LEVEL]: MESSAGE \n EXCEPTION */
        this.channel.append(timestamp);
        this.channel.append(' [');
        this.channel.append(levelStr);
        this.channel.append(']: ');
        this.channel.appendLine(super.format(message, args));
    }

    debug(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Debug, 'debug', message, args);
    }
    info(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Info, 'info', message, args);
    }
    warn(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Warn, 'warn', message, args);
    }
    error(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Error, 'error', message, args);
    }
}

export class VsCodeLogger extends BaseLogger implements ILogger {
    constructor(private logOutput: vscode.LogOutputChannel) {
        super(logOutput);
    }

    protected canLog(level: LogLevel): boolean {
        return this.logOutput.logLevel != vscode.LogLevel.Off && 
               this.logOutput.logLevel <= level;
    }

    logGeneric(level: LogLevel, handler: any, msg: string, args: any[]) {
        if (this.canLog(level)) {
            handler(super.format(msg, args));
        }
    }

    debug(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Debug, this.logOutput.debug, message, args);
    }
    info(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Info, this.logOutput.info, message, args);
    }
    warn(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Warn, this.logOutput.warn, message, args);
    }
    error(message: string, ...args: any[]) {
        this.logGeneric(LogLevel.Error, this.logOutput.error, message, args);
    }
}

function getFileType(stats: fs.Stats) {
    if (stats.isFile()) {
        return vscode.FileType.File;
    }
    if (stats.isDirectory()) {
        return vscode.FileType.Directory;
    }
    if (stats.isSymbolicLink()) {
        return vscode.FileType.SymbolicLink;
    }

    return vscode.FileType.Unknown;
}

function statFile(uri: vscode.Uri): Thenable<vscode.FileStat> {
    if (Features.hasWorkspaceFs()) {
        return vscode.workspace.fs.stat(uri);
    } else {
        return new Promise((resolve, reject) => {
            fs.stat(uri.fsPath, (err, stats) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        ctime: stats.ctime.valueOf(),
                        mtime: stats.mtime.valueOf(),
                        size: stats.size,
                        type: getFileType(stats),
                    } as vscode.FileStat);
                }
            });
        })
    }
}

/**
 * Check that file exists on given fs path
 * 
 * @param path Path to test for file
 * @returns true if file exists, false if not
 * @throws Error if {@link path} points to existing fs entry, but not file
 * i.e. directory
 */
export async function fileExists(path: vscode.Uri): Promise<boolean> {
    try {
        const result = await statFile(path);
        return !!(result.type & vscode.FileType.File);
    } catch {
        return false;
    }
}

/**
 * Check that at specified path exists some entry.
 * No matter what - file or directory. Just something
 */
export async function fsEntryExists(path: vscode.Uri): Promise<boolean> {
    try {
        await statFile(path);
        return true;
    } catch {
        return false;
    }
}

export async function directoryExists(path: vscode.Uri) {
    try {
        const result = await statFile(path);
        return !!(result.type & vscode.FileType.Directory);
    } catch {
        return false;
    }
}

export async function createDirectory(path: vscode.Uri): Promise<void> {
    if (Features.hasWorkspaceFs()) {
        return vscode.workspace.fs.createDirectory(path);
    } else {
        return new Promise((resolve, reject) => {
            fs.mkdir(path.fsPath, null, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        })
    }
}

export async function directoryEmpty(path: vscode.Uri) {
    if (Features.hasWorkspaceFs()) {
        const files = await vscode.workspace.fs.readDirectory(path);
        return files.length === 0;
    } else {
        return await new Promise((resolve, reject) => {
            fs.readdir(path.fsPath, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(files.length === 0);
                }
            });
        });
    }
}

export async function copyFile(file: vscode.Uri, targetFile: vscode.Uri) {
    if (Features.hasWorkspaceFs()) {
        await vscode.workspace.fs.copy(file, targetFile);
    } else {
        return await new Promise<void>((resolve, reject) => {
            fs.copyFile(file.fsPath, targetFile.fsPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        })
    }
}

export function createTempFileName(template: string) {
    return template.replace('{}', crypto.randomUUID().toString());
}

export async function execShell(cmd: string, args?: string[], 
                options?: { cwd?: string, 
                            env?: any, 
                            throwOnError?: boolean,
                            stdin?: string } ): Promise<{code: number, stdout: string, stderr: string}> {
    return await new Promise<{code: number, stdout: string, stderr: string}>((resolve, reject) => {
        const {cwd, env, throwOnError, stdin} = options || {};
        const child = child_process.spawn(cmd, args, {cwd, env, shell: true, });
        const stderr: string[] = [];
        const stdout: string[] = [];

        child.on('error', (err) => {
            reject(err);
        });

        child.stderr?.on('data', (chunk) => {
            stderr.push(chunk);
        });
        child.stdout?.on('data', (chunk) => {
            stdout.push(chunk);
        });

        child.on('close', (code) => {
            if (code !== 0 && (throwOnError === undefined || throwOnError)) {
                reject(new Error(`command failed to execute. error stack: ${stdout.join('')}`));
            } else {
                resolve({
                    code: code ?? 0,
                    stdout: stdout.join(''),
                    stderr: stderr.join(''),
                });
            }
        });
        child.on('error', (err) => {
            reject(err);
        });

        if (stdin) {
            child.stdin.write(stdin, (err) => {
                if (err) {
                    reject(err);
                }
            });
            child.stdin.on('error', (err) => {
                if (err) {
                    reject(err);
                }
            });
        }
        child.stdin.end();

        setTimeout(() => {
            if (child.exitCode !== null) {
                child.kill('SIGKILL');
            }
        }, 60 * 1000);
    });
}

export async function deleteFile(file: vscode.Uri) {
    if (Features.hasWorkspaceFs()) {
        await vscode.workspace.fs.delete(file, { useTrash: false });
    } else {
        return new Promise<void>((resolve, reject) => {
            fs.unlink(file.fsPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        });
    }
}

export function readFile(path: vscode.Uri) {
    if (Features.hasWorkspaceFs()) {
        return vscode.workspace.fs.readFile(path)
                .then(value => new TextDecoder().decode(value));
    } else {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(path.fsPath, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    resolve(new TextDecoder().decode(value));
                } catch (err: any) {
                    reject(err);
                }
            })
        })
    }
}

export function writeFile(path: vscode.Uri, data: string): Thenable<void> {
    if (Features.hasWorkspaceFs()) {
        return vscode.workspace.fs.writeFile(path, new TextEncoder().encode(data));
    } else {
        return new Promise((resolve, reject) => {
            fs.writeFile(path.fsPath, data, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        })
    }
}

export function getWorkspacePgSrcFile(workspace: vscode.Uri, ...paths: string[]) {
    const customDir = Configuration.getSrcPath();
    if (customDir) {
        return joinPath(workspace, customDir, ...paths);
    }

    return joinPath(workspace, ...paths);
}

export function getPgSrcFile(...paths: string[]) {
    const customDir = Configuration.getSrcPath();
    if (customDir) {
        return path.join(customDir, ...paths);
    }

    return path.join(...paths);
}

/**
 * Return integer representation of SemVer version string
 * 
 * @param ver Version string
 */
export function version(ver: string): number {
    /* 
     * Search SemVer string in form
     *
     *      MAJOR.MINOR.PATCH
     * 
     * where PATCH may be missing.
     * 
     * We use regex because of suffixes that can be inside version string.
     * Like: '1.90.0-insiders' or '1.89.2-prerelease'.
     * So just split by '.' is not enough.
     */
    const parse = /(\d+)\.(\d+)(\.(\d+))?/.exec(ver);

    if (!parse?.length) {
        throw new Error(`Invalid SemVer string: ${ver}`);
    }

    let result = 0;

    /* X.Y.Z - 1, 2, 4 indexes in regex */
    result += parseInt(parse[1]) * 1000000;
    result += parseInt(parse[2]) * 1000;

    if (parse[4]) {
        result += parseInt(parse[4]);
    }

    if (Number.isNaN(result)) {
        throw new Error(`Invalid SemVer string: ${ver}. Result version number is NaN`);
    }

    return result;
}

/* 
 * Various feature flags related to VS Code 
 * functionality, that depends on API
 */
let debugFocusEnabled: boolean | undefined = undefined;
let hasArrayLengthFeature: boolean | undefined = undefined;
let logOutputLanguageEnabled: boolean | undefined = undefined;
let hasWorkspaceFs: boolean | undefined = undefined;
let hasUriJoinPath: boolean | undefined = undefined;
let hasLogOutputChannel: boolean | undefined = undefined;

export class Features {
    static versionAtLeast(ver: string) {
        return version(ver) <= version(vscode.version);
    }

    static debugFocusEnabled() {
        /* 
         * Easily track debugger actions (breakpoints etc) and 
         * selected call stack changes 
         */
        if (debugFocusEnabled === undefined) {
            debugFocusEnabled = this.versionAtLeast('1.90.0');
        }
        return debugFocusEnabled;
    }

    static hasEvaluateArrayLength() {
        /* Evaluate array length in debugger like `arrayPtr, length' */
        if (hasArrayLengthFeature === undefined) {
            const cppDbgExtension = vscode.extensions.getExtension('ms-vscode.cpptools');
            if (cppDbgExtension?.packageJSON.version) {
                const cppDbgVersion = version(cppDbgExtension.packageJSON.version);
                hasArrayLengthFeature = version('1.13.0') <= cppDbgVersion;
            } else {
                /* Safe default */
                hasArrayLengthFeature = false;
            }
        }
        return hasArrayLengthFeature;
    }

    static logOutputLanguageEnabled() {
        /* Set 'log' to languageId in Output Channel */
        if (logOutputLanguageEnabled === undefined) {
            logOutputLanguageEnabled = this.versionAtLeast('1.67.0');
        }
        return logOutputLanguageEnabled;
    }

    static hasWorkspaceFs() {
        /* Has 'vscode.workspace.fs' */
        if (hasWorkspaceFs === undefined) {
            hasWorkspaceFs = this.versionAtLeast('1.37.0');
        }
        return hasWorkspaceFs;
    }

    static hasUriJoinPath() {
        if (hasUriJoinPath === undefined) {
            hasUriJoinPath = this.versionAtLeast('1.45.0');
        }
        return hasUriJoinPath;
    }

    static hasLogOutputChannel() {
        if (hasLogOutputChannel === undefined) {
            hasLogOutputChannel = this.versionAtLeast('1.74.0');
        }

        return hasLogOutputChannel;
    }
}

export function joinPath(base: vscode.Uri, ...paths: string[]) {
    if (Features.hasUriJoinPath()) {
        return vscode.Uri.joinPath(base, ...paths);
    }

    return vscode.Uri.file(path.join(base.fsPath, ...paths));
}