import * as vscode from 'vscode';
import * as utils from './utils';
import * as vars from './variables';
import * as fs from 'fs';

export class NodePreviewTreeViewProvider implements vscode.TreeDataProvider<vars.Variable> {
    constructor(
        private log: utils.ILogger,
        private context: vars.ExecContext) {
    }

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

        return this.context.specialMemberRegistry.getArraySpecialMember(variable.parent.type, variable.name)
    }

    async getTreeItem(variable: vars.Variable) {
        return variable.getTreeItem();
    }

    async getChildren(element?: vars.Variable | undefined) {
        if (!this.context.debug.isInDebug) {
            return;
        }

        return element
            ? await element.getChildren(this.context)
            : await this.getTopLevelVariables();
    }

    async getTopLevelVariables() {
        const frame = vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined;
        if (!frame || !frame.frameId) {
            return;
        }

        const scopes = await this.context.debug.getScopes(frame.frameId);
        const variables = (await Promise.all(scopes
            .filter(s => s.presentationHint === 'locals' || s.presentationHint === 'arguments')
            .map(s => vars.Variable.getVariables(s.variablesReference, frame.frameId, this.context, this.log, undefined))));
        return variables.filter(x => x !== undefined).flatMap(x => x);
    }
}

export async function dumpVariableToLogCommand(args: any, log: utils.ILogger, debug: utils.IDebuggerFacade) {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
        vscode.window.showWarningMessage('Can not dump variable - no active debug session!');
        return;
    }

    const variable = args.variable;
    if (!variable) {
        log.info('Variable info not present in args');
        return;
    }

    const frameId = (vscode.debug.activeStackItem as vscode.DebugStackFrame | undefined)?.frameId;
    if (frameId === undefined) {
        log.info('Could not find active stack frame');
        return;
    }

    try {
        /* Simple `pprint(Node*) call, just like in gdb */
        await debug.evaluate(`-exec call pprint(${variable.evaluateName})`, frameId);
    } catch (err: any) {
        log.error(`could not dump variable ${variable.name} to log`, err);
    }
}

class ConfigFileParseResult {
    arrayInfos?: vars.ArraySpecialMemberInfo[];
    aliasInfos?: vars.AliasInfo[];
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

        let lengthExpression = obj.lengthExpression;
        if (!lengthExpression) {
            throw new Error(`lengthExpression not provided for: ${obj.nodeTag}->${memberName}`);
        }

        if (typeof lengthExpression !== 'string') {
            throw new Error(`lengthExpression field must be string for: ${obj.nodeTag}->${memberName}`);
        }

        lengthExpression = lengthExpression.trim();
        if (!lengthExpression) {
            throw new Error('lengthExpression can not be empty string');
        }
        return {
            typeName: nodeTag,
            memberName,
            lengthExpression
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

        let lengthExpression = obj.lengthExpression;
        if (!lengthExpression) {
            throw new Error(`lengthExpression not provided for: ${typeName}->${memberName}`);
        }

        if (typeof lengthExpression !== 'string') {
            throw new Error(`lengthExpression field must be string for: ${typeName}->${memberName}`);
        }

        lengthExpression = lengthExpression.trim();
        if (!lengthExpression) {
            throw new Error('lengthExpression can not be empty string');
        }
        return {
            typeName,
            memberName,
            lengthExpression
        }
    }

    const configVersion = Number(configFile.version);
    if (Number.isNaN(configVersion) || !(configVersion == 1 || configVersion == 2)) {
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

    const arrayMemberParser = configVersion == 1
        ? parseArraySm1
        : parseArraySm2;

    const arrayInfos = Array.isArray(configFile.specialMembers?.array) && configFile.specialMembers.array.length > 0
        ? configFile.specialMembers.array.forEach(arrayMemberParser)
        : undefined;
 
    const aliasInfos = configVersion == 2 && Array.isArray(configFile.aliases) && configFile.aliases.length > 0
        ? configFile.aliases.map(parseAliasV2)
        : undefined;

    return {
        arrayInfos,
        aliasInfos,
    }
}

export function setupConfigFiles(execCtx: vars.ExecContext, log: utils.ILogger, context: vscode.ExtensionContext) {
    const processSingleConfigFile = async (pathToFile: vscode.Uri) => {
        let doc = undefined;
        try {
            doc = await vscode.workspace.openTextDocument(pathToFile);
        } catch (err: any) {
            log.error(`failed to read settings file ${pathToFile.fsPath}`, err);
            return;
        }

        let text;
        try {
            text = doc.getText();
        } catch (err: any) {
            log.error(`failed to read settings file ${doc.uri.fsPath}`, err);
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (err: any) {
            log.error(`failed to parse JSON settings file ${doc.uri.fsPath}`, err);
            return;
        }

        let parseResult: ConfigFileParseResult | undefined;
        try {
            parseResult = parseConfigurationFile(data);
        } catch (err: any) {
            log.error(`failed to parse JSON settings file ${doc.uri.fsPath}`, err);
            return;
        }

        if (parseResult) {
            if (parseResult.arrayInfos?.length) {
                log.debug(`adding ${parseResult.arrayInfos.length} array special members from config file`);
                execCtx.specialMemberRegistry.addArraySpecialMembers(parseResult.arrayInfos);
            }
            if (parseResult.aliasInfos?.length) {
                log.debug(`adding ${parseResult.aliasInfos.length} aliases from config file`);
                execCtx.nodeVarRegistry.addAliases(parseResult.aliasInfos);
            }
        }
    }

    const processFolders = (folders: readonly vscode.WorkspaceFolder[]) => {
        const propertiesFilePath = vscode.Uri.joinPath(folders[0].uri, '.vscode', Configuration.ExtensionSettingsFileName);
        context.subscriptions.push(vscode.commands.registerCommand(Configuration.Commands.OpenConfigFile, async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showInformationMessage('No workspaces found - open directory first');
                return;
            }

            const propertiesFileExists = await utils.fileExists(propertiesFilePath);
            /* Create default configuration file if not exists */
            if (!propertiesFileExists) {
                if (await utils.fsEntryExists(propertiesFilePath)) {
                    vscode.window.showErrorMessage(`Can not create ${Configuration.ExtensionSettingsFileName} - fs entry exists and not file`);
                    return;
                }

                log.debug(`creating ${propertiesFilePath} configuration file`);
                const configDirectoryPath = vscode.Uri.joinPath(propertiesFilePath, '..');
                if (!await utils.directoryExists(configDirectoryPath)) {
                    try {
                        fs.mkdirSync(configDirectoryPath.fsPath);
                    } catch (err) {
                        log.error(`failed to create config directory`, err);
                        return;
                    }
                }

                try {
                    fs.writeFileSync(propertiesFilePath.fsPath, JSON.stringify({
                        version: 2,
                        specialMembers: {
                            array: []
                        }
                    }, undefined, '    '));
                } catch (err: any) {
                    log.error(`Could not write default configuration file`, err);
                    vscode.window.showErrorMessage('Error creating configuration file');
                    return;
                }
            }

            let doc;
            try {
                doc = await vscode.workspace.openTextDocument(propertiesFilePath)
            } catch (err: any) {
                log.error(`failed to open configuration file`, err);
                return;
            }

            try {
                await vscode.window.showTextDocument(doc);
            } catch (err: any) {
                log.error(`failed to show configuration file`, err);
                return;
            }
        }));

        folders.forEach(folder => {
            const pathToFile = vscode.Uri.joinPath(folder.uri, '.vscode', Configuration.ExtensionSettingsFileName);
            utils.fileExists(pathToFile).then(async exists => {
                /* 
                 * Track change and create events, but not delete -
                 * currently no mechanism to track deltas in files.
                 */
                let trackCreateEvent = true;
                if (exists) {
                    trackCreateEvent = false;
                    await processSingleConfigFile(pathToFile);
                    return;
                }

                const watcher = vscode.workspace.createFileSystemWatcher(pathToFile.fsPath, trackCreateEvent, false, true);
                if (trackCreateEvent) {
                    watcher.onDidCreate(processSingleConfigFile);
                }
                watcher.onDidChange(processSingleConfigFile);

                context.subscriptions.push(watcher);
            }, () => log.debug(`settings file ${pathToFile.fsPath} does not exist`));
        });

        /* Refresh config file command register */
        const refreshConfigCmdDisposable = vscode.commands.registerCommand(Configuration.Commands.RefreshConfigFile, async () => {
            if (!vscode.workspace.workspaceFolders?.length) {
                return;
            }

            log.info(`refreshing config file due to command execution`);
            for (const folder of vscode.workspace.workspaceFolders) {
                const propertiesFilePath = vscode.Uri.joinPath(folder.uri, '.vscode', Configuration.ExtensionSettingsFileName);
                if (!await utils.fileExists(propertiesFilePath)) {
                    const answer = await vscode.window.showWarningMessage(`Config file does not exist. Create?`, 'Yes', 'No');
                    if (answer !== 'Yes') {
                        return;
                    }

                    await vscode.commands.executeCommand(Configuration.Commands.OpenConfigFile);
                    return;
                }

                try {
                    await processSingleConfigFile(propertiesFilePath);
                } catch (err: any) {
                    log.error(`failed to update config file`, err);
                }
            }
        });

        context.subscriptions.push(refreshConfigCmdDisposable);

    }

    /* Command to create configuration file */
    if (vscode.workspace.workspaceFolders) {
        processFolders(vscode.workspace.workspaceFolders);
    } else {
        let disposable: vscode.Disposable | undefined;
        /* Wait for folder open */
        disposable = vscode.workspace.onDidChangeWorkspaceFolders(e => {
            processFolders(e.added);
            /* 
             * Run only once, otherwise multiple commands will be registered - 
             * it will spoil up everything
            */
            disposable?.dispose();
        }, context.subscriptions);
    }
}

export class Configuration {
    static ExtensionName = 'postgresql-hacker-helper';
    static ExtensionPrettyName = 'PostgreSQL Hacker Helper';
    static ConfigSections = {
        TopLevelSection: `${this.ExtensionName}`,
        NodeTagFiles: 'nodeTagFiles',
        LogLevel: 'logLevel',
        fullSection: (section: string) => `${this.ExtensionName}.${section}`,
    };
    static Commands = {
        DumpNodeToLog: `${this.ExtensionName}.dumpNodeToLog`,
        OpenConfigFile: `${this.ExtensionName}.openConfigurationFile`,
        RefreshPostgresVariables: `${this.ExtensionName}.refreshPostgresVariablesView`,
        RefreshConfigFile: `${this.ExtensionName}.refreshConfigFile`,
    };
    static Views = {
        NodePreviewTreeView: `${this.ExtensionName}.node-tree-view`,
    };
    static ExtensionSettingsFileName = 'pgsql_hacker_helper.json';
    static Contexts = {
        ExtensionActivated: `${this.ExtensionName}:activated`
    }
}