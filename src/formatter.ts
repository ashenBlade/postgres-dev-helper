import * as vscode from 'vscode';
import {languages} from 'vscode';
import * as utils from './utils';
import { Configuration } from './extension';
import { PghhError } from './error';
import * as path from 'path';
import * as os from 'os';

class FormattingError extends PghhError {}

function findSuitableWorkspace(document: vscode.TextDocument) {
    if (!vscode.workspace.workspaceFolders?.length) {
        throw new Error('Not workspaces opened');
    }

    for (const workspace of vscode.workspace.workspaceFolders) {
        if (document.uri.path.startsWith(workspace.uri.path)) {
            return workspace;
        }
    }

    /* Fallback with first workspace */
    return vscode.workspace.workspaceFolders[0];
}

class PgindentDocumentFormatterProvider implements vscode.DocumentFormattingEditProvider {
    /* Flags found in pgindent */
    static pg_bsd_indentDefaultFlags = [
        '-bad', '-bap', '-bbb', '-bc', '-bl', '-cli1', '-cp33', '-cdb', 
        '-nce', '-d0', '-di12', '-nfc1', '-i4', '-l79', '-lp', '-lpl', 
        '-nip', '-npro', '-sac', '-tpg', '-ts4'
    ];

    private savedPgindentPath?: vscode.Uri;
    private savedPgbsdPath?: vscode.Uri;
    private savedProcessedTypedef?: vscode.Uri;
    constructor(private logger: utils.ILogger) {}

    private async getPgConfigPath(workspace: vscode.WorkspaceFolder) {
        const possiblePgConfigPath = utils.getWorkspacePgSrcFile(
                        workspace.uri, 'src', 'bin', 'pg_config', 'pg_config');
        if (await utils.fileExists(possiblePgConfigPath)) {
            return possiblePgConfigPath;
        }

        const userInput = await vscode.window.showInputBox({
            prompt: 'Enter pg_config path',
            password: false,
            title: 'pg_config is required to build pg_bsd_indent',
            validateInput: async (value: string) => {
                const filePath = path.isAbsolute(value) 
                                        ? vscode.Uri.file(value)
                                        : utils.joinPath(workspace.uri, value);
                if (!await utils.fileExists(filePath)) {
                    return 'File not found';
                }
            }
        });
        if (!userInput) {
            throw new Error('pg_bsd_indent is not installed and user did not provide pg_config path');
        }

        const pg_configPath = path.isAbsolute(userInput) 
                                    ? vscode.Uri.file(userInput) 
                                    : utils.joinPath(workspace.uri, userInput);
        return pg_configPath;
    }
    
    private async tryFindRequiredPgBsdIndentVersion(pgindent: vscode.Uri) {
        const file = await utils.readFile(pgindent);
        const lines = file.split('\n');
        const versionRegexp = /=\s+"(\d(\.\d)*)"/;

        const tryGetVersion = (line: string) => {
            if (line.indexOf('INDENT_VERSION') === -1) {
                return;
            }
            
            const result = versionRegexp.exec(line);
            if (!result) {
                /*
                 * version line must be first - there no point in looking
                 * any further
                 */
                return;
            }
            
            return result[1];
        }
        
        /* 
        * most likely, pgindent's code have not
        * changed variable declared on these lines
        */
        let version;
        if (   (version = tryGetVersion(lines[14]))
            || (version = tryGetVersion(lines[15]))
            || (version = tryGetVersion(lines[16]))) {
            return version;
        }

        /* fallback scanning whole file */
        for (const line of lines) {
            version = tryGetVersion(line);
            if (version) {
                return version;
            }
        }
    }
    
    private async clonePgBsdIndent(workspace: vscode.WorkspaceFolder,
                                   pgindent: vscode.Uri,
                                   pgBsdIndentDir: vscode.Uri) {
        /*
         * Actually clone sources. Note that here we are only if we are running
         * in pg version 16< where pg_bsd_indent
         */
        const pgindentDir = utils.getWorkspacePgSrcFile(
                                    workspace.uri, 'src', 'tools', 'pgindent');
        this.logger.info('cloning pg_bsd_indent repository');
        /* XXX: maybe better to download archive, not full history? */
        await utils.execShell(
            'git', ['clone', 'https://git.postgresql.org/git/pg_bsd_indent.git'],
            {cwd: pgindentDir.fsPath});

        /* 
         * Each pgindent requires specific version of pg_bsd_indent and
         * original repo contains tag only for 2.1.1 and the only thing we
         * could do - checkout to specific commit.
         * But the problem is that not-master branch fails to build whichever
         * commit i used, so instead we will mock pg_bsd_indent, so it
         * behaves like expected version.
         */
        const version = await this.tryFindRequiredPgBsdIndentVersion(pgindent);
        if (!version) {
            this.logger.warn('could not detect required pg_bsd_indent version - using latest');
            return;
        }

        /* 
         * After repo freeze this is latest version which pgindent expects,
         * so no need to patch and we are here only if pg<16 and there
         * are no versions greater than that.
         */
        if (version === '2.1.1') {
            return;    
        }

        this.logger.info('patching pg_bsd_indent/args.c to be like %s', version);
        const argsFile = utils.joinPath(pgBsdIndentDir, 'args.c');
        const contents = await utils.readFile(argsFile);
        const lines = contents.split('\n');
        
        /* 
         * We should patch 2 parts in '--version': 
         * - set version to expected
         * - remove trailing 'based on BSD indent' (due to regex match rule)
         * 
         * Also we know that cloned pg_bsd_indent always has same source code,
         * so we know where the lines are located:
         * -  57 - INDENT_VERSION macro
         * - 309 - version format string
         */
        const patchHeuristic = (search: string, replacePattern: string | RegExp,
                                replace: string, expectedLine: number) => {
            let line = lines[expectedLine];
            if (line.indexOf(search) !== -1) {
                lines[expectedLine] = line.replace(replacePattern, replace);
            } else {
                for (let i = 0; i < lines.length; ++i) {
                    line = lines[i];
                    if (line.indexOf(search) !== -1) {
                        lines[i] = line.replace(replacePattern, replace);
                        break;
                    }
                }
            }
        }
        patchHeuristic('INDENT_VERSION', /"\d(\.\d)*"/, `"${version}"`, 57);
        patchHeuristic(' (based on FreeBSD indent)', ' (based on FreeBSD indent)', '', 309);

        this.logger.info('writing patched args.c back');
        await utils.writeFile(argsFile, lines.join('\n'));
    }

    private async findPgBsdIndentOrBuild(workspace: vscode.WorkspaceFolder,
                                          pgindent: vscode.Uri) {
        /* 
         * For pg_bsd_indent search 2 locations:
         * 
         *  - src/tools/pg_psd_indent: (PG >=16)
         *      - not exist: build
         *  - src/tools/pgindent/pg_bsd_indent (PG <16)
         *      - not exist: download + build
         */
        let pgBsdIndentDir = utils.getWorkspacePgSrcFile(
                                  workspace.uri, 'src', 'tools', 'pg_bsd_indent');

        /* src/tools/pg_bsd_indent */
        if (await utils.directoryExists(pgBsdIndentDir)) {
            let pgBsdIndent = utils.joinPath(pgBsdIndentDir, 'pg_bsd_indent');
            if (await utils.fileExists(pgBsdIndent)) {
                return pgBsdIndent;
            }

            /* Try to build it */
            this.logger.info('building pg_bsd_indent in %s', pgBsdIndentDir.fsPath);
            await utils.execShell('make', ['-C', pgBsdIndentDir.fsPath],
                                  {cwd: workspace.uri.fsPath});
            return pgBsdIndent;
        }

        /* src/tools/pgindent/pg_bsd_indent */
        pgBsdIndentDir = utils.getWorkspacePgSrcFile(
                        workspace.uri, 'src', 'tools', 'pgindent', 'pg_bsd_indent');
        const pgBsdIndent = utils.joinPath(pgBsdIndentDir, 'pg_bsd_indent');
        if (await utils.fileExists(pgBsdIndent)) {
            return pgBsdIndent;
        }

        /* Clone and build pg_bsd_indent */
        const pgConfigPath = await this.getPgConfigPath(workspace);
        const shouldClone = (!await utils.directoryExists(pgBsdIndentDir) ||
                                await utils.directoryEmpty(pgBsdIndentDir));
        if (shouldClone) {
            await this.clonePgBsdIndent(workspace, pgindent, pgBsdIndentDir);
        }

        this.logger.info('building pg_bsd_indent')
        /* Repo's version requires passing PG_CONFIG (just build, no 'install') */
        await utils.execShell(
            'make', ['all', `PG_CONFIG="${pgConfigPath.fsPath}"`],
            {cwd: pgBsdIndentDir.fsPath});
        return pgBsdIndent;
    }
    
    private getProcessedTypedefFilePath(workspace: vscode.WorkspaceFolder) {
        /* 
         * Formatter module supports custom typedef.lists which are added
         * to builtin in 'src/tools/pgindent'.  But formatter tool does not
         * allow specifying list of typedef.lists, so I have to merge all
         * files and for performance reasons this file is cached.
         * 
         * Currently, it's located in '/tmp/pg-hacker-helper.typedefs.list'.
         * 
         * XXX: when you are working with multiple pg versions you may have
         *      different set of custom typedef.lists, so this can mess
         *      everything up, so it would be more nice to store it i.e. in
         *      '.vscode' directory.
         *
         * XXX: if you change location - do not forget to update try/catch block
         *      where file is saved (catch block creates .vscode directory and
         *      perform second attempt to save file).
         */

        return utils.joinPath(
                    workspace.uri, '.vscode', 'pg-hacker-helper.typedefs.list');
    }

    private async saveCachedTypedefFile(content: string, typedefsFile: vscode.Uri,
                                        workspace: vscode.WorkspaceFolder) {
        /*
         * It's unlikely that '.vscode' directory missing, so omit checking
         * and create if necessary.
         */
        let vscodeDir;
        this.logger.info('caching result typedefs.list in %s', typedefsFile.fsPath);
        try {
            await utils.writeFile(typedefsFile, content);
            return;
        } catch (err) {
            /*
             * During testing I deleted .vscode directory, but could not
             * when writing to file - may be it's smart enough to create
             * this folder for me, but nevertheless attempt to create it.
             */
            vscodeDir = utils.joinPath(workspace.uri, '.vscode');
            if (await utils.directoryExists(vscodeDir)) {
                throw err;
            }
        }

        this.logger.info('.vscode directory missing - creating one');
        await utils.createDirectory(vscodeDir);
        this.logger.info('trying to cache typedefs.list file again: %s', typedefsFile.fsPath);
        await utils.writeFile(typedefsFile, content);
    }

    private async enrichTypedefs(typedefs: Set<string>) {
        const customTypedefFiles = Configuration.CustomTypedefsFiles;
        if (!customTypedefFiles || customTypedefFiles.length === 0) {
            return;
        }

        for (const typedef of customTypedefFiles) {
            let content;
            try {
                content = await utils.readFile(typedef);
            } catch (err) {
                this.logger.warn('failed to read custom typedefs.list file %s', typedef.fsPath);
                continue;
            }

            content.split('\n').forEach(x => typedefs.add(x.trim()));
        }
    }

    private async getProcessedTypedefs(workspace: vscode.WorkspaceFolder) {
        if (this.savedProcessedTypedef) {
            if (await utils.fileExists(this.savedProcessedTypedef)) {
                return this.savedProcessedTypedef;
            }

            this.savedProcessedTypedef = undefined;
        }

        const processedTypedef = this.getProcessedTypedefFilePath(workspace);
        if (await utils.fileExists(processedTypedef)) {
            /* 
             * This file is cache in /tmp, so may be created from another
             * workspace which can have different content - delete it
             * to prevent formatting errors.
             */
            this.logger.info('found existing typedefs.list in .vscode directory');
            this.savedProcessedTypedef = processedTypedef;
            return processedTypedef;
        }

        /* 
         * Add and remove some entries from `typedefs.list` file
         * downloaded from buildfarm.
         * 
         * This data did not change since PG 10 and i don't think
         * it will change in near future.
         */
        const rawTypedefs = await this.getDefaultTypedefs(workspace);
        const entries = new Set(rawTypedefs.split('\n'));

        [
            'ANY', 'FD_SET', 'U', 'abs', 'allocfunc', 'boolean', 'date',
            'digit', 'ilist', 'interval', 'iterator', 'other', 'pointer',
            'printfunc', 'reference', 'string', 'timestamp', 'type', 'wrap'
        ].forEach(e => entries.delete(e));
        entries.add('bool');
        entries.delete('');
        await this.enrichTypedefs(entries);

        const arr = Array.from(entries.values());
        arr.sort();

        await this.saveCachedTypedefFile(arr.join('\n'), processedTypedef, workspace);

        this.savedProcessedTypedef = processedTypedef;
        return processedTypedef;
    }

    private async getPgBsdIndent(workspace: vscode.WorkspaceFolder, pgindent: vscode.Uri) {
        if (this.savedPgbsdPath) {
            if (await utils.fileExists(this.savedPgbsdPath)) {
                return this.savedPgbsdPath;
            }

            this.savedPgbsdPath = undefined;
        }

        const userPgbsdindent = Configuration.getCustomPgbsdindentPath();
        if (userPgbsdindent) {
            return path.isAbsolute(userPgbsdindent) 
                            ? vscode.Uri.file(userPgbsdindent)
                            : utils.joinPath(workspace.uri, userPgbsdindent);
        }

        return await this.findPgBsdIndentOrBuild(workspace, pgindent);
    }
    
    private async getPgindent(workspace: vscode.WorkspaceFolder) {
        if (this.savedPgindentPath) {
            return this.savedPgindentPath;
        }
        
        const pgindentPath = utils.getWorkspacePgSrcFile(
                        workspace.uri, 'src', 'tools', 'pgindent', 'pgindent');
        if (!await utils.fileExists(pgindentPath)) {
            vscode.window.showErrorMessage(`could not find pgindent at ${pgindentPath.fsPath}`);
            throw new FormattingError('could not find pgindent');
        }
        
        this.savedPgindentPath = pgindentPath;
        return pgindentPath;
    }

    private async runPgindentInternal(document: vscode.Uri,
                                      pg_bsd_indent: vscode.Uri,
                                      pgindent: vscode.Uri,
                                      workspace: vscode.WorkspaceFolder) {
        /* 
         * We use pg_bsd_indent directly instead of pgindent because:
         *  - different pgindent versions behaves differently
         *  - direct call to pg_bsd_indent is faster
         *  - pgindent creates temp files which are not removed if error
         *    happens - we can not track these files (main reason)
         */
        const typedefs = await this.getProcessedTypedefs(workspace);
        try {
            await utils.execShell(
                pgindent.fsPath, [
                    `--indent=${pg_bsd_indent.fsPath}`,
                    `--typedefs=${typedefs.fsPath}`,
                    document.fsPath,
                ],
                {cwd: utils.getWorkspacePgSrcFile(workspace.uri).fsPath},
            );
        } catch (err) {
            if (!(err instanceof utils.ShellExecError)) {
                throw err;
            }

            const r = /version (\d(\.\d)*)/.exec(err.stderr);
            if (!r) {
                throw err;
            }

            const version = r[1];
            const help =
                    `you can remove existing pg_bsd_indent installation and run `
                  + `formatting again - extension will install it and patch`;
            vscode.window.showErrorMessage(
                `pgindent expects pg_bsd_indent version ${version} - ${help}`);
            throw err;
        }

        const formatted = await utils.readFile(document);

        /* On success cache binaries paths */
        this.savedPgbsdPath = pg_bsd_indent;
        this.savedPgindentPath = pgindent;

        return formatted;
    }
    
    private getDocumentContent(document: vscode.TextDocument) {
        const content = document.getText();
        
        /* 
         * pg_bsd_indent requires that there is always new line at the
         * end of file, otherwise it will leave an error like 'staff is missing'.
         * We add this line here so we will know that no such error can be
         * emitted.
         */
        const newLineIndex = content.lastIndexOf('\n');
        if (newLineIndex === -1 || newLineIndex === content.length - 1) {
            /* Shortcut when there is already a newline at the end */
            return content;
        }

        for (let i = newLineIndex; i < content.length; ++i) {
            /* Just check that all last line characters are spaces */
            if (/\S/.test(content[i])) {
                return content + '\n';
            }
        }

        return content;
    }
    
    private async runPgindentRebuildBsd(document: vscode.Uri,
                                        pgBsdIndent: vscode.Uri,
                                        pgindent: vscode.Uri,
                                        workspace: vscode.WorkspaceFolder) {
        try {
            return await this.runPgindentInternal(
                                    document, pgBsdIndent, pgindent, workspace);
        } catch (err) {
            if (await utils.fileExists(pgBsdIndent)) {
                throw err;
            }
        }

        this.logger.info('pg_bsd_indent seems to be not installed - trying to install');
        this.savedPgbsdPath = undefined;
        pgBsdIndent = await this.findPgBsdIndentOrBuild(workspace, pgindent);
        return await this.runPgindentInternal(
                                    document, pgBsdIndent, pgindent, workspace);
    }

    private async runPgindent(document: vscode.TextDocument, 
                              workspace: vscode.WorkspaceFolder) {
        const pgindent = await this.getPgindent(workspace);
        const pg_bsd_indent = await this.getPgBsdIndent(workspace, pgindent);
        const content = this.getDocumentContent(document);
        const tempDocument = await utils.createTempFile('pghh-{}.c', content);
        try {
            return await this.runPgindentRebuildBsd(
                                tempDocument, pg_bsd_indent, pgindent, workspace);
        } finally {
            await utils.deleteFile(tempDocument);
        }
    }

    private async getDefaultTypedefs(workspace: vscode.WorkspaceFolder) {
        /* 
         * Newer pg versions have 'src/tools/pgindent/typedefs.list' already
         * present in repository, so just read it. But older versions does not
         * have it installed, so we must download it manually.
         * 
         * NOTE: extension's supported pg versions start from 9.6 which have
         *       it installed - logic for downloading it is not tested, so I
         *       expect that it is working (tested only once, manually on my PC)
         */
        const typedefsFile = utils.getWorkspacePgSrcFile(
                    workspace.uri, 'src', 'tools', 'pgindent', 'typedefs.list');
        if (await utils.fileExists(typedefsFile)) {
            this.logger.info('found default typedefs.list in %s', typedefsFile.fsPath);
            return await utils.readFile(typedefsFile);
        }

        /* Version is not known, so just download latest */
        const url = 'https://buildfarm.postgresql.org/cgi-bin/typedefs.pl';
        this.logger.info('downloading typedefs file from %s', url);
        let content;
        try {
            content = await utils.downloadFile(url);
        } catch (err) {
            throw new Error(`failed to download typedefs: ${err}`);
        }

        this.logger.info('saving typedefs.list to file %s', typedefsFile.fsPath);
        try {
            await utils.writeFile(typedefsFile, content);
        } catch (err) {
            throw new Error(`could not save typedef file: ${err}`);
        }

        return content;
    }
    
    private getWholeDocumentRange(document: vscode.TextDocument) {
        const start = new vscode.Position(0, 0);
        const lastLine = document.lineAt(document.lineCount - 1);
        const end = lastLine.range.end;
        return new vscode.Range(start, end);
    }

    async provideDocumentFormattingEdits(document: vscode.TextDocument, 
                                         options: vscode.FormattingOptions,
                                         token: vscode.CancellationToken) {
        this.logger.debug('formatting document: %s', document.uri.fsPath);
        let indented;
        try {
            const workspace = findSuitableWorkspace(document);
            indented = await this.runPgindent(document, workspace);
        } catch (err) {
            this.logger.error('could not to run pgindent', err);
            return [];
        }

        /* 
         * vscode expects that we will provide granular changes for each line
         * and previously I did exactly that - run 'diff' on result and parse
         * hunks. But this approach is too difficult to perform, because there
         * are errors which are hard to handle.
         */
        return [
            vscode.TextEdit.replace(
                this.getWholeDocumentRange(document),
                indented
            ),
        ];
    }

    async indentFileWithTemp(document: vscode.TextDocument) {
        const workspace = findSuitableWorkspace(document);
        const indented = await this.runPgindent(document, workspace);
        const tempFile = utils.joinPath(
                vscode.Uri.file(os.tmpdir()), path.basename(document.uri.fsPath));
        await utils.writeFile(tempFile, indented);
        return tempFile;
    }
}

function registerDiffCommand(logger: utils.ILogger, 
                             formatter: PgindentDocumentFormatterProvider) {
    /* Preview formatter changes command */
    vscode.commands.registerCommand(Configuration.Commands.FormatterDiffView, async () => {
        if (!vscode.window.activeTextEditor) {
            vscode.window.showWarningMessage('Could not show diff for file - no active document opened');
            return;
        }

        const document = vscode.window.activeTextEditor.document;
        let parsed;
        try {
            parsed = await formatter.indentFileWithTemp(document);
        } catch (err) {
            logger.error('failed to format file %s', document.uri.fsPath, err);
            vscode.window.showErrorMessage('Failed to format document. See error in logs');
            logger.focus();
            return;
        }
        
        const filename = utils.getFileName(document.uri) ?? 'PostgreSQL formatting';
        try {
            await vscode.commands.executeCommand(
                                'vscode.diff', document.uri, parsed, filename);
        } catch (err) {
            logger.error(`failed to show diff for document %s`, document.uri.fsPath, err);
            vscode.window.showErrorMessage('Failed to show diff. See error in logs');
            logger.focus();
        } finally {
            if (await utils.fileExists(parsed)) {
                await utils.deleteFile(parsed);
            }
        }
    });
}

export async function registerFormatting(logger: utils.ILogger) {
    const formatter = new PgindentDocumentFormatterProvider(logger);
    for (const lang of ['c', 'h']) {
        languages.registerDocumentFormattingEditProvider({
            language: lang,
        }, formatter);
    }

    registerDiffCommand(logger, formatter);
}
