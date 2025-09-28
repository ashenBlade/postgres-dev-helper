import * as vscode from 'vscode';
import * as utils from './utils';
import { Features } from './utils';
import * as vars from './variables';
import * as dbg from './debugger';
import * as dap from './dap';
import { markConfigFileDirty, refreshConfiguration } from './configuration';
import { Log as logger } from './logger';
import { setupPgConfSupport } from './pgconf';
import { setupFormatting } from './formatter';


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

export async function dumpVariableToLogCommand(args: unknown, debug: dbg.IDebuggerFacade) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }

    if (!(typeof args === 'object' && args !== null && 'variable' in args)) {
        return;
    }

    const variable = args.variable as dap.DebugVariable;

    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        vscode.window.showWarningMessage(`Could not get current stack frame id in order to invoke 'pprint'`);
        return;
    }

    if (!(debug.isValidPointerType(variable))) {
        vscode.window.showWarningMessage(`Variable ${variable.value} is not valid pointer`);
        return;
    }

    const expression = `pprint((const void *) ${debug.getPointer(variable)})`;
    try {
        await debug.evaluate(expression,
                             frameId, 
                             undefined  /* context */, 
                             true       /* no return */);
    } catch (err: unknown) {
        logger.error('could not dump variable %s to log', variable.name, err);
        vscode.window.showErrorMessage(`Could not dump variable ${variable.name}. `
                                     + 'See errors in Output log');
    }
}

export async function dumpVariableToDocumentCommand(variable: dap.DebugVariable,
                                                    debug: dbg.IDebuggerFacade) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        return;
    }

    const frameId = await debug.getCurrentFrameId();
    if (frameId === undefined) {
        vscode.window.showWarningMessage(`Could not get current stack frame id to invoke functions`);
        return;
    }

    if (!(debug.isValidPointerType(variable))) {
        vscode.window.showWarningMessage(`Variable ${variable.value} is not valid pointer`);
        return;
    }

    /* 
     * In order to make node dump we use 2 functions:
     * 
     * 1. 'nodeToStringWithLocations' - dump arbitrary node object into string form
     * 2. 'pretty_format_node_dump' - prettify dump returned from 'nodeToString'
     * 
     * This sequence is well known and also used in 'pprint' itself, so feel
     * free to use it.
     */
    const nodeToStringExpr = `nodeToStringWithLocations((const void *) ${debug.getPointer(variable)})`;
    let response;
    try {
        response = await debug.evaluate(nodeToStringExpr, frameId);
    } catch (err: unknown) {
        logger.error('could not dump variable %s to string', variable.name, err);
        vscode.window.showErrorMessage(`Could not dump variable ${variable.name}. `
                                     + 'See errors in Output log');
        return;
    }

    /* Save to pfree later */
    const savedNodeToStringPtr = response.memoryReference;

    const prettyFormatExpr = `pretty_format_node_dump((const char *) ${response.memoryReference})`;
    try {
        response = await debug.evaluate(prettyFormatExpr, frameId);
    } catch (err: unknown) {
        logger.error('could not pretty print node dump', variable.name, err);
        vscode.window.showErrorMessage(`Could pretty print variable ${variable.name}. `
                                     + 'See errors in Output log');
        return;
    }

    const debugVariable: dbg.IDebugVariable = {
        type: response.type,
        value: response.result,
        memoryReference: response.memoryReference,
    };
    const ptr = debug.extractPtrFromString(debugVariable);
    const node = await debug.extractLongString(debugVariable, frameId);

    /*
     * Perform pfree'ing ONLY after extracting string, otherwise there will
     * be garbage '\\177' in string buffer.
     */
    try {
        await debug.evaluate(`pfree((const void *) ${ptr})`, frameId,
                             undefined, true);
        await debug.evaluate(`pfree((const void *) ${savedNodeToStringPtr})`, frameId,
                             undefined, true);           
    } catch (err: unknown) {
        /* This is not critical error actually, so just log and continue */
        logger.error('could not dump variable %s to log', variable.name, err);
        
        /* continue */
    }

    if (node === null) {
        vscode.window.showErrorMessage('Could not obtain node dump: NULL is returned from nodeToString');
        return;
    }

    /* 
     * Finally, show document with node dump.  It would be nice to also set
     * appropriate title, but I don't known how to do it without saving file.
     */
    const document = await vscode.workspace.openTextDocument({content: node});
    vscode.window.showTextDocument(document);
}

async function promptWorkspace() {
    if (!vscode.workspace.workspaceFolders) {
        throw new Error('No workspaces opened');
    }

    if (vscode.workspace.workspaceFolders.length === 1) {
        return vscode.workspace.workspaceFolders[0];
    }

    const name = await vscode.window.showQuickPick(
        vscode.workspace.workspaceFolders.map(wf => wf.name), {
            title: 'Choose workspace',
            placeHolder: vscode.workspace.workspaceFolders[0].name,
        });
    if (!name) {
        throw new Error('No workspaces chosen');
    }

    const workspace = vscode.workspace.workspaceFolders.find(wf => wf.name === name);
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
        path: utils.getWorkspacePgSrcFile(workspace.uri, 'contrib', extensionName),
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

export function createPgVariablesView(context: vscode.ExtensionContext) {
    const nodesView = new vars.PgVariablesViewProvider();
    const nodesViewName = Configuration.Views.NodePreviewTreeView;
    const treeDisposable = vscode.window.registerTreeDataProvider(nodesViewName,
                                                                  nodesView);
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
    /* Extension's configuration file */
    setupConfigurationFile(context);

    /* Variables view */
    const pgvars = setupPgVariablesView(context);
    
    /* Completion support for postgresql.conf */
    setupPgConfSupport(context);
    
    /* Setup debugger specific function */
    dbg.setupDebugger(context, pgvars);
    
    /* Formatter */
    setupFormatting();
    
    /* Miscellaneous (remaining) commands */
    registerCommands(context, pgvars);
}

function setupPgVariablesView(context: vscode.ExtensionContext) {
    const pgvars = createPgVariablesView(context);
    
    /* TODO: unused - remove */
    const nodeVars = new vars.NodeVarRegistry();
    setupNodeTagFiles(context, nodeVars);

    return pgvars;
}

function setupConfigurationFile(context: vscode.ExtensionContext) {
    /* Mark configuration dirty when user changes it - no eager parsing */
    const configFileWatcher = vscode.workspace.createFileSystemWatcher(Configuration.ExtensionSettingsFileName, false, false, true);
    context.subscriptions.push(configFileWatcher);
    configFileWatcher.onDidChange(markConfigFileDirty, undefined, context.subscriptions);
    configFileWatcher.onDidCreate(markConfigFileDirty, undefined, context.subscriptions);
}

function registerCommands(context: vscode.ExtensionContext, pgvars: vars.PgVariablesViewProvider) {
    /* Register command to dump variable to log */
    const pprintVarToLogCmd = async (args: unknown) => {
        try {
            if (!pgvars.context) {
                return;
            }

            await dumpVariableToLogCommand(args, pgvars.context.debug);
        } catch (err: unknown) {
            logger.error('error while dumping node to log', err);
        }
    };

    const dumpNodeToDocCmd = async (args: unknown) => {
        try {
            if (!pgvars.context) {
                return;
            }

            /* Command can be run for 'Variable' or 'pg variables' views */
            let variable: dap.DebugVariable;
            if (args instanceof vars.Variable) {
                const nodeVar = args;
                if (!(nodeVar instanceof vars.NodeVariable)) {
                    return;
                }

                variable = {
                    name: nodeVar.name,
                    type: nodeVar.type,
                    value: nodeVar.value,
                    evaluateName: nodeVar.name,
                    variablesReference: nodeVar.variablesReference,
                    memoryReference: nodeVar.memoryReference,
                };
            } else if (typeof args === 'object' && args && 'variable' in args) {
                variable = args.variable as dap.DebugVariable;
            } else {
                logger.error('could not get DebugVariable from given "args" = %o', args);
                return;
            }

            await dumpVariableToDocumentCommand(variable, pgvars.context.debug);
        } catch (err: unknown) {
            logger.error('error while dumping node to log', err);
        }
    };

    /* Refresh config file command */
    const refreshConfigCmd = async () => {
        logger.info('refreshing config file due to command execution');
        try {
            await refreshConfiguration();
        } catch (err: unknown) {
            logger.error('could not refresh configuration', err);
        }
    };

    const openConfigFileCmd = async () => {
        if (!vscode.workspace.workspaceFolders?.length) {
            vscode.window.showInformationMessage('No workspaces found - open directory first');
            return;
        }

        for (const folder of vscode.workspace.workspaceFolders) {
            const configFilePath = utils.joinPath(
                folder.uri,
                '.vscode',
                Configuration.ExtensionSettingsFileName);
            const propertiesFileExists = await utils.fileExists(configFilePath);
            /* Create default configuration file if not exists */
            if (!propertiesFileExists) {
                if (await utils.fsEntryExists(configFilePath)) {
                    vscode.window.showErrorMessage(`Can not create ${Configuration.ExtensionSettingsFileName} - fs entry exists and not file`);
                    return;
                }

                logger.debug('creating %s configuration file', configFilePath.fsPath);
                const configDirectoryPath = utils.joinPath(configFilePath, '..');
                if (!await utils.directoryExists(configDirectoryPath)) {
                    try {
                        await utils.createDirectory(configDirectoryPath);
                    } catch (err) {
                        logger.error('failed to create config directory', err);
                        return;
                    }
                }

                try {
                    await utils.writeFile(configFilePath, JSON.stringify(
                        /* Example config file */
                        {
                            arrays: [],
                            aliases: [],
                            customListTypes: [],
                            htab: [],
                            simplehash: [],
                            enums: [],
                            typedefs: [],
                        },
                        undefined, '    '));
                } catch (err: unknown) {
                    logger.error('Could not write default configuration file', err);
                    vscode.window.showErrorMessage('Error creating configuration file');
                    return;
                }
            }

            let doc;
            try {
                doc = await vscode.workspace.openTextDocument(configFilePath);
            } catch (err: unknown) {
                logger.error('failed to open configuration file', err);
                return;
            }

            try {
                await vscode.window.showTextDocument(doc);
            } catch (err: unknown) {
                logger.error('failed to show configuration file', err);
                return;
            }

            /* Stop at first success folder to process */
            break;
        }
    };

    const bootstrapExtensionCmd = async () => {
        try {
            await bootstrapExtensionCommand();
        } catch (err) {
            logger.error('Failed to bootstrap extension', err);
        }
    };

    const refreshVariablesCmd = () => {
        logger.info('refreshing variables view due to command');
        pgvars.refresh();
    };

    const addVariableToWatchCmd = async (args: unknown) => {
        const expr = await vars.getWatchExpressionCommandHandler(args);
        if (!expr) {
            return;
        }

        await vscode.commands.executeCommand('debug.addToWatchExpressions', {
            variable: {
                evaluateName: expr,
            },
        });
    };
    
    const findCustomTypedefsListCmd = async (_: unknown) => {
        const cmd = "find . -name '*typedefs.list' | grep -vE '^\\./(src|\\.vscode)'";
        const terminal = vscode.window.createTerminal();
        terminal.sendText(cmd, true /* shouldExecute */);
        terminal.show();
    };

    /* Used for testing only */
    const getVariablesCmd = async () => {
        try {
            return await pgvars.getChildren(undefined);
        } catch (err) {
            logger.error('failed to get variables', err);
        }
    };

    const getNodeTreeProviderCmd = async () => {
        return pgvars;
    };

    const registerCommand = (name: string, command: (...args: unknown[]) => void) => {
        const disposable = vscode.commands.registerCommand(name, command);
        context.subscriptions.push(disposable);
    };

    registerCommand(Configuration.Commands.RefreshConfigFile, refreshConfigCmd);
    registerCommand(Configuration.Commands.OpenConfigFile, openConfigFileCmd);
    registerCommand(Configuration.Commands.DumpNodeToLog, pprintVarToLogCmd);
    registerCommand(Configuration.Commands.DumpNodeToDoc, dumpNodeToDocCmd);
    registerCommand(Configuration.Commands.RefreshPostgresVariables, refreshVariablesCmd);
    registerCommand(Configuration.Commands.BootstrapExtension, bootstrapExtensionCmd);
    registerCommand(Configuration.Commands.AddToWatchView, addVariableToWatchCmd);
    registerCommand(Configuration.Commands.GetVariables, getVariablesCmd);
    registerCommand(Configuration.Commands.GetTreeViewProvider, getNodeTreeProviderCmd);
    registerCommand(Configuration.Commands.FindCustomTypedefsLists, findCustomTypedefsListCmd);
}

async function setupNodeTagFiles(context: vscode.ExtensionContext,
                                 nodeVars: vars.NodeVarRegistry) {
    /* TODO: remove this thing with setting */
    const getNodeTagFiles = () => {
        /* TODO: remove this setting */
        const customNodeTagFiles = Configuration.getCustomNodeTagFiles();
        if (customNodeTagFiles?.length) {
            return customNodeTagFiles;
        }

        return [
            /* TODO: use getWorkspacePgSrcFile */
            utils.getPgSrcFile('src', 'include', 'nodes', 'nodes.h'),
            utils.getPgSrcFile('src', 'include', 'nodes', 'nodetags.h'),
        ];
    };
    
    const handleNodeTagFile = async (path: vscode.Uri) => {
        if (!await utils.fileExists(path)) {
            return;
        }

        logger.debug('processing %s NodeTags file', path.fsPath);
        const document = await vscode.workspace.openTextDocument(path);
        try {
            const added = nodeVars.updateNodeTypesFromFile(document);
            logger.debug('added %i NodeTags from %s file', added, path.fsPath);
        } catch (err: unknown) {
            logger.error('could not initialize node tags array', err);
        }
    };

    const setupSingleFolder = async (folder: vscode.WorkspaceFolder) => {
        const nodeTagFiles = getNodeTagFiles();

        for (const filePath of nodeTagFiles) {
            const file = utils.joinPath(folder.uri, filePath);
            await handleNodeTagFile(file);
            const pattern = new vscode.RelativePattern(folder, filePath);
            const watcher = vscode.workspace.createFileSystemWatcher(pattern,
                                                                     false, false, 
                                                                     /* ignoreDeleteEvents */ true);
            watcher.onDidChange(async uri => {
                logger.info('detected change in NodeTag file: %s', uri);
                await handleNodeTagFile(uri);
            }, context.subscriptions);
            watcher.onDidCreate(async uri => {
                logger.info('detected creation of NodeTag file: %s', uri);
                await handleNodeTagFile(uri);
            }, context.subscriptions);
    
            context.subscriptions.push(watcher);
        }
    };

    if (vscode.workspace.workspaceFolders?.length) {
        /* TODO: throttle */
        await Promise.all(
            vscode.workspace.workspaceFolders.map(async folder =>
                await setupSingleFolder(folder),
            ),
        );
    }

    vscode.workspace.onDidChangeWorkspaceFolders(async e => {
        for (const folder of e.added) {
            await setupSingleFolder(folder);
        }
    }, undefined, context.subscriptions);
}

export class Configuration {
    static ExtensionName = 'postgresql-hacker-helper';
    static ExtensionPrettyName = 'PostgreSQL Hacker Helper';
    static ConfigSections = {
        TopLevelSection: this.ExtensionName,
        NodeTagFiles: 'nodeTagFiles',
        LogLevel: 'logLevel',
        PgbsdindentPath: 'pg_bsd_indentPath',
        SrcPath: 'srcPath',
    };
    static Commands = {
        DumpNodeToLog: `${this.ExtensionName}.dumpNodeToLog`,
        DumpNodeToDoc: `${this.ExtensionName}.dumpNodeToDoc`,
        OpenConfigFile: `${this.ExtensionName}.openConfigurationFile`,
        RefreshPostgresVariables: `${this.ExtensionName}.refreshPostgresVariablesView`,
        RefreshConfigFile: `${this.ExtensionName}.refreshConfigFile`,
        FormatterDiffView: `${this.ExtensionName}.formatterShowDiff`,
        BootstrapExtension: `${this.ExtensionName}.bootstrapExtension`,
        AddToWatchView: `${this.ExtensionName}.addVariableToWatch`,
        GetVariables: `${this.ExtensionName}.getVariables`,
        GetTreeViewProvider: `${this.ExtensionName}.getTreeViewProvider`,
        FindCustomTypedefsLists: `${this.ExtensionName}.formatterFindTypedefsList`,
    };
    static Views = {
        NodePreviewTreeView: `${this.ExtensionName}.node-tree-view`,
    };
    static ExtensionSettingsFileName = 'pgsql_hacker_helper.json';
    
    static getConfigFile(workspace: vscode.Uri) {
        return vscode.Uri.joinPath(workspace, '.vscode', this.ExtensionSettingsFileName);
    }

    static getLogLevel() {
        return this.getConfig<string>(this.ConfigSections.LogLevel);
    };

    static getCustomNodeTagFiles() {
        return this.getConfig<string[]>(this.ConfigSections.NodeTagFiles);
    };

    static getCustomPgbsdindentPath() {
        return this.getConfig<string>(this.ConfigSections.PgbsdindentPath);
    }

    static getSrcPath() {
        return this.getConfig<string>(this.ConfigSections.SrcPath);
    }

    static getConfig<T>(section: string) {
        const topLevelSection = this.ConfigSections.TopLevelSection;
        const config = vscode.workspace.getConfiguration(topLevelSection);
        return config.get<T>(section);
    };
    static getFullConfigSection(section: string) {
        return `${this.ConfigSections.TopLevelSection}.${section}`;
    }
}
