import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as https from 'https';
import * as os from 'os';
import { PghhError } from './error';
import * as crypto from 'crypto';
import { VsCodeSettings } from './configuration';

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

/* Get start-end indexes range for given type */
function getStructNameRange(type: string) {
    /* Start locating from end, because we can use '*' as TODO */
    /* XXX: может ли здесь оказаться FLA? */
    const lastPtrIndex = type.indexOf('*');
    let endOfIdentifier;
    if (lastPtrIndex === -1) {
        endOfIdentifier = type.length;
    } else {
        
        endOfIdentifier = lastPtrIndex - 1;
        while (endOfIdentifier >= 0 && type.charAt(endOfIdentifier) === ' ') {
            endOfIdentifier--;
            continue;
        }

        /* TODO: тут может ситуация быть с пользовательскими typedef'ами - в комменте описать, что проверка нужна */
        if (endOfIdentifier < 0) {
            endOfIdentifier = lastPtrIndex;
        }
    }
    
    let startOfIndentifier = type.lastIndexOf(' ', endOfIdentifier);
    if (startOfIndentifier === -1) {
        /* Type without any qualifiers */
        startOfIndentifier = 0;
    } else {
        startOfIndentifier++;
    }

    return [startOfIndentifier, endOfIdentifier + 1] as const;
}

export function getStructNameFromType(type: string) {
    /* [const] [struct] NAME [*]+ */
    const [start, end] = getStructNameRange(type);
    return type.substring(start, end);
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
    const [start, end] = getStructNameRange(type);
    
    /* Add some optimized paths to reduce number of allocations */
    if (start === 0) {
        return `${target}${type.substring(end)}`;
    }
    
    if (end === type.length) {
        return `${type.substring(0, start)}${target}`;
    }
    
    return `${type.substring(0, start)}${target}${type.substring(end)}`;
}

/*
 * Check that 'type' contains exact count of pointers in it
 */
export function havePointersCount(type: string, count: number) {
    const firstIndex = type.indexOf('*');

    /* For now only 0 and 1 will be used, so add specialized codepath */
    if (count === 0) {
        return firstIndex === -1;
    }
    if (count === 1) {
        return firstIndex !== -1 && firstIndex === type.lastIndexOf('*');
    }

    let result = 1;
    let index = firstIndex;
    while ((index = type.indexOf('*', index + 1)) !== -1) {
        ++result;
    }

    return result === count;
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
 * Check that output from evaluation is correct enum value.
 * That is it is not error message, pointer or something else.
 * So, 'result' looks like real enum value.
 * 
 * @returns 'true' if looks like enum value, 'false' otherwise
 */
export function isEnumResult(result: string) {
    return isValidIdentifier(result);
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

interface ShellExecResult {
    code: number,
    stdout: string,
    stderr: string,
};

export async function execShell(cmd: string, args?: string[], 
                                options?: { cwd?: string, 
                                            throwOnError?: boolean,
                                            stdin?: string } ): Promise<ShellExecResult> {
    return await new Promise<ShellExecResult>((resolve, reject) => {
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
    const customDir = VsCodeSettings.getSrcPath();
    if (customDir) {
        return joinPath(workspace, customDir, ...paths);
    }

    return joinPath(workspace, ...paths);
}

export function getPgSrcFile(...paths: string[]) {
    const customDir = VsCodeSettings.getSrcPath();
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
