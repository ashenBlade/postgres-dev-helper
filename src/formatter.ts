import * as vscode from 'vscode';
import {languages} from 'vscode';
import * as utils from './utils';
import { Configuration } from './extension';
import * as path from 'path';
import * as os from 'os';

class LineDiff {
    constructor(public isInsert: boolean, 
                public num: number, 
                public lines: string[]) 
    { }
}

class LineDiffGroup {
    constructor(private diffs: LineDiff[]) { };
    bake(document: vscode.TextDocument): vscode.TextEdit[] {
        const edits = [];
        for (const diff of this.diffs) {
            if (diff.isInsert) {
                /* Small trick to make all lines end with new line */
                diff.lines.push('');
                edits.push(vscode.TextEdit.insert(document.lineAt(diff.num).range.start, 
                           diff.lines.join('\n')));
            } else {
                
                /* 
                 * document.lineAt().range returns range of line 
                 * NOT including new line, so just passing it
                 * we just clear that line - it will remain just empty.
                 * To handle this, we pass start character of line
                 * after last in this group (if).
                 * But handle cases, when last line - last in document (else)
                 */
                if (diff.num + diff.lines.length < document.lineCount) {
                    edits.push(vscode.TextEdit.delete(new vscode.Range(
                        document.lineAt(diff.num).range.start,
                        document.lineAt(diff.num + diff.lines.length).range.start
                    )));
                } else {
                    edits.push(vscode.TextEdit.delete(new vscode.Range(
                        document.lineAt(diff.num).range.start,
                        document.lineAt(diff.num + diff.lines.length - 1).range.end
                    )));
                }
                continue;
            }
        }
    
        return edits;
    }
}

/* 
 * To parse diff output we use FSM. It has 3 states and operates like this:
 *              
 * --- /file/from                       <-------- Initial State
 * +++ /file/to
 * @@ -X,X +X,X @@                      <-------- Plain Text State
 *  asdfasdfasdf
 *  asdfasdfasdf
 *  asdfasdfasdf
 * -asdfasdfasdf                        <-------- Change Group State
 * -asdfasdfasdf
 * +asdfasdfasdf
 *  asdfasdfasdf                        <-------- Plain Text State
 *  asdfasdfasdf
 *  asdfasdfasdf
 * @@ -X,X +X,X @@
 *  asdfasdfasdf
 *  asdfasdfasdf
 *  asdfasdfasdf
 * +asdfasdfasdf                        <-------- Change Group State
 *  asdfasdfasdf                        <-------- Plain Text State
 *  asdfasdfasdf
 *  asdfasdfasdf
 */
abstract class FSMState {
    constructor(protected fsm: DiffParserFSM) { }
    abstract apply(start: string, line: string): void;
    protected isChangeGroupSymbol(symbol: string): boolean {
        return symbol == '-' || symbol == '+';
    }
}

class InitialState extends FSMState {
    constructor(fsm: DiffParserFSM) {
        super(fsm);
    }
    
    apply(start: string, line: string): void {
        if (start != '@') {
            return;
        }

        this.fsm.state = new PlainLineState(-1, this.fsm);
        this.fsm.state.apply(start, line);
    }
}

/**
 * State for handling plain text with no changes or start of new chunk (@@...)
 */
class PlainLineState extends FSMState {
    constructor(private line: number, fsm: DiffParserFSM) {
        super(fsm);
    }
    apply(start: string, line: string): void {
        if (this.isChangeGroupSymbol(start)) {
            this.fsm.state = new ChangeGroupState(this.line, this.fsm);
            this.fsm.state.apply(start, line);
            return;
        }

        /* 
         * If new hunk is started -record it's start line,
         * otherwise just increment current line
         */
        if (start === '@') {
            /* 
             * Chunk start has form:
             * @@ -<start-line>,<lines-count> +<start-line>,<lines-count> @@ ...
             * 
             * We need to get -<start-line> (without '-')
             */
            const [, startFileRange,] = line.split(' ', 2);
            const startLine = Number(startFileRange.slice(1).split(',')[0])
            if (Number.isNaN(startLine)) {
                throw new Error(`Failed to parse start line in line: ${line}`);
            }
            this.line = startLine - 1;
        } else {
            this.line++;
        }
    }
}

/**
 * State for handling group of changes: consecutive lines starts with '+' or '-'
 */
class ChangeGroupState extends FSMState {
    private insertLine: number;
    private diffs: LineDiff[] = [];
    private inDeleteGroup: boolean = false;

    constructor(private line: number, fsm: DiffParserFSM) {
        super(fsm);
        this.insertLine = line;
    }
    
    apply(start: string, line: string): void {
        /* End of change group - move to plain text handler */
        if (!this.isChangeGroupSymbol(start)) {
            this.fsm.groups.push(new LineDiffGroup(this.diffs));
            this.fsm.state = new PlainLineState(this.line, this.fsm);
            this.fsm.state.apply(start, line);
            return;
        }

        /* 
         * To correctly handle new line in change group we do following.
         * Track 3 variables:
         *   - line - current line in *original* file (to apply changes 
         *            in original file)
         *   - insertLine - line to which *new insert* should be done
         *   - inDeleteGroup - previous line was delete ('-')
         * 
         * 'line' and 'insertLine' are separate because when we step on '-',
         * we increment 'line', but inserting should be done at start of 
         * delete group (consecutive '-' lines).
         * 
         * Change group - is a group of consecutive lines starts with '+' or '-'.
         * This state must parse this group and create LineDiffGroup which
         * later will be used to create delta of file change.
         * 
         * As small optimization, we create single LineDiff for group of '+' or '-'.
         * This checked as 'inDeleteGroup' must relate by start symbol group
         * and diffs array must not be empty. 
         * In such case just add current line to last LineDiff.
         * 
         * Interesting part is when we must create new LineDiff.
         *      Delete group - just create new group for current line 
         *      and update 'insertLine' with current.
         * 
         *      Insert group - create new group with line = 'insertLine',
         *      because it initialized with 'line' at start we correctly
         *      handle first symbol of group 
         */

        if (start === '-') {
            /* Use '' as stub for line - we don't need it when deleting */
            if (this.diffs.length > 0 && this.inDeleteGroup) {
                this.diffs[this.diffs.length - 1].lines.push('');
            } else {
                this.diffs.push(new LineDiff(false, this.line, ['']));
                this.inDeleteGroup = true;
                this.insertLine = this.line;
            }
            this.line++;
        } else /* start === '+' */ {
            if (this.diffs.length > 0 && !this.inDeleteGroup) {
                this.diffs[this.diffs.length - 1].lines.push(line.slice(1));
            } else {
                this.diffs.push(new LineDiff(true, this.insertLine, [line.slice(1)]));
                this.inDeleteGroup = false;
            }
        }
    }
}

/*
 * Finite state machine is used for parsing diff output (in universal format).
 * There are 3 states:
 *  - Initial: first state, it just proceed until reach new hunk, 
 *             then initialize PlainText state
 *  - PlainText: used to handled lines without changes and new hunks (@@...)
 *  - ChangeGroup: process group of consecutive changes (line start with - or +)
 */

class DiffParserFSM {
    state: FSMState = new InitialState(this);
    groups: LineDiffGroup[] = [];

    apply(start: string, line: string) {
        this.state.apply(start, line);
    }
}

class DiffParser {
    static parseContents(diff: string, document: vscode.TextDocument) {
        const parser = new DiffParserFSM();

        for (const line of diff.split(/\r?\n/)) {
            const startSymbol = line[0];
            parser.apply(startSymbol, line);
        }

        const edits = [];
        for (const group of parser.groups) {
            for (const edit of group.bake(document)) {
                edits.push(edit);
            }
        }
        return edits;
    }
}

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
    constructor(private logger: utils.ILogger) {}

    private async findExistingPgbsdindent(workspace: vscode.WorkspaceFolder) {
        /* 
         * For pg_bsd_indent search 2 locations:
         * 
         *  - src/tools/pg_psd_indent: (PG >=16)
         *      - not exist: build
         *  - src/tools/pgindent/pg_bsd_indent (PG <16)
         *      - not exist: download + build
         */
        let pg_bsd_indent_dir = utils.getWorkspacePgSrcFile(workspace.uri, 'src', 'tools', 'pg_bsd_indent');
        if (await utils.directoryExists(pg_bsd_indent_dir)) {
            /* src/tools/pg_bsd_indent */
            let pg_bsd_indent = utils.joinPath(pg_bsd_indent_dir, 'pg_bsd_indent');
            if (await utils.fileExists(pg_bsd_indent)) {
                return pg_bsd_indent;
            }

            /* Try to build it */
            const response = await vscode.window.showWarningMessage(
                            'Seems like pg_bsd_indent is not build yet. ' +
                            'Formatting is not supported without it. ' + 
                            'Build?', 
                            'Yes', 'No');
            if (!response || response === 'No') {
                throw new Error('pg_bsd_indent not found and user do not want to build it');
            }
            
            this.logger.info('building pg_bsd_indent in %s', pg_bsd_indent_dir.fsPath);
            await utils.execShell(
                'make', ['-C', pg_bsd_indent_dir.fsPath],
                {cwd: workspace.uri.fsPath});

            return pg_bsd_indent;
        }

        /* src/tools/pgindent/pg_bsd_indent */
        pg_bsd_indent_dir = utils.getWorkspacePgSrcFile(workspace.uri, 
                                               'src', 'tools', 'pgindent', 'pg_bsd_indent');
        const pg_bsd_indent = utils.joinPath(pg_bsd_indent_dir, 'pg_bsd_indent');
        if (await utils.fileExists(pg_bsd_indent)) {
            return pg_bsd_indent;
        }

        const shouldClone = (!await utils.directoryExists(pg_bsd_indent_dir) || 
                                await utils.directoryEmpty(pg_bsd_indent_dir));

        vscode.window.showWarningMessage(
                                'pg_bsd_indent is not found in pgindent. ' + 
                                'pg_config is required to build it. ' + 
                                'Enter path to pg_config');
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
        
        /* Clone and build pg_bsd_indent */
        if (shouldClone) {
            try {
                this.logger.info('cloning pg_bsd_indent repository');
                await utils.execShell(
                    'git', ['clone', 'https://git.postgresql.org/git/pg_bsd_indent.git'],
                    {cwd: utils.getWorkspacePgSrcFile(workspace.uri, 'src', 'tools', 'pgindent').fsPath});
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

    private async getPgbsdindent(workspace: vscode.WorkspaceFolder) {
        if (this.savedPgbsdPath) {
            return this.savedPgbsdPath;
        }

        const userPgbsdindent = Configuration.getCustomPgbsdindentPath();
        if (userPgbsdindent) {
            return path.isAbsolute(userPgbsdindent) 
                            ? vscode.Uri.file(userPgbsdindent) 
                            : utils.joinPath(workspace.uri, userPgbsdindent)
        }

        return await this.findExistingPgbsdindent(workspace);
    }
    
    private async runPgindentInternal(document: vscode.TextDocument, 
                                      pg_bsd_indent: vscode.Uri) {
        /* 
         * We use pg_bsd_indent directly instead of pgindent because:
         *  - different pgindent versions behaves differently
         *  - direct call to pg_bsd_indent is faster
         */
        let typedefs = await this.getTypedefs(utils.joinPath(pg_bsd_indent, '..'));
        const {stdout} = await utils.execShell(
            pg_bsd_indent.fsPath, [
                ...PgindentDocumentFormatterProvider.pg_bsd_indentDefaultFlags,
                `-U${typedefs.fsPath}`],
            {stdin: document.getText()});
        /* On success cache pg_bsd_indent path */
        this.savedPgbsdPath = pg_bsd_indent;
        return stdout;
    }

    private async runPgindent(document: vscode.TextDocument, 
                              workspace: vscode.WorkspaceFolder) {
        let pg_bsd_indent = await this.getPgbsdindent(workspace);

        try {
            return await this.runPgindentInternal(document, pg_bsd_indent);
        } catch (err) {
            if (await utils.fileExists(pg_bsd_indent)) {
                throw err;
            }
        }
        
        /* Second attempt */
        this.logger.info('pg_bsd_indent seems not installed. trying to install');
        this.savedPgbsdPath = undefined;
        pg_bsd_indent = await this.findExistingPgbsdindent(workspace);
        return await this.runPgindentInternal(document, pg_bsd_indent);
    }

    private async runDiff(originalFile: vscode.Uri, indented: string) {
        /* 
         * Exit code:
         * 
         *    0 - no differences
         *    1 - differences found
         *   >1 - errors occurred
         */
        const {code, stdout, stderr} = await utils.execShell(
            'diff', [ '-upd', originalFile.fsPath, '-' ], 
            {throwOnError: false, stdin: indented});
        if (1 < code) {
            throw new Error(`Failed to exec diff: ${stderr}`);
        }
        return stdout;
    }

    private async getTypedefs(pg_bsd_indent: vscode.Uri) {
        try {
            const typedefsFile = utils.joinPath(pg_bsd_indent, 'typedefs.list');
            if (await utils.fileExists(typedefsFile)) {
                return typedefsFile;    
            }

            const url = 'https://buildfarm.postgresql.org/cgi-bin/typedefs.pl';
            this.logger.info('downloading typedefs file from %s', url);
            await utils.execShell('wget', ['-O', typedefsFile.fsPath, url]);

            return typedefsFile;
        } catch (err) {
            throw new Error(`failed to download typedefs: ${err}`);
        }
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

        let diff;
        try {
            diff = await this.runDiff(document.uri, indented);
        } catch (err) {
            this.logger.error('failed to run diff for indent', err);
            return [];
        }
        
        try {
            return DiffParser.parseContents(diff, document);
        } catch (err) {
            this.logger.error('failed to parse diff contents', err);
            return [];
        }
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
        
        try {
            await vscode.commands.executeCommand('vscode.diff', document.uri, parsed, 'PostgreSQL formatting')
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
