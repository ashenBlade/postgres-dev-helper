import * as vscode from 'vscode';
import {languages} from 'vscode';
import * as utils from './utils';
import { Configuration } from './extension';
import * as path from 'path';
import * as os from 'os';

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
            prompt: 'pg_config is required to build pg_bsd_indent',
            password: false,
            title: 'Enter pg_config path',
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

    private async findExistingPgbsdindent(workspace: vscode.WorkspaceFolder) {
        /* 
         * For pg_bsd_indent search 2 locations:
         * 
         *  - src/tools/pg_psd_indent: (PG >=16)
         *      - not exist: build
         *  - src/tools/pgindent/pg_bsd_indent (PG <16)
         *      - not exist: download + build
         */
        let pg_bsd_indent_dir = utils.getWorkspacePgSrcFile(
                                workspace.uri, 'src', 'tools', 'pg_bsd_indent');
        if (await utils.directoryExists(pg_bsd_indent_dir)) {
            /* src/tools/pg_bsd_indent */
            let pg_bsd_indent = utils.joinPath(pg_bsd_indent_dir, 'pg_bsd_indent');
            if (await utils.fileExists(pg_bsd_indent)) {
                return pg_bsd_indent;
            }

            /* Try to build it */
            this.logger.info('building pg_bsd_indent in %s', pg_bsd_indent_dir.fsPath);
            await utils.execShell('make', ['-C', pg_bsd_indent_dir.fsPath],
                                  {cwd: workspace.uri.fsPath});
            return pg_bsd_indent;
        }

        /* src/tools/pgindent/pg_bsd_indent */
        pg_bsd_indent_dir = utils.getWorkspacePgSrcFile(
                        workspace.uri, 'src', 'tools', 'pgindent', 'pg_bsd_indent');
        const pg_bsd_indent = utils.joinPath(pg_bsd_indent_dir, 'pg_bsd_indent');
        if (await utils.fileExists(pg_bsd_indent)) {
            return pg_bsd_indent;
        }

        const shouldClone = (!await utils.directoryExists(pg_bsd_indent_dir) || 
                                await utils.directoryEmpty(pg_bsd_indent_dir));

        const pg_configPath = await this.getPgConfigPath(workspace);

        /* Clone and build pg_bsd_indent */
        if (shouldClone) {
            const pgindentDir = utils.getWorkspacePgSrcFile(
                                    workspace.uri, 'src', 'tools', 'pgindent');
            try {
                this.logger.info('cloning pg_bsd_indent repository');
                await utils.execShell(
                    'git', ['clone', 'https://git.postgresql.org/git/pg_bsd_indent.git'],
                    {cwd: pgindentDir.fsPath});
            } catch (error) {
                throw new Error(`failed to git clone pg_bsd_indent repository: ${error}`);
            }
        }

        try {
            this.logger.info('building pg_bsd_indent')
            await utils.execShell(
                'make', ['all', `PG_CONFIG="${pg_configPath.fsPath}"`],
                {cwd: pg_bsd_indent_dir.fsPath});
            return pg_bsd_indent;
        } catch (error) {
            throw new Error(`failed to build pg_bsd_indent after clone: ${error}`);
        }
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

    private async getPgbsdindent(workspace: vscode.WorkspaceFolder) {
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

        return await this.findExistingPgbsdindent(workspace);
    }

    private runPreIndent(contents: string): string {
        function replace(regex: any, replacement: any) {
            contents = contents.replace(regex, replacement)
        }

        // Convert // comments to /* */
        replace(/^([ \t]*)\/\/(.*)$/gm, '$1/* $2 */');

        // Adjust dash-protected block comments so indent won't change them
        replace(/\/\* \+---/gm, '/*---X_X');

        // Prevent indenting of code in 'extern "C"' blocks
        // we replace the braces with comments which we'll reverse later
        replace(/(^#ifdef[ \t]+__cplusplus.*\nextern[ \t]+"C"[ \t]*\n)\{[ \t]*$/gm, 
                '$1/* Open extern "C" */');
        replace(/(^#ifdef[ \t]+__cplusplus.*\n)\}[ \t]*$/gm,
                '$1/* Close extern "C" */');

        // Protect wrapping in CATALOG()
        replace(/^(CATALOG\(.*)$/gm, '/*$1*/');

        return contents;
    }

    private runPostIndent(contents: string): string {
        function replace(regex: any, replacement: any) {
            contents = contents.replace(regex, replacement);
        }

        // Restore CATALOG lines
        replace(/^\/\*(CATALOG\(.*)\*\/$/gm, '$1');

        // put back braces for extern "C"
        replace(/^\/\* Open extern "C" \*\//gm, '{');
        replace(/^\/\* Close extern "C" \*\/$/gm, '}');

        // Undo change of dash-protected block comments
        replace(/\/\*---X_X/gm, '/* ---');

        // Fix run-together comments to have a tab between them
        replace(/\*\/(\/\*.*\*\/)$/gm, '*/\t$1');

        // Use a single space before '*' in function return types
        replace(/^([A-Za-z_]\S*)[ \t]+\*$/gm, '$1 *');

        return contents;
    }

    private async runPgindentInternal(document: string, 
                                      pg_bsd_indent: vscode.Uri,
                                      workspace: vscode.WorkspaceFolder) {
        /* 
         * We use pg_bsd_indent directly instead of pgindent because:
         *  - different pgindent versions behaves differently
         *  - direct call to pg_bsd_indent is faster
         *  - pgindent creates temp files which are not removed if error
         *    happens - we can not track these files (main reason)
         */
        let typedefs = await this.getProcessedTypedefs(workspace);
        const preProcessed = this.runPreIndent(document);
        const {stdout: processed} = await utils.execShell(
            pg_bsd_indent.fsPath, [
                ...PgindentDocumentFormatterProvider.pg_bsd_indentDefaultFlags,
                `-U${typedefs.fsPath}`],
            {
                stdin: preProcessed,
                /* 
                 * pg_bsd_indent returns non-zero code if it encountered some
                 * errors, but for us they are not important. i.e. no newline
                 * at end of file causes to return code 1
                 */
                throwOnError: false,
            });
        const postProcessed = this.runPostIndent(processed);

        /* On success cache pg_bsd_indent path */
        this.savedPgbsdPath = pg_bsd_indent;
        return postProcessed;
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
            /* There is no new line or (more likely) new line is last character */
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

    private async runPgindent(document: vscode.TextDocument, 
                              workspace: vscode.WorkspaceFolder) {
        let pg_bsd_indent = await this.getPgbsdindent(workspace);
        const content = this.getDocumentContent(document);
 
        try {
            return await this.runPgindentInternal(content, pg_bsd_indent, workspace);
        } catch (err) {
            if (await utils.fileExists(pg_bsd_indent)) {
                throw err;
            }
        }

        this.logger.info('pg_bsd_indent seems not installed. trying to install');
        this.savedPgbsdPath = undefined;
        pg_bsd_indent = await this.findExistingPgbsdindent(workspace);
        return await this.runPgindentInternal(content, pg_bsd_indent, workspace);
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
            this.logger.error('failed to run pgindent', err);
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
