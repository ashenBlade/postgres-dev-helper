import * as vscode from 'vscode';
import * as path from 'path';

export function joinPath(base: vscode.Uri, ...paths: string[]) {
    return vscode.Uri.joinPath(base, ...paths);
}

/**
 * Check that file exists on given fs path
 * 
 * @param path Path to test for file
 * @returns true if file exists, false if does not exist or it's not a file
 */
export async function fileExists(path: vscode.Uri): Promise<boolean> {
    try {
        const result = await vscode.workspace.fs.stat(path);
        return !!(result.type & vscode.FileType.File);
    } catch {
        return false;
    }
}

/**
 * Check that directory exists on given fs path
 *
 * @returns true if directory exists, false if does not exist or it's not a directory
 */
export async function directoryExists(path: vscode.Uri) {
    try {
        const result = await vscode.workspace.fs.stat(path);
        return !!(result.type & vscode.FileType.Directory);
    } catch {
        return false;
    }
}

export function createDirectory(path: vscode.Uri) {
    return vscode.workspace.fs.createDirectory(path);
}

export async function directoryEmpty(path: vscode.Uri) {
    const files = await vscode.workspace.fs.readDirectory(path);
    return files.length === 0;
}

export function deleteFile(file: vscode.Uri) {
    return vscode.workspace.fs.delete(file, { useTrash: false, recursive: false });
}

export async function readFile(path: vscode.Uri) {
    const value = await vscode.workspace.fs.readFile(path);
    return new TextDecoder().decode(value);
}

export function writeFile(path: vscode.Uri, data: string): Thenable<void> {
    return vscode.workspace.fs.writeFile(path, new TextEncoder().encode(data));
}

export function getFileName(file: vscode.Uri) {
    return path.basename(file.fsPath);
}
