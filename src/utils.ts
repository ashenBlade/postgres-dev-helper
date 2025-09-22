import * as vscode from 'vscode';
import * as path from 'path';
import * as util from 'util';
import * as cp from 'child_process';
import { Configuration } from './extension';
import * as https from 'https';
import * as os from 'os';
import { PghhError } from './error';
import * as crypto from 'crypto';

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

    /* TODO: replace with specialized versions for 0 and 1 pointers (only used) */
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
 * Check that type represent either value struct or pointer type, i.e.
 * it is not array type. Roughly speaking, type contains at most 1 pointer.
 * 
 * @param type Type specifier
 * @returns Type represents plain value struct or pointer type
 */
export function isValueStructOrPointerType(type: string) {
    const firstPointerPos = type.indexOf('*');
    if (firstPointerPos === -1) {
        return true;
    }
    
    const secondPointerPos = type.indexOf('*', firstPointerPos + 1);
    if (secondPointerPos === -1) {
        return true;
    }
    
    return false;
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
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
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
    
    protected format(msg: string, args: unknown[]) {
        if (args.length && args[args.length - 1] instanceof Error) {
            const err = args[args.length - 1] as Error;
            return `${util.format(msg, ...args)}\n${err.stack}`;
        } else {
            return util.format(msg, ...args);
        }
    }
    
    focus() {
        this.channel.show(true);
    }
    
    abstract debug(message: string, ...args: unknown[]): void;
    abstract info(message: string, ...args: unknown[]): void;
    abstract warn(message: string, ...args: unknown[]): void;
    abstract error(message: string, ...args: unknown[]): void;
}

export class ObsoleteVsCodeLogger extends BaseLogger implements ILogger {
    constructor(
        channel: vscode.OutputChannel,
        public minLogLevel: LogLevel) {
        super(channel);
    }

    logGeneric(level: LogLevel, levelStr: string, message: string, args: unknown[]) {
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

    debug(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Debug, 'debug', message, args);
    }
    info(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Info, 'info', message, args);
    }
    warn(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Warn, 'warn', message, args);
    }
    error(message: string, ...args: unknown[]) {
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

    logGeneric(level: LogLevel,
               handler: (fmt: string, ...args: unknown[]) => void,
               msg: string, args: unknown[]) {
        if (this.canLog(level)) {
            handler(super.format(msg, args));
        }
    }

    debug(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Debug, this.logOutput.debug, message, args);
    }
    info(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Info, this.logOutput.info, message, args);
    }
    warn(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Warn, this.logOutput.warn, message, args);
    }
    error(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Error, this.logOutput.error, message, args);
    }
}

export function joinPath(base: vscode.Uri, ...paths: string[]) {
    return vscode.Uri.joinPath(base, ...paths);
}

function statFile(uri: vscode.Uri): Thenable<vscode.FileStat> {
    return vscode.workspace.fs.stat(uri);
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
    return vscode.workspace.fs.createDirectory(path);
}

export async function directoryEmpty(path: vscode.Uri) {
    const files = await vscode.workspace.fs.readDirectory(path);
    return files.length === 0;
}

export async function copyFile(file: vscode.Uri, targetFile: vscode.Uri) {
    await vscode.workspace.fs.copy(file, targetFile);
}

export async function createTempFile(template: string, content: string) {
    const filename = template.replace('{}', crypto.randomUUID().toString());
    const tempFile = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), filename);
    await vscode.workspace.fs.writeFile(tempFile, new TextEncoder().encode(content));
    return tempFile;
}

export class ShellExecError extends PghhError {
    constructor(public command: string, 
                public stderr: string,
                public stdout: string,
                public code: number) {
        super(`command "${command}" failed to execute: ${stderr}`);
    }
}

export async function execShell(cmd: string, args?: string[], 
                options?: { cwd?: string, 
                            throwOnError?: boolean,
                            stdin?: string } ): Promise<{code: number, stdout: string, stderr: string}> {
    return await new Promise<{code: number, stdout: string, stderr: string}>((resolve, reject) => {
        const {cwd, throwOnError, stdin} = options || {};
        const child = cp.spawn(cmd, args, {cwd, shell: true});
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
            if (code !== 0 && (throwOnError ?? true)) {
                const command = `${cmd} ${args?.join(' ')}`;
                reject(new ShellExecError(command, stderr.join(''), stdout.join(''), code ?? 1));
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
    await vscode.workspace.fs.delete(file, { useTrash: false });
}

export async function readFile(path: vscode.Uri) {
    const value = await vscode.workspace.fs.readFile(path);
    return new TextDecoder().decode(value);
}

export function writeFile(path: vscode.Uri, data: string): Thenable<void> {
    return vscode.workspace.fs.writeFile(path, new TextEncoder().encode(data));
}

export function getFileName(path: vscode.Uri) {
    const parts = path.fsPath.split('/');
    return parts[parts.length - 1];
}

/**
 * Download file and return it's content.
 * 
 * @param url Url of file to download
 * @returns Contents of file
 */
export async function downloadFile(url: string) {
    return new Promise<string>((resolve, reject) => {
        const request = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`could not download file from ${url}: ` +
                                 `unsuccessful status code ${res.statusCode}`));
                res.resume();
                return;
            }

            const chunks: string[] = [];

            /* For now expect only utf8 content */
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                resolve(chunks.join(''));
            });

            res.on('error', (err) => {
                reject(err);
            });
            
        });

        request.on('error', (err) => {
            reject(err);
        });
    });
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

    static hasLogOutputChannel() {
        if (hasLogOutputChannel === undefined) {
            hasLogOutputChannel = this.versionAtLeast('1.74.0');
        }

        return hasLogOutputChannel;
    }
}
