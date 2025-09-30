import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as https from 'https';
import * as os from 'os';
import { PghhError } from './error';
import * as crypto from 'crypto';
import { VsCodeSettings } from './configuration';

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
