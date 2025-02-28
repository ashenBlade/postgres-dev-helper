import * as vscode from 'vscode';
import * as utils from './utils';
import * as dap from './dap';
import * as vars from './variables';
import path from 'path';

export class NodePreviewTreeViewProvider implements vscode.TreeDataProvider<vars.Variable> {
    subscriptions: vscode.Disposable[] = [];

    private getCurrentFrameId = async (_: utils.IDebuggerFacade) => {
        /* debugFocus API */
        return (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    }

    constructor(
        private log: utils.ILogger,
        private nodeVars: vars.NodeVarRegistry,
        private specialMembers: vars.SpecialMemberRegistry,
        private debug: utils.IDebuggerFacade) { }

    /* https://code.visualstudio.com/api/extension-guides/tree-view#updating-tree-view-content */
    private _onDidChangeTreeData = new vscode.EventEmitter<vars.Variable | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getSpecialMember(variable: vars.Variable): vars.ArraySpecialMemberInfo | undefined {
        if (!variable.parent) {
            return;
        }

        return this.specialMembers.getArraySpecialMember(variable.parent.type, variable.name)
    }

    private async createExecContext(frameId: number) {
        let contribVersion;
        try {
            const result = await this.debug.evaluate('pg_hacker_helper_version()', frameId);
            contribVersion = Number.parseInt(result.result);
        } catch (e) {
            contribVersion = 0;
         }
        return {
            debug: this.debug,
            nodeVarRegistry: this.nodeVars,
            specialMemberRegistry: this.specialMembers,
            contribVersion
        }
    }

    async getTreeItem(variable: vars.Variable) {
        return variable.getTreeItem();
    }

    async getChildren(element?: vars.Variable | undefined) {
        if (!this.debug.isInDebug) {
            return;
        }

        try {
            if (element) {
                return await element.getChildren();
            } else {
                const frameId = await this.getCurrentFrameId(this.debug);
                if (!frameId) {
                    return;
                }

                const exec = await this.createExecContext(frameId);
                const topLevel = await this.getTopLevelVariables(exec, frameId);
                if (!topLevel) {
                    return;
                }
                
                const topLevelVariable = new vars.VariablesRoot(topLevel, exec);
                topLevel.forEach(v => v.parent = topLevelVariable);
                return topLevel;
            }
        } catch (err) {
            /* 
             * There may be race condition when our state of debugger 
             * is 'ready', but real debugger is not. Such cases include
             * debugger detach, continue after breakpoint etc. 
             * (we can not send commands to debugger).
             * 
             * In this cases we must return empty array - this will 
             * clear our tree view.
             */
            if (err instanceof Error &&
                err.message.indexOf('No debugger available') !== -1) {
                return;
            }
        }
    }

    async getTopLevelVariables(context: vars.ExecContext, frameId: number) {
        const variables = await context.debug.getVariables(frameId);
        return await vars.Variable.mapVariables(variables, frameId, context,
            this.log, undefined);
    }

    switchToEventBasedRefresh(context: vscode.ExtensionContext) {
        /* 
         * Prior to VS Code version 1.90 there is no debugFocus API - 
         * we can not track current stack frame. It is very convenient,
         * because single event refreshes state and also we keep track
         * of stack frame selected in debugger view.
         * 
         * For older versions we use event based implementation -
         * subscribe to debugger events and filter out needed:
         * continue execution, stopped (breakpoint), terminated etc...
         * 
         * NOTES:
         *  - We can not track current stack frame, so this feature is
         *    not available for users.
         *  - Support only 'cppdbg' configuration - tested only for it
         */

        const provider = this;
        let savedThreadId: undefined | number = undefined;
        const disposable = vscode.debug.registerDebugAdapterTrackerFactory('cppdbg', {
            createDebugAdapterTracker(_: vscode.DebugSession) {
                return {
                    onDidSendMessage(message: dap.ProtocolMessage) {
                        if (message.type === 'response') {
                            if (message.command === 'continue') {
                                /* 
                                 * `Continue' command - clear
                                 */
                                provider.refresh();
                            }

                            return;
                        }

                        if (message.type === 'event') {
                            if (message.event === 'stopped' || message.event === 'terminated') {
                                /* 
                                 * Hit breakpoint - show variables
                                 */
                                provider.refresh();
                                savedThreadId = message.body?.threadId as number | undefined;
                            }
                        }
                    },

                    onWillStopSession() {
                        /* Debug session terminates - clear */
                        provider.refresh();
                    },
                }
            },
        });
        context.subscriptions.push(disposable);
        this.getCurrentFrameId = async (debug: utils.IDebuggerFacade) => {
            /* 
             * We can not track selected stack frame - return last (top)
             */
            if (!(debug.isInDebug && savedThreadId)) {
                return;
            }

            return await debug.getTopStackFrameId(savedThreadId);
        }
    }
}

export async function dumpVariableToLogCommand(args: any, log: utils.ILogger,
    debug: utils.IDebuggerFacade) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }

    const variable = args.variable;
    if (!variable?.value) {
        log.warn('Variable info not present in args');
        return;
    }

    console.assert(typeof variable.value === 'string');

    if (!(utils.isValidPointer(variable.value))) {
        vscode.window.showWarningMessage(`Variable ${variable.name} is not valid pointer`);
        return;
    }

    /* Simple `pprint(Node*)' function call */
    const expression = `-exec call pprint((const void *) ${variable.value})`;

    try {
        await debug.evaluate(expression, undefined);
    } catch (err: any) {
        log.error('could not dump variable %s to log', variable.name, err);
        vscode.window.showErrorMessage(`Could not dump variable ${variable.name}. `
                                     + `See errors in Output log`)
    }
}

class ConfigFileParseResult {
    /* Array special members */
    arrayInfos?: vars.ArraySpecialMemberInfo[];
    /* Information about type aliases */
    aliasInfos?: vars.AliasInfo[];
    /* Path to custom typedef's file */
    typedefs?: string;
}

function parseConfigurationFile(configFile: any): ConfigFileParseResult | undefined {
    if (!configFile === undefined) {
        return;
    }

    if (typeof configFile !== 'object') {
        return;
    }

    const parseArraySm1 = (obj: any): vars.ArraySpecialMemberInfo => {
        let nodeTag = obj.nodeTag;
        if (!nodeTag) {
            throw new Error("nodeTag field not provided");
        }

        if (typeof nodeTag !== 'string') {
            throw new Error(`nodeTag type must be string, given: ${typeof nodeTag}`);
        }

        nodeTag = nodeTag.trim().replace('T_', '');

        /* NodeTag used also as type name, so it must be valid identifier */
        if (!utils.isValidIdentifier(nodeTag)) {
            throw new Error(`nodeTag must be valid identifier. given: ${obj.nodeTag}`);
        }

        let memberName = obj.memberName;
        if (!memberName) {
            throw new Error(`memberName field not provided for type with NodeTag: ${obj.nodeTag}`);
        }

        if (typeof memberName !== 'string') {
            throw new Error(`memberName field must be string for type with NodeTag: ${obj.nodeTag}`);
        }

        memberName = memberName.trim();
        if (!utils.isValidIdentifier(memberName)) {
            throw new Error(`memberName field ${memberName} is not valid identifier`);
        }

        let lengthExpr = obj.lengthExpression;
        if (!lengthExpr) {
            throw new Error(`lengthExpression not provided for: ${obj.nodeTag}->${memberName}`);
        }

        if (typeof lengthExpr !== 'string') {
            throw new Error(`lengthExpression field must be string for: ${obj.nodeTag}->${memberName}`);
        }

        lengthExpr = lengthExpr.trim();
        if (!lengthExpr) {
            throw new Error('lengthExpression can not be empty string');
        }
        return {
            typeName: nodeTag,
            memberName,
            lengthExpr,
        }
    }

    const parseArraySm2 = (obj: any): vars.ArraySpecialMemberInfo => {
        let typeName = obj.typeName;
        if (!typeName) {
            throw new Error("typeName field not provided");
        }

        if (typeof typeName !== 'string') {
            throw new Error(`typeName type must be string, given: ${typeof typeName}`);
        }

        typeName = typeName.trim();

        /* NodeTag used also as type name, so it must be valid identifier */
        if (!utils.isValidIdentifier(typeName)) {
            throw new Error(`typeName must be valid identifier. given: ${typeName}`);
        }

        let memberName = obj.memberName;
        if (!memberName) {
            throw new Error(`memberName field not provided for type: ${typeName}`);
        }

        if (typeof memberName !== 'string') {
            throw new Error(`memberName field must be string for type: ${typeName}`);
        }

        memberName = memberName.trim();
        if (!utils.isValidIdentifier(memberName)) {
            throw new Error(`memberName field ${memberName} is not valid identifier`)
        }

        let lengthExpr = obj.lengthExpression;
        if (!lengthExpr) {
            throw new Error(`lengthExpression not provided for: ${typeName}->${memberName}`);
        }

        if (typeof lengthExpr !== 'string') {
            throw new Error(`lengthExpression field must be string for: ${typeName}->${memberName}`);
        }

        lengthExpr = lengthExpr.trim();
        if (!lengthExpr) {
            throw new Error('lengthExpression can not be empty string');
        }
        return {
            typeName,
            memberName,
            lengthExpr,
        }
    }

    const configVersion = Number(configFile.version);
    if (Number.isNaN(configVersion) ||
        !(configVersion === 1 || configVersion === 2 || configVersion === 3)) {
        throw new Error(`unknown version of config file: ${configFile.version}`);
    }

    const parseAliasV2 = (obj: any): vars.AliasInfo => {
        if (typeof obj !== 'object') {
            throw new Error(`AliasInfo object must be object type. given: ${typeof obj}`);
        }

        if (!(obj.alias && typeof obj.alias === 'string')) {
            throw new Error(`"alias" field must be string. given: ${typeof obj.alias}`);
        }

        const alias = obj.alias.trim();
        if (!alias) {
            throw new Error(`"alias" field must not be empty`);
        }

        if (!(obj.type && typeof obj.type === 'string')) {
            throw new Error(`"type" field must be string. given: ${typeof obj.type}`);
        }

        const type = obj.type.trim();
        if (!type) {
            throw new Error(`"type" field must not be empty`);
        }

        return {
            alias,
            type,
        }
    }

    const parseTypedefs = (obj: any): string | undefined => {
        if (!obj) {
            return undefined;
        }
        
        if (typeof obj !== 'string') {
            throw new Error('"typedefs" field must be string');
        }

        return (obj as string).trim();
    }

    const arrayMemberParser = configVersion == 1
        ? parseArraySm1
        : parseArraySm2;

    const arrayInfos = Array.isArray(configFile.specialMembers?.array)
        && configFile.specialMembers.array.length > 0
        ? configFile.specialMembers.array.map(arrayMemberParser)
        : undefined;

    const aliasInfos = configVersion >= 2
        && Array.isArray(configFile.aliases)
        && configFile.aliases.length > 0
        ? configFile.aliases.map(parseAliasV2)
        : undefined;

    const typedefs = configVersion >= 3
        ? parseTypedefs(configFile.typedefs)
        : undefined;

    return {
        arrayInfos,
        aliasInfos,
        typedefs
    }
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
                            placeHolder: vscode.workspace.workspaceFolders[0].name
                        });
    if (!name) {
        throw new Error('No workspaces chosen');
    }

    return vscode.workspace.workspaceFolders.find(wf => wf.name === name)!;
}

async function promptExtensionName() {
    const extensionName = await vscode.window.showInputBox({
        prompt: 'Enter extension name'
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
            'Yes', 'No'
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
    }
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
        ''
    );

    await bootstrapFile('Makefile', makefile);

    const control = [
        `# ${name} extension`,
        "default_version = '0.1.0'"
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
        flags.comment
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
            ''
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
                'LANGUAGE C IMMUTABLE;'
            );
        } else {
            sql.push(
                'AS $$',
                '\tSELECT \'hello, world!\';',
                '$$ LANGUAGE SQL IMMUTABLE;'
            );
        }

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
                    'SELECT hello_world() as text;'
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
                    ? `$node->append_conf(\'postgresql.conf\', qq{shared_preload_libraries=\'${name}\'});` 
                    : '',
                '$node->start;',
                '',
                `$node->safe_psql('postgres', q(CREATE EXTENSION ${name}));`,
                "my $out = $node->safe_psql('postgres', 'SELECT hello_world();');",
                "is($out, 'hello, world!', 'Unexpected string');",
                '',
                'done_testing();',
                '',
            ].join('\n')
        );
    }

    const td = await vscode.workspace.openTextDocument(utils.joinPath(path, 'Makefile'));
    await vscode.window.showTextDocument(td);
}

function addElogErrorBreakpoint() {
    /* 
     * Check that such breakpoint already exists, otherwise
     * it will be added again on new extension activation
     */
    if (vscode.debug.breakpoints
                    .find(bp => bp instanceof vscode.FunctionBreakpoint &&
                                bp.functionName === 'errstart')) {
        return;
    }

    /* Breakpoint on `elog' or `ereport' with ERROR or greater */
    vscode.debug.addBreakpoints([
        new vscode.FunctionBreakpoint(
            'errstart',
            false,
            'ERROR <= elevel',
        )
    ]);
}

export function setupExtension(context: vscode.ExtensionContext, specialMembers: vars.SpecialMemberRegistry,
                               nodeVars: vars.NodeVarRegistry, debug: utils.IDebuggerFacade,
                               logger: utils.ILogger, nodesView: NodePreviewTreeViewProvider) {

    function registerCommand(name: string, command: (...args: any[]) => void) {
        const disposable = vscode.commands.registerCommand(name, command);
        context.subscriptions.push(disposable);
    }

    const processSingleConfigFile = async (pathToFile: vscode.Uri) => {
        let doc = undefined;
        try {
            doc = await vscode.workspace.openTextDocument(pathToFile);
        } catch (err: any) {
            logger.error('failed to read settings file %s', pathToFile, err);
            return;
        }

        let text;
        try {
            text = doc.getText();
        } catch (err: any) {
            logger.error('failed to read settings file %s', doc.uri.fsPath, err);
            return;
        }

        if (text.length === 0) {
            /* JSON file can be used as activation event */
            logger.debug('JSON settings file %s is empty', doc.uri.fsPath);
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (err: any) {
            logger.error('failed to parse JSON settings file %s', doc.uri.fsPath, err);
            return;
        }

        let parseResult: ConfigFileParseResult | undefined;
        try {
            parseResult = parseConfigurationFile(data);
        } catch (err: any) {
            logger.error('failed to parse JSON settings file %s', doc.uri.fsPath, err);
            return;
        }

        if (parseResult) {
            if (parseResult.arrayInfos?.length) {
                logger.debug('adding %i array special members from config file', parseResult.arrayInfos.length);
                specialMembers.addArraySpecialMembers(parseResult.arrayInfos);
            }
            if (parseResult.aliasInfos?.length) {
                logger.debug('adding %i aliases from config file', parseResult.aliasInfos.length);
                nodeVars.addAliases(parseResult.aliasInfos);
            }
            if (parseResult.typedefs) {
                let typedefs: vscode.Uri;
                if (path.isAbsolute(parseResult.typedefs)) {
                    typedefs = vscode.Uri.file(parseResult.typedefs);
                } else {
                    const workspace = vscode.workspace.getWorkspaceFolder(pathToFile);
                    if (!workspace) {
                        logger.error('failed to determine workspace folder for configuration file %s', pathToFile.fsPath);
                        return;
                    }

                    typedefs = utils.getWorkspacePgSrcFile(workspace.uri, parseResult.typedefs);
                }

                if (await utils.fileExists(typedefs)) {
                    Configuration.CustomTypedefsFile = typedefs;
                } else {
                    vscode.window.showErrorMessage(`typedefs file ${parseResult.typedefs} does not exist`);
                }
            }
        }
    }

    const refreshConfigurationFromFolders = async (folders: readonly vscode.WorkspaceFolder[]) => {
        for (const folder of folders) {
            const pathToFile = utils.joinPath(
                folder.uri,
                '.vscode',
                Configuration.ExtensionSettingsFileName);
            if (await utils.fileExists(pathToFile)) {
                await processSingleConfigFile(pathToFile);
            } else {
                logger.debug('config file %s does not exist', pathToFile.fsPath);
            }
        }
    }

    /* Refresh config files when debug session starts */
    vscode.debug.onDidStartDebugSession(async _ => {
        if (vscode.workspace.workspaceFolders?.length) {
            logger.info('refreshing configuration files due to debug session start')
            await refreshConfigurationFromFolders(vscode.workspace.workspaceFolders);
        }
    }, undefined, context.subscriptions);

    /* Register command to dump variable to log */
    const pprintVarToLogCmd = async (args: any) => {
        try {
            await dumpVariableToLogCommand(args, logger, debug);
        } catch (err: any) {
            logger.error('error while dumping node to log', err);
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
                            version: 3,
                            specialMembers: {
                                array: []
                            },
                            aliases: []
                        },
                        undefined, '    '));
                } catch (err: any) {
                    logger.error('Could not write default configuration file', err);
                    vscode.window.showErrorMessage('Error creating configuration file');
                    return;
                }
            }

            let doc;
            try {
                doc = await vscode.workspace.openTextDocument(configFilePath);
            } catch (err: any) {
                logger.error('failed to open configuration file', err);
                return;
            }

            try {
                await vscode.window.showTextDocument(doc);
            } catch (err: any) {
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
    }

    /* Refresh config file command register */
    const refreshConfigCmd = async () => {
        if (!vscode.workspace.workspaceFolders?.length) {
            return;
        }

        logger.info('refreshing config file due to command execution');
        for (const folder of vscode.workspace.workspaceFolders) {
            const configFilePath = utils.joinPath(
                folder.uri,
                '.vscode',
                Configuration.ExtensionSettingsFileName);
            if (!await utils.fileExists(configFilePath)) {
                const answer = await vscode.window.showWarningMessage(
                    'Config file does not exist. Create?',
                    'Yes', 'No');
                if (answer !== 'Yes') {
                    return;
                }

                await vscode.commands.executeCommand(Configuration.Commands.OpenConfigFile);
                return;
            }

            try {
                await processSingleConfigFile(configFilePath);
            } catch (err: any) {
                logger.error('failed to update config file', err);
            }
        }
    };

    const refreshVariablesCommand = () => {
        logger.info('refreshing variables view due to command')
        nodesView.refresh();
    };

    registerCommand(Configuration.Commands.RefreshConfigFile, refreshConfigCmd);
    registerCommand(Configuration.Commands.OpenConfigFile, openConfigFileCmd);
    registerCommand(Configuration.Commands.DumpNodeToLog, pprintVarToLogCmd);
    registerCommand(Configuration.Commands.RefreshPostgresVariables, refreshVariablesCommand);
    registerCommand(Configuration.Commands.BootstrapExtension, bootstrapExtensionCmd);

    /* Process config files immediately */
    if (vscode.workspace.workspaceFolders) {
        refreshConfigurationFromFolders(vscode.workspace.workspaceFolders);
    } else {
        let disposable: vscode.Disposable | undefined;
        /* Wait for folder open */
        disposable = vscode.workspace.onDidChangeWorkspaceFolders(e => {
            refreshConfigurationFromFolders(e.added);

            /*
             * Run only once, otherwise multiple commands will be registered - 
             * it will spoil up everything
            */
            disposable?.dispose();
        }, context.subscriptions);
    }

    /* Read files with NodeTags */
    setupNodeTagFiles(logger, nodeVars, context);
    addElogErrorBreakpoint();
}

async function setupNodeTagFiles(log: utils.ILogger, nodeVars: vars.NodeVarRegistry,
    context: vscode.ExtensionContext): Promise<undefined> {

    const getNodeTagFiles = () => {
        const customNodeTagFiles = Configuration.getCustomNodeTagFiles();
        if (customNodeTagFiles?.length) {
            return customNodeTagFiles;
        }

        return [
            utils.getPgSrcFile('src', 'include', 'nodes', 'nodes.h'),
            utils.getPgSrcFile('src', 'include', 'nodes', 'nodetags.h'),
        ]
    }
    
    const handleNodeTagFile = async (path: vscode.Uri) => {
        if (!await utils.fileExists(path)) {
            return;
        }

        log.debug('processing %s NodeTags file', path.fsPath);
        const document = await vscode.workspace.openTextDocument(path);
        try {
            const added = nodeVars.updateNodeTypesFromFile(document);
            log.debug('added %i NodeTags from %s file', added, path.fsPath);
        } catch (err: any) {
            log.error('could not initialize node tags array', err);
        }
    }

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
                log.info('detected change in NodeTag file: %s', uri);
                await handleNodeTagFile(uri);
            }, context.subscriptions);
            watcher.onDidCreate(async uri => {
                log.info('detected creation of NodeTag file: %s', uri);
                await handleNodeTagFile(uri);
            }, context.subscriptions);
    
            context.subscriptions.push(watcher);
        }
    }

    if (vscode.workspace.workspaceFolders?.length) {
        await Promise.all(
            vscode.workspace.workspaceFolders.map(async folder =>
                await setupSingleFolder(folder)
            )
        );
    }

    vscode.workspace.onDidChangeWorkspaceFolders(async e => {
        for (let i = 0; i < e.added.length; i++) {
            const folder = e.added[i];
            await setupSingleFolder(folder);
        }
    }, undefined, context.subscriptions);
}

export function getCurrentLogLevel() {
    const configValue = Configuration.getLogLevel();
    switch (configValue) {
        case 'INFO':
            return utils.LogLevel.Info;
        case 'DEBUG':
            return utils.LogLevel.Debug;
        case 'WARNING':
            return utils.LogLevel.Warn;
        case 'ERROR':
            return utils.LogLevel.Error;
        case 'DISABLE':
            return utils.LogLevel.Disable;
        default:
            return utils.LogLevel.Info;
    }
}

export class Configuration {
    static ExtensionName = 'postgresql-hacker-helper';
    static ExtensionPrettyName = 'PostgreSQL Hacker Helper';
    static ConfigSections = {
        TopLevelSection: this.ExtensionName,
        NodeTagFiles: 'nodeTagFiles',
        LogLevel: 'logLevel',
        PgbsdindentPath: 'pg_bsd_indentPath',
        SrcPath: 'srcPath'
    };
    static Commands = {
        DumpNodeToLog: `${this.ExtensionName}.dumpNodeToLog`,
        OpenConfigFile: `${this.ExtensionName}.openConfigurationFile`,
        RefreshPostgresVariables: `${this.ExtensionName}.refreshPostgresVariablesView`,
        RefreshConfigFile: `${this.ExtensionName}.refreshConfigFile`,
        FormatterDiffView: `${this.ExtensionName}.formatterShowDiff`,
        BootstrapExtension: `${this.ExtensionName}.bootstrapExtension`,
    };
    static Views = {
        NodePreviewTreeView: `${this.ExtensionName}.node-tree-view`,
    };
    static ExtensionSettingsFileName = 'pgsql_hacker_helper.json';
    /* Path to custom typedefs file in pgsql_hacker_helper.json file */
    static CustomTypedefsFile: vscode.Uri | undefined = undefined;

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
        const topLevelSection = this.ConfigSections.TopLevelSection
        const config = vscode.workspace.getConfiguration(topLevelSection);
        return config.get<T>(section);
    };
    static getFullConfigSection(section: string) {
        return `${this.ConfigSections.TopLevelSection}.${section}`;
    }
    static setExtensionActive(status: boolean) {
        const context = `${this.ExtensionName}:activated`;
        vscode.commands.executeCommand('setContext', context, status);
    }
}