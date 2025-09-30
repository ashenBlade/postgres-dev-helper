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

export function getStructNameFromType(type: string) {
    /* [const] [struct] NAME [*]+ */
    /*
     * Start locating from end, because we can use '*' as the boundary of
     * typename end.
     *
     * During some manual testing observed common behavior of debuggers:
     * after type name can be only pointer - that is no qualifiers will follow.
     * 
     * i.e. declared in src -> DAP 'type':
     * 
     *  PlannerInfo const *   -> const PlannerInfo *
     *  int volatile * const  -> volatile int * const
     *  int const * const     -> const int * const;
     *  const Relids          -> const Relids
     * 
     * XXX: this is broken for FLA (they have [] at the end), but they
     *      don't get here yet, so don't worry.
     */
    const lastPtrIndex = type.indexOf('*');
    let endOfIdentifier;
    if (lastPtrIndex === -1) {
        /* Type without any pointer */
        endOfIdentifier = type.length;
    } else {
        endOfIdentifier = lastPtrIndex - 1;
        while (endOfIdentifier >= 0 && type.charAt(endOfIdentifier) === ' ') {
            endOfIdentifier--;
            continue;
        }

        /* 
         * Another observation is that all debuggers add spaces around pointers,
         * so one might think we can omit such check. But do not forget that
         * we are working with *effective* types - after we have substituted
         * aliased typename and user can omit spaces in between.
         */
        if (endOfIdentifier < 0) {
            endOfIdentifier = lastPtrIndex;
        }
    }
    
    /* Search for start of typename - it must be first space before typename */
    let startOfIndentifier = type.lastIndexOf(' ', endOfIdentifier);
    if (startOfIndentifier === -1) {
        /* Type without any qualifiers */
        startOfIndentifier = 0;
    } else {
        startOfIndentifier++;
    }

    return type.substring(startOfIndentifier, endOfIdentifier + 1);
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
    const typename = getStructNameFromType(type);
    return type.replace(typename, target);}

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
        /* Value struct */
        return true;
    }
    
    const secondPointerPos = type.indexOf('*', firstPointerPos + 1);
    if (secondPointerPos === -1) {
        /* Pointer type, not array */
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

export function isFlexibleArrayMember(type: string) {
    return type.endsWith('[]');
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
