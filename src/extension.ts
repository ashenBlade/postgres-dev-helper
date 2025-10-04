import * as path from 'path';
import * as vscode from 'vscode';

import * as utils from './utils';
import * as vars from './variables';
import * as dbg from './debugger';
import { Commands, 
         Configuration, 
         ExtensionId, 
         VsCodeSettings,
         openConfigFileCommand,
         refreshConfigCommand,
         setupConfiguration,
         Features,
         getWorkspacePgSrcFile } from './configuration';
import { setupPgConfSupport } from './pgconf';
import { PgindentDocumentFormatterProvider,
         setupFormatting } from './formatter';
import * as formatter from './formatter';
import { Log as logger } from './logger';
import { WorkspaceNotOpenedError } from './error';

function createDebuggerFacade(type: string, provider: vars.PgVariablesViewProvider): dbg.GenericDebuggerFacade | undefined {
    let debug;
    switch (type) {
        case 'cppdbg':
            debug = new dbg.CppDbgDebuggerFacade();
            if (!Features.hasEvaluateArrayLength()) {
                debug.switchToManualArrayExpansion();
            }
            break;
        case 'lldb':
            debug = new dbg.CodeLLDBDebuggerFacade();
            break;
        default:
            return;
    }
    if (Features.debugFocusEnabled()) {
        vscode.debug.onDidChangeActiveStackItem(() => provider.refresh(),
                                                undefined, debug.registrations);
    } else {
        debug.switchToEventBasedRefresh();
    }

    return debug;
}

async function promptWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        throw new Error('No workspaces opened');
    }

    if (folders.length === 1) {
        return folders[0];
    }

    /* 
     * Extension works only with first workspace in array, but here
     * it's ok to ask user input.
     */
    const name = await vscode.window.showQuickPick(
        folders.map(wf => wf.name), {
            title: 'Choose workspace',
            placeHolder: folders[0].name,
        });
    if (!name) {
        throw new Error('No workspaces chosen');
    }

    const workspace = folders.find(wf => wf.name === name);
    if (!workspace) {
        throw new Error(`Workspace named ${name} not found`);
    }

    return workspace;
}

async function promptExtensionName() {
    const extensionName = await vscode.window.showInputBox({
        prompt: 'Enter extension name',
    });
    if (!extensionName) {
        throw new Error('User did not specified extension name');
    }

    const workspace = await promptWorkspace();
    return {
        path: getWorkspacePgSrcFile(workspace.uri, 'contrib', extensionName),
        name: extensionName,
    };
}

async function promptExtensionFlags() {
    async function promptFlag(title: string) {
        const result = await vscode.window.showQuickPick([
            'Yes', 'No',
        ], {title, placeHolder: 'Yes'});
        if (!result) {
            throw new Error('User declined to answer');
        }

        return result === 'Yes';
    }

    async function promptString(title: string) {
        const result = await vscode.window.showInputBox({
            prompt: title,
        });

        return result ?? '';
    }

    return {
        c: await promptFlag('Use C sources?'),
        sql: await promptFlag('Use SQL sources?'),
        tap: await promptFlag('Include TAP tests?'),
        regress: await promptFlag('Include regress tests?'),
        comment: await promptString('Enter extension description'),
    };
}

async function bootstrapExtensionCommand() {
    async function bootstrapFile(name: string, contents: string[]) {
        const filePath = utils.joinPath(path, name);
        await utils.writeFile(filePath, contents.join('\n'));
    }

    const {path, name} = await promptExtensionName();

    if (await utils.directoryExists(path)) {
        if (!await utils.directoryEmpty(path)) {
            vscode.window.showErrorMessage(`Extension ${name} directory already exists and is not empty`);
            return;
        }
    } else {
        await utils.createDirectory(path);
    }

    const flags = await promptExtensionFlags();

    /* 
     * Makefile
     * *.control
     * *.sql
     * *.c
     * README
     * .gitignore
     */
    const makefile = [];
    if (flags.c) {
        makefile.push(`EXTENSION = ${name}`,
                      '',
                      `MODULE_big = ${name}`,
                      `OBJS = $(WIN32RES) ${name}.o`,
                      '');
    }

    if (flags.sql) {
        makefile.push(`DATA = ${name}--0.1.0.sql`, '');
    }

    if (flags.regress) {
        makefile.push(`REGRESS = init`, '');
    }
    
    if (flags.tap) {
        makefile.push(`TAP_TESTS = 1`, '');
    }

    makefile.push(
        'ifdef USE_PGXS',
        'PG_CONFIG := pg_config',
        'PGXS := $(shell $(PG_CONFIG) --pgxs)',
        'include $(PGXS)',
        'else',
        `subdir = contrib/${name}`,
        'top_builddir = ../..',
        'include $(top_builddir)/src/Makefile.global',
        'include $(top_srcdir)/contrib/contrib-global.mk',
        'endif',
        '',
    );

    await bootstrapFile('Makefile', makefile);

    const control = [
        `# ${name} extension`,
        "default_version = '0.1.0'",
    ];

    if (flags.comment) {
        control.push(`comment = '${flags.comment}'`);
    }

    if (flags.c) {
        control.push(`module_pathname = '$libdir/${name}'`);
    }
    
    control.push('relocatable = false');
    await bootstrapFile(`${name}.control`, control);

    await bootstrapFile('README', [
        `# ${name}`,
        '',
        flags.comment,
    ]);

    if (flags.c) {
        await bootstrapFile(`${name}.c`, [
            '#include "postgres.h"',
            '#include "fmgr.h"',
            '#include "utils/builtins.h"',
            '',
            '#ifdef PG_MODULE_MAGIC',
            'PG_MODULE_MAGIC;',
            '#endif',
            '',
            'void _PG_init(void);',
            'void _PG_fini(void);',
            '',
            'PG_FUNCTION_INFO_V1(hello_world);',
            '',
            'Datum',
            'hello_world(PG_FUNCTION_ARGS)',
            '{',
            '\tPG_RETURN_TEXT_P(cstring_to_text("hello, world!"));',
            '}',
            '',
            'void',
            '_PG_init(void)',
            '{',
            '}',
            '',
            'void',
            '_PG_fini(void)',
            '{',
            '}',
            '',
        ]);
    }

    if (flags.sql) {
        const sql = [
            'CREATE FUNCTION hello_world()',
            'RETURNS text',
        ];

        if (flags.c) {
            sql.push(
                'AS \'MODULE_PATHNAME\'',
                'LANGUAGE C IMMUTABLE;',
            );
        } else {
            sql.push(
                'AS $$',
                '\tSELECT \'hello, world!\';',
                '$$ LANGUAGE SQL IMMUTABLE;',
            );
        }
        
        sql.push('');

        await bootstrapFile(`${name}--0.1.0.sql`, sql);
    }

    if (flags.regress) {
        const regressDir = utils.joinPath(path, 'sql');
        const expectedDir = utils.joinPath(path, 'expected');

        await utils.createDirectory(regressDir);
        await utils.createDirectory(expectedDir);

        await utils.writeFile(
            utils.joinPath(regressDir, 'init.sql'), [
                `CREATE EXTENSION ${name};`,
                'SELECT hello_world() as text;',
            ].join('\n'));

        await utils.writeFile(
            utils.joinPath(expectedDir, 'init.out'), [
                `CREATE EXTENSION ${name};`,
                'SELECT hello_world() as text;',
                '     text      ',
                '---------------',
                ' hello, world!',
                '(1 row)',
                '',
                '',
            ].join('\n'));
    }

    if (flags.tap) {
        const tapDir = utils.joinPath(path, 't');
        await utils.createDirectory(tapDir);

        await utils.writeFile(
            utils.joinPath(tapDir, '001_basic.pl'), [
                'use strict;',
                'use warnings;',
                '',
                'use PostgreSQL::Test::Cluster;',
                'use PostgreSQL::Test::Utils;',
                'use Test::More tests => 1;',
                '',
                'my $node = PostgreSQL::Test::Cluster->new(\'main\');',
                '$node->init;',
                flags.c 
                    ? `$node->append_conf('postgresql.conf', qq{shared_preload_libraries='${name}'});` 
                    : '',
                '$node->start;',
                '',
                `$node->safe_psql('postgres', q(CREATE EXTENSION ${name}));`,
                "my $out = $node->safe_psql('postgres', 'SELECT hello_world();');",
                "is($out, 'hello, world!', 'Unexpected string');",
                '',
                'done_testing();',
                '',
            ].join('\n'),
        );
    }

    /* 
     * Bootstrap starts only if directory was empty, so no files exists.
     * Sometimes it can be handy to bootstrap directory after 'git clone'
     * with preinitialized files (.gitignore, README, etc...), but for now
     * do not add such checks.
     */
    await bootstrapFile('.gitignore', [
        '*.o',
        '*.so',
        '*.bc',
        '*.dll',
        '*.dylib',
        '*.a',
        '',
        '.deps',
        '',
        'regression.*',
        'results/*',
        'tmp_check/',
        'tmp_check_iso/',
        'output_iso/',
        '',
        'log/',
        '',
    ]);

    const td = await vscode.workspace.openTextDocument(utils.joinPath(path, 'Makefile'));
    await vscode.window.showTextDocument(td);
}

export function createPgVariablesView(context: vscode.ExtensionContext,
                                      config: Configuration) {
    const nodesView = new vars.PgVariablesViewProvider(config);
    const treeDisposable = vscode.window.registerTreeDataProvider(
        `${ExtensionId}.node-tree-view`, nodesView);
    context.subscriptions.push(
        treeDisposable,
        nodesView,
        
        vscode.debug.onDidStartDebugSession(s => {
            if (nodesView.isInDebug()) {
                return;
            }
            
            const debug = createDebuggerFacade(s.type, nodesView);
            if (!debug) {
                return;
            }

            nodesView.startDebugging(debug);
        }),
        vscode.debug.onDidTerminateDebugSession(_ => {
            nodesView.stopDebugging();
        }),
    );

    return nodesView;
}

export function setupExtension(context: vscode.ExtensionContext) {    
    /* Extension's configuration file and VS Code settings */
    const config = setupConfiguration(context);

    /* Variables view */
    const pgvars = setupPgVariablesView(context, config);

    /* Formatter */
    const formatter = setupFormatting(context, config);

    /* Completion support for postgresql.conf */
    setupPgConfSupport(context);

    /* Miscellaneous (remaining) commands */
    registerCommands(context, pgvars, formatter, config);
}

function setupPgVariablesView(context: vscode.ExtensionContext,
                              config: Configuration) {
    const pgvars = createPgVariablesView(context, config);
    
    /* Setup debugger specific function */
    dbg.setupDebugger(context, pgvars);

    /*
     * On start try to detect new NodeTags and if they exists, add to NodeVars
     * and ask user to add them to configuration file.
     * 
     * Also, run this only once, because if we will launch this check every time,
     * then it will be too resource expensive.
     */
    const key = 'NodeTagsCollectorLaunched';
    if (!context.workspaceState.get(key)) {
        const disposable = pgvars.onDidDebugStart(async (c) => {
            /* Run this only once */
            disposable.dispose();
            context.workspaceState.update(key, true);

            try {
                await searchNodeTagsWorker(config, c);
            } catch (err) {
                logger.error('could not search for new NodeTags', err);
            }
        });
    }

    return pgvars;
}

async function findAllFilesWithNodeTags(folders: readonly vscode.WorkspaceFolder[],
                                        pgversion: number) {
    const paths = [];
    for (const folder of folders) {
        /* 
         * Starting from 16 major version NodeTag is autogenerated and stored in nodetags.h.
         * Avoid parsing 'nodes.h', because it will not give us anything.
         */
        let file;
        if (16_00_00 <= pgversion) {
            file = getWorkspacePgSrcFile(folder.uri, 'src', 'include', 'nodes', 'nodetags.h');
        } else {
            file = getWorkspacePgSrcFile(folder.uri, 'src', 'include', 'nodes', 'nodes.h');
        }

        if (await utils.fileExists(file)) {
            paths.push(file);
        }
    }

    const customFiles = VsCodeSettings.getCustomNodeTagFiles();
    if (!customFiles) {
        return paths;
    }
    
    /* Search custom provided NodeTag files */
    for (const customFile of customFiles) {
        let uri;
        if (path.isAbsolute(customFile)) {
            uri = vscode.Uri.file(customFile);
            if (!await utils.fileExists(uri)) {
                continue;
            }
        } else {
            for (const folder of folders) {
                uri = getWorkspacePgSrcFile(folder.uri, customFile);
                if (await utils.fileExists(uri)) {
                    break;
                }
            }
            if (!uri) {
                continue;
            }
        }
        
        paths.push(uri);
    }
    
    return paths;
}

/*
 * Run Worker that will traverse all NodeTag containing files,
 * parse NodeTags and find which are missing - if find something,
 * then user is prompted to add them to configuration file.
 * 
 * This is quiet CPU intensive operation, so perform in another thread.
 */
async function searchNodeTagsWorker(config: Configuration,
                                    context: vars.ExecContext) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
        return;
    }

    if (!context.pgversion) {
        return;
    }

    /* Find all files containing NodeTags */
    const paths = await findAllFilesWithNodeTags(folders, context.pgversion);
    if (!paths.length) {
        logger.debug('no NodeTag files found');
        return;
    }

    /* Run worker and collect result */
    const newNodeTags = new Set<string>();
    for (const path of paths) {
        const tags = await vars.parseNodeTagsFile(path);
        if (!tags?.size) {
            continue;
        }

        for (const t of tags) {
            newNodeTags.add(t);
        }
    }

    for (const tag of context.nodeVarRegistry.nodeTags) {
        newNodeTags.delete(tag);
    }

    if (!newNodeTags.size) {
        /* No new NodeTags found */
        return;
    }
    
    for (const tag of newNodeTags) {
        context.nodeVarRegistry.nodeTags.add(tag);
    }

    logger.info('found %i new node tags', newNodeTags.size);
    const answer = await vscode.window.showInformationMessage(
        `Found ${newNodeTags.size} new NodeTags. ` +
        `Would you like to add them to configuration file?`,
        'Yes', 'No');
    if (answer !== 'Yes') {
        return;
    }

    logger.info('adding new NodeTags to configuration');
    await config.mutate((c) => (c.nodetags ??= []).push(...newNodeTags));
}

function registerCommands(context: vscode.ExtensionContext,
                          pgvars: vars.PgVariablesViewProvider,
                          fmt: PgindentDocumentFormatterProvider,
                          config: Configuration) {
    const registerCommand = <T>(name: string, command: (...args: unknown[]) => T | Thenable<T>) => {
        const disposable = vscode.commands.registerCommand(name, async (...args: unknown[]) => {
            try {
                logger.debug('executing command %s', name);
                return await command(...args);
            } catch (err) {
                if (err instanceof WorkspaceNotOpenedError) {
                    vscode.window.showInformationMessage('Open workspace before executing command');
                }

                logger.error('failed to execute command %s', name, err);
                throw err;
            }
        });
        context.subscriptions.push(disposable);
    };

    /* Configuration commands */
    registerCommand(Commands.RefreshConfigFile,
                    async () => refreshConfigCommand(config));
    registerCommand(Commands.OpenConfigFile, openConfigFileCommand);

    /* Formatter */
    registerCommand(Commands.FormatterDiffView, 
                    async () => await formatter.showFormatterDiffCommand(fmt));
    registerCommand(Commands.FindCustomTypedefsLists,
                    formatter.findCustomTypedefsListCommand);

    /* Variables */
    registerCommand(Commands.DumpNodeToLog, 
                    async (...args: unknown[]) => await vars.dumpNodeVariableToLogCommand(pgvars, ...args));
    registerCommand(Commands.DumpNodeToDoc, 
                    async (...args: unknown[]) => await vars.dumpNodeVariableToDocumentCommand(pgvars, ...args));
    registerCommand(Commands.RefreshVariables,
                    () => vars.refreshVariablesCommand(pgvars));
    registerCommand(Commands.AddToWatchView, vars.addVariableToWatchCommand);

    /* Miscellaneous */
    registerCommand(Commands.BootstrapExtension, bootstrapExtensionCommand);
    
    if (context.extensionMode === vscode.ExtensionMode.Test) {
        registerCommand(Commands.GetVariables, async () => await pgvars.getChildren());
        registerCommand(Commands.GetTreeViewProvider, async () => pgvars);
    }
}
