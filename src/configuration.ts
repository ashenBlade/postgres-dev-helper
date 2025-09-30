import * as vscode from 'vscode';
import * as path from 'path';

import * as vars from './variables';
import * as utils from './utils';
import * as dbg from './debugger';
import { Log as logger } from './logger';
import { PghhError } from './error';

export interface VariablesConfiguration {
    /* Array special members */
    arrays?: vars.ArraySpecialMemberInfo[];
    /* Information about type aliases */
    aliases?: vars.AliasInfo[];
    /* Custom List types */
    customListTypes?: vars.ListPtrSpecialMemberInfo[];   
    /* Types stored in HTABs */
    htab?: vars.HtabEntryInfo[];
    /* Types for simple hash */
    simplehash?: vars.SimplehashEntryInfo[];
    /* Enum values for integer fields */
    enums?: vars.BitmaskMemberInfo[];
    /* Extra NodeTags */
    nodetags?: string[];
}

export interface FormatterConfiguration {
    typedefs?: string[];
}

/* Schema of configuration file */
interface ConfigurationFile {
    arrays: vars.ArraySpecialMemberInfo[] | undefined;
    aliases: vars.AliasInfo[] | undefined;
    customListTypes: vars.ListPtrSpecialMemberInfo[] | undefined;
    htab: vars.HtabEntryInfo[] | undefined;
    simplehash: vars.SimplehashEntryInfo[] | undefined;
    enums: vars.BitmaskMemberInfo[] | undefined;
    nodetags: string[] | undefined;
    typedefs: string[] | undefined;
}

function isStringTuple(o: unknown): o is [string, string] {
    return    Array.isArray(o) && o.length === 2
            && typeof o[0] === 'string' && o[0].length > 0
            && typeof o[1] === 'string' && o[1].length > 0;
};


function normalizeFuncName(name: string) {
    /*
     * Earlier extension versions used .solib prefix in function name
     * that cppdbg added, but after adding support for CodeLLDB we
     * have to generalize things.
     * This part is just to keep at least some kind of compatibility.
     */
    const argsIndex = name.indexOf('(');
    if (argsIndex !== -1) {
        name = name.substring(0, argsIndex);
    }
    
    const shlibIndex = name.indexOf('!');
    if (shlibIndex !== -1) {
        name = name.substring(shlibIndex + 1);
    }
    
    return name;
};

function parseConfiguration(contents: unknown): ConfigurationFile | undefined {
    const parseArrayMember = (obj: unknown): vars.ArraySpecialMemberInfo | undefined => {
        /* 
         * {
         *     "typeName": "parentType",
         *     "memberName": "memberOfParent",
         *     "lengthExpr": "expression to get length"
         * }
         */
        if (!(typeof obj === 'object' && obj)) {
            return;
        }

        let typeName;
        if ('typeName' in obj) {
            typeName = obj.typeName;
            if (!typeName) {
                vscode.window.showErrorMessage('"typeName" field not provided');
                return;
            }
    
            if (typeof typeName !== 'string') {
                vscode.window.showErrorMessage(`"typeName" type must be string, given: ${typeof typeName}`);
                return;
            }
            typeName = typeName.trim();

            /* NodeTag used also as type name, so it must be valid identifier */
            if (!dbg.isValidIdentifier(typeName)) {
                vscode.window.showErrorMessage(`typeName must be valid identifier. given: ${typeName}`);
                return;
            }
        }


        let memberName;
        if ('memberName' in obj) {
            memberName = obj.memberName;
            if (!memberName) {
                vscode.window.showErrorMessage(`memberName field not provided for type: ${typeName}`);
                return;
            }
    
            if (typeof memberName !== 'string') {
                vscode.window.showErrorMessage(`memberName field must be string for type: ${typeName}`);
                return;
            }
    
            memberName = memberName.trim();
            if (!dbg.isValidIdentifier(memberName)) {
                vscode.window.showErrorMessage(`memberName field ${memberName} is not valid identifier`);
                return;
            }
        }

        let lengthExpression;
        if ('lengthExpression' in obj) {
            lengthExpression = obj.lengthExpression;
            if (!lengthExpression) {
                vscode.window.showErrorMessage(`lengthExpression not provided for: ${typeName}->${memberName}`);
                return;
            }
    
            if (typeof lengthExpression !== 'string') {
                vscode.window.showErrorMessage(`lengthExpression field must be string for: ${typeName}->${memberName}`);
                return;
            }
    
            lengthExpression = lengthExpression.trim();
            if (!lengthExpression.length) {
                vscode.window.showErrorMessage('lengthExpression can not be empty string');
                return;
            }
        }

        if (typeName && memberName && lengthExpression) {
            return {
                typeName,
                memberName,
                lengthExpression,
            };
        }
    };

    const parseSingleAlias = (obj: unknown): vars.AliasInfo | undefined => {
        /* 
         * {
         *     "alias": "name of alias",
         *     "type": "real type"
         * }
         */
        if (!(typeof obj === 'object' && obj)) {
            return;
        }

        let alias;
        if ('alias' in obj) {
            alias = obj.alias;
            if (!(typeof alias === 'string' && alias.length)) {
                vscode.window.showErrorMessage(`"alias" field must be string. given: ${typeof obj.alias}`);
                return;
            }
    
            alias = alias.trim();
            if (!alias) {
                vscode.window.showErrorMessage(`"alias" field must not be empty`);
                return;
            }
        }
        
        let type;
        if ('type' in obj) {
            type = obj.type;
            if (!(typeof type === 'string' && type.length)) {
                vscode.window.showErrorMessage(`"type" field must be string. given: ${typeof obj.type}`);
                return;
            }
            type = type.trim();
            if (!type) {
                vscode.window.showErrorMessage(`"type" field must not be empty`);
                return;
            }
        }

        if (alias && type) {
            return {
                alias,
                type,
            };
        }
    };

    const parseListTypes = (obj: unknown): vars.ListPtrSpecialMemberInfo[] | undefined => {
        /* 
         * [
         *     {
         *         "type": "string",
         *         "parent": "string",
         *         "member": "string",
         *     }
         * 
         *     or (old version)
         * 
         *     {
         *         "type": "string",
         *         "member": ["string", "string"],
         *         "variable": ["string", "string"]
         *     }
         * ]
         */
        if (!Array.isArray(obj)) {
            return;
        }
        
        /* Old version just for compatibility */
        const tryParseOldVersion = (o: unknown): vars.ListPtrSpecialMemberInfo | undefined => {
            if (!(typeof o === 'object' && o)) {
                return;
            }

            if (!('type' in o && typeof o.type === 'string' && o.type.length)) {
                return;
            }
            
            if ('member' in o && isStringTuple(o.member)) {
                return {
                    type: o.type,
                    parent: o.member[0],
                    member: o.member[1],
                };
            }
            
            if ('variable' in o && isStringTuple(o.variable)) {
                return {
                    type: o.type,
                    parent: o.variable[0],
                    member: o.variable[1],
                };
            }
        };
        
        const tryParse = (o: unknown): vars.ListPtrSpecialMemberInfo | undefined => {
            if (!(typeof o === 'object' && o)) {
                return;
            }

            if (!('type' in o && typeof o.type === 'string' && o.type.length)) {
                return;
            }
            
            if (!('member' in o && typeof o.member === 'string' && o.member.length)) {
                return;
            }

            if (!('parent' in o && typeof o.parent === 'string' && o.parent.length)) {
                return;
            }
            
            return {
                type: o.type,
                parent: o.parent,
                member: o.member,
            };
        };

        const elements: vars.ListPtrSpecialMemberInfo[] = [];
        for (const o of obj) {
            const record = tryParse(o) ?? tryParseOldVersion(o);
            if (record) {
                record.parent = normalizeFuncName(record.parent);
                elements.push(record);
            }
        }

        return elements;
    };

    const parseHtabTypes = (obj: unknown): vars.HtabEntryInfo[] | undefined => {
        /*
         * [
         *     {
         *         "type": "string",
         *         "parent": "string",
         *         "member": "string"
         *     }
         * 
         *     or old version
         * 
         *     {
         *         "type": "string",
         *         "member": ["string", "string"],
         *         "variable": ["string", "string"]
         *     }
         * ]
         */
        if (!Array.isArray(obj)) {
            return;
        }
        
        /* Old version just for compatibility */
        const tryParseOldVersion = (o: unknown): vars.HtabEntryInfo | undefined => {
            if (!(typeof o === 'object' && o)) {
                return;
            }

            if (!('type' in o && typeof o.type === 'string' && o.type.length)) {
                return;
            }
            
            if ('member' in o && isStringTuple(o.member)) {
                return {
                    type: o.type,
                    parent: o.member[0],
                    member: o.member[1],
                };
            }
            
            if ('variable' in o && isStringTuple(o.variable)) {
                return {
                    type: o.type,
                    parent: o.variable[0],
                    member: o.variable[1],
                };
            }
        };
        
        const tryParse = (o: unknown): vars.HtabEntryInfo | undefined => {
            if (!(typeof o === 'object' && o)) {
                return;
            }

            if (!('type' in o && typeof o.type === 'string' && o.type.length)) {
                return;
            }
            
            if (!('member' in o && typeof o.member === 'string' && o.member.length)) {
                return;
            }

            if (!('parent' in o && typeof o.parent === 'string' && o.parent.length)) {
                return;
            }

            return {
                type: o.type,
                parent: o.parent,
                member: o.member,
            };
        };

        const elements: vars.HtabEntryInfo[] = [];
        for (const o of obj) {
            const record = tryParse(o) ?? tryParseOldVersion(o);
            if (record) {
                record.parent = normalizeFuncName(record.parent);
                elements.push(record);
            }
        }

        return elements;
    };

    const parseSimplehashTypes = (obj: unknown) => {
        /* 
         * [
         *     {
         *         "prefix": "string",
         *         "type": "string"
         *     }
         * ]
         */
        if (!Array.isArray(obj)) {
            return;
        }

        const elements: vars.SimplehashEntryInfo[] = [];
        for (const o of obj) {
            if (!(typeof o === 'object' && o)) {
                continue;
            }

            const prefix = o.prefix;
            const type = o.type;

            if (!(prefix && typeof prefix === 'string' &&
                  type && typeof type === 'string')) {
                continue;
            }

            elements.push({prefix, type});
        }
        
        return elements;
    };
    
    const parseEnumBitmasks = (obj: unknown): vars.BitmaskMemberInfo[] | undefined => {
        /* 
         * "enums": [
         *      {
         *          "type": "ParentType",
         *          "member": "MemberName",
         *          "flags": [
         *              ["FIRST_MACRO", "0x01"],
         *              ["SECOND_MACRO", "0x02"],
         *          ],
         *          "fields": [
         *              {
         *                  "name": "Field Name",
         *                  "mask": "FIELD_MASK_MACRO",
         *                  "numeric": "0xF0"
         *              }
         *          ]
         *      }
         * ]
         */
        
        if (!Array.isArray(obj)) {
            return;
        }
        
        const members: vars.BitmaskMemberInfo[] = [];
        for (const o of obj) {
            const type = o.type;
            const member = o.member;
            if (!(typeof type === 'string' && type.length)) {
                continue;
            }
            
            if (!(typeof member === 'string' && member.length)) {
                continue;
            }
            
            const flags: vars.FlagMemberInfo[] = [];
            if (Array.isArray(o.flags)) {
                for (const flag of o.flags) {
                    if (!Array.isArray(flag)) {
                        continue;
                    }

                    if (!(flag.length === 1 || flag.length === 2)) {
                        continue;
                    }

                    if (typeof flag[0] !== 'string') {
                        continue;
                    }
                    
                    if (flag.length === 2 && typeof flag[1] !== 'string') {
                        continue;
                    }

                    flags.push({
                        flag: flag[0],
                        numeric: flag[1],
                    });
                }
            }
            
            const fields: vars.FieldMemberInfo[] = [];
            if (Array.isArray(o.fields)) {
                for (const f of o.fields) {
                    const name = f.name;
                    const mask = f.mask;
                    const numeric = f.numeric;
                    if (typeof name !== 'string') {
                        continue;
                    }
                    
                    if (typeof mask !== 'string') {
                        continue;
                    }
                    
                    if (numeric && typeof numeric !== 'string') {
                        continue;
                    }

                    fields.push({name, mask, numeric});
                }
            }
            
            if (fields || flags) {
                members.push({type, member, fields, flags});
            }
        }
        
        return members;
    };
    
    const parseNodeTags = (obj: unknown): string[] | undefined => {
        if (!Array.isArray(obj)) {
            return;
        }
        
        const result: string[] = [];
        for (let o of obj) {
            if (typeof o !== 'string') {
                continue;
            }
            
            if (o.startsWith('T_')) {
                o = o.substring(2);
            }

            o = o.trim();
            if (!dbg.isValidIdentifier(o)) {
                continue;
            }

            result.push(o);
        }
        
        return result;
    };

    const parseTypedefs = (obj: unknown): string[] | undefined => {
        if (!obj) {
            return;
        }

        let arr: string[] | undefined;
        if (typeof obj === 'string') {
            arr = [obj.trim()];
        } else if (Array.isArray(obj)) {
            arr = obj.filter(x => typeof x === 'string' && x.length > 0);
        }

        if (!arr?.length) {
            return;
        }

        return arr.filter(x => x.length > 0);
    };

    if (!(typeof contents === 'object' && contents)) {
        return;
    }

    const nonUndefined = <T>(arg: T | undefined) => arg !== undefined;

    const arrays = 'arrays' in contents &&
                        Array.isArray(contents.arrays) &&
                        contents.arrays.length > 0
        ? contents.arrays.map(parseArrayMember).filter(nonUndefined)
        : undefined;
    const aliases = 'aliases' in contents &&
                        Array.isArray(contents.aliases) &&
                        contents.aliases.length > 0
        ? contents.aliases.map(parseSingleAlias).filter(nonUndefined)
        : undefined;
    const customListTypes = 'customListTypes' in contents
        ? parseListTypes(contents.customListTypes)
        : undefined;
    const htab = 'htab' in contents
        ? parseHtabTypes(contents.htab)
        : undefined;
    const simplehash = 'simplehash' in contents
        ? parseSimplehashTypes(contents.simplehash)
        : undefined;
    const enums = 'enums' in contents 
        ? parseEnumBitmasks(contents.enums)
        : undefined;
    const nodetags = 'nodetags' in contents
        ? parseNodeTags(contents.nodetags)
        : undefined;
    const typedefs = 'typedefs' in contents 
        ? parseTypedefs(contents.typedefs)
        : undefined;

    return {
        arrays,
        aliases,
        customListTypes,
        htab,
        simplehash,
        enums,
        nodetags,
        typedefs,
    };
}

async function readJsonFile(file: vscode.Uri) {
    let document;
    try {
        document = await vscode.workspace.openTextDocument(file);
    } catch {
        /* the file might not exist, this is ok */
        return;
    }

    let text;
    try {
        text = document.getText();
    } catch (err: unknown) {
        logger.error('could not read settings file %s', document.uri.fsPath, err);
        return;
    }

    if (text.length === 0) {
        /* JSON file can be used as activation event */
        return;
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch (err: unknown) {
        logger.error('could not parse JSON settings file %s', document.uri.fsPath, err);
        return;
    }
    
    return data as unknown;
}

async function readConfigurationFile(path: vscode.Uri) {
    const contents = await readJsonFile(path);
    return parseConfiguration(contents);
}

async function writeConfigFile(config: ConfigurationFile, file: vscode.Uri) {
    logger.info('writing configuration file %s', file.fsPath);
    const data = JSON.stringify(config, null, 4);

    let vscodeDirPath;
    try {
        await utils.writeFile(file, data);
        return;
    } catch (err) {
        if (!(err instanceof Error)) {
            throw err;
        }
        
        vscodeDirPath = utils.joinPath(file, '..');
        if (!await utils.directoryExists(vscodeDirPath)) {
            throw err;
        }
    }

    logger.info('seems that .vscode directory does not exist - creating new one');
    await utils.createDirectory(vscodeDirPath);
    await utils.writeFile(file, data);
}

export function getWorkspaceFolder() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
        return;
    }
    
    /* 
     * VS Code can be opened in multi-root workspace, that's because
     * 'workspaceFolders' is an array.
     * In order not to complicate things a lot I assume 99.999% of time
     * developer will be working with single-rooted workspace, so take
     * first element.
     * 
     * I can add support for multi-rooted workspace, but I don't know
     * if there will be any profit. Moreover, if we have multiple
     * workspaces and each of them have it's own copy of configuration
     * file, then which one we should use?
     * This question can be asked in many places, i.e. when we are creating
     * new config file in 'Open or create configuration file' command.
     */
    return folders[0].uri;
}

export class Configuration {
    /* 
     * Pair of configuration file contents and path to that file
     */
    config: [ConfigurationFile, vscode.Uri] | undefined;
   
    /*
     * Flag, indicating, that configuration file was changed
     * and requires updating.
     */
    dirty = true;
    
    markDirty() {
        this.dirty = true;
    }
    
    isDirty() {
        return this.dirty;
    }

    async getConfigRefresh() {
        if (!this.dirty) {
            return this.config?.[0];
        }

        return await this.refreshConfig();
    }
    
    async refreshConfig() {
        const workspace = getWorkspaceFolder();
        if (!workspace) {
            return;
        }

        const path = getExtensionConfigFile(workspace);

        let config;
        if (await utils.fileExists(path)) {
            config = await readConfigurationFile(path);
        } else {
            /* File is deleted */
            config = undefined;
        }

        this.config = config ? [config, path] : undefined;
        this.dirty = false;
        return config;
    }
    
    async getVariablesConfiguration(): Promise<VariablesConfiguration | undefined> {
        return await this.getConfigRefresh();

    }
    
    async getFormatterConfiguration(): Promise<FormatterConfiguration | undefined> {
        return await this.getConfigRefresh();
    }
    
    async mutate(mutator: (config: ConfigurationFile) => void) {
        const workspace = getWorkspaceFolder();
        if (!workspace) {
            throw new PghhError('Workspace is not opened');
        }

        const file = getExtensionConfigFile(workspace);
        const configFile = await this.getConfigRefresh() ?? createEmptyConfigurationFile();
        mutator(configFile);

        await writeConfigFile(configFile, file);
        this.config = [configFile, file];
    }
}

function createEmptyConfigurationFile(): ConfigurationFile {
    return {
        customListTypes: undefined,
        arrays: undefined,
        aliases: undefined,
        htab: undefined,
        simplehash: undefined,
        enums: undefined,
        nodetags: undefined,
        typedefs: undefined,
    };
}

export const ExtensionPrettyName = 'PostgreSQL Hacker Helper';
export const ExtensionId = 'postgresql-hacker-helper';

export function getExtensionConfigFile(): string;
export function getExtensionConfigFile(base: vscode.Uri): vscode.Uri;
export function getExtensionConfigFile(base?: vscode.Uri) {
    if (base) {
        return utils.joinPath(base, '.vscode', 'pgsql_hacker_helper.json');
    } else {
        return path.join('.vscode', 'pgsql_hacker_helper.json');
    }
}

export class VsCodeSettings {
    static ConfigSections = {
        TopLevelSection: ExtensionId,
        NodeTagFiles: 'nodeTagFiles',
        LogLevel: 'logLevel',
        PgbsdindentPath: 'pg_bsd_indentPath',
        SrcPath: 'srcPath',
    };
    
    static logLevel: string | undefined;
    static getLogLevel() {
        return this.logLevel ??= this.getConfig<string>(this.ConfigSections.LogLevel);
    };

    static customNodeTagFiles: string[] | undefined;
    static getCustomNodeTagFiles() {
        return this.customNodeTagFiles ??= this.getConfig<string[]>(this.ConfigSections.NodeTagFiles);
    };

    static customPgBsdIndentPath: string | undefined;
    static getCustomPgbsdindentPath() {
        return this.customPgBsdIndentPath ??=
            this.getConfig<string>(this.ConfigSections.PgbsdindentPath);
    }

    static srcPath: string | undefined;
    static getSrcPath() {
        return this.srcPath ??= this.getConfig<string>(this.ConfigSections.SrcPath);
    }

    static getConfig<T>(section: string) {
        const topLevelSection = this.ConfigSections.TopLevelSection;
        const config = vscode.workspace.getConfiguration(topLevelSection);
        return config.get<T>(section);
    };
    
    static getFullConfigSection(section: string) {
        return `${this.ConfigSections.TopLevelSection}.${section}`;
    }
    
    static refreshConfiguration() {
        this.logLevel = this.getConfig<string>(this.ConfigSections.LogLevel);
        this.srcPath = this.getConfig<string>(this.ConfigSections.SrcPath);
        this.customPgBsdIndentPath = this.getConfig<string>(this.ConfigSections.PgbsdindentPath);
        this.customNodeTagFiles = this.getConfig<string[]>(this.ConfigSections.NodeTagFiles);
    }
}

function setupVsCodeSettings(context: vscode.ExtensionContext) {
    vscode.workspace.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration(VsCodeSettings.ConfigSections.TopLevelSection)) {
            return;
        }

        VsCodeSettings.refreshConfiguration();
    }, undefined, context.subscriptions);
}

export function setupConfiguration(context: vscode.ExtensionContext) {
    const config = new Configuration();
    
    /* Mark configuration dirty when user changes it - no eager parsing */
    const registerFolderWatcher = (folder: vscode.Uri) => {
        const pattern = new vscode.RelativePattern(
            folder, getExtensionConfigFile());
        const watcher = vscode.workspace.createFileSystemWatcher(
            pattern, false, false, false);
        context.subscriptions.push(watcher);
        const markDirty = () => config.markDirty();
        watcher.onDidChange(markDirty, undefined, context.subscriptions);
        watcher.onDidCreate(markDirty, undefined, context.subscriptions);
        watcher.onDidDelete(markDirty, undefined, context.subscriptions);  
    };

    const folder = getWorkspaceFolder();
    if (folder) {
        registerFolderWatcher(folder);
    } else {
        const d = vscode.workspace.onDidChangeWorkspaceFolders(e => {
            d.dispose();
            e.added.forEach(f => registerFolderWatcher(f.uri));
        }, undefined, context.subscriptions);
    }

    /* VS Code configuration changes quiet rarely, so it's also cached */
    setupVsCodeSettings(context);

    return config;
}


export class Commands {
    static DumpNodeToLog = `${ExtensionId}.dumpNodeToLog`;
    static DumpNodeToDoc = `${ExtensionId}.dumpNodeToDoc`;
    static OpenConfigFile = `${ExtensionId}.openConfigurationFile`;
    static RefreshConfigFile = `${ExtensionId}.refreshConfigFile`;
    static FormatterDiffView = `${ExtensionId}.formatterShowDiff`;
    static RefreshVariables = `${ExtensionId}.refreshPostgresVariablesView`;
    static BootstrapExtension = `${ExtensionId}.bootstrapExtension`;
    static AddToWatchView = `${ExtensionId}.addVariableToWatch`;
    static GetVariables = `${ExtensionId}.getVariables`;
    static GetTreeViewProvider = `${ExtensionId}.getTreeViewProvider`;
    static FindCustomTypedefsLists = `${ExtensionId}.formatterFindTypedefsList`;
}

export async function openConfigFileCommand() {
    /* 
     * No need to pass Configuration here and mark it dirty,
     * because we will be notified of changes by fs watcher.
     */
    const folder = getWorkspaceFolder();
    if (!folder) {
        vscode.window.showInformationMessage('No workspaces found - open directory first');
        return;
    }

    const configFilePath = getExtensionConfigFile(folder);
    /* Create default configuration file if not exists */
    if (!await utils.fileExists(configFilePath)) {
        const configDirectoryPath = utils.joinPath(configFilePath, '..');
        if (!await utils.directoryExists(configDirectoryPath)) {
            logger.info('creating .vscode directory %s', configDirectoryPath);
            await utils.createDirectory(configDirectoryPath);
        }

        logger.info('creating configuration file %s', configFilePath.fsPath);
    }

    const doc = await vscode.workspace.openTextDocument(configFilePath);
    await vscode.window.showTextDocument(doc);
};


export async function refreshConfigCommand(config: Configuration) {
    await config.refreshConfig();
};

function version(ver: string): number {
    /* 
     * Search SemVer string in form
     *
     *      MAJOR.MINOR.PATCH
     * 
     * where PATCH may be missing.
     * 
     * We use regex because of suffixes that can be inside version string.
     * Like: '1.90.0-insiders' or '1.89.2-prerelease'.
     * So just split by '.' is not enough.
     */
    const parse = /(\d+)\.(\d+)(\.(\d+))?/.exec(ver);

    if (!parse?.length) {
        throw new Error(`Invalid SemVer string: ${ver}`);
    }

    let result = 0;

    /* X.Y.Z - 1, 2, 4 indexes in regex */
    result += parseInt(parse[1]) * 1000000;
    result += parseInt(parse[2]) * 1000;

    if (parse[4]) {
        result += parseInt(parse[4]);
    }

    if (Number.isNaN(result)) {
        throw new Error(`Invalid SemVer string: ${ver}. Result version number is NaN`);
    }

    return result;
}

/* 
 * Various feature flags related to VS Code 
 * functionality, that depends on API
 */
export class Features {
    static versionAtLeast(ver: string) {
        return version(ver) <= version(vscode.version);
    }
    static debugFocus: boolean | undefined = undefined;
    static debugFocusEnabled() {
        /* 
         * Easily track debugger actions (breakpoints etc) and 
         * selected call stack changes.
         */
        return this.debugFocus ??= this.versionAtLeast('1.90.0');
    }

    static arrayLengthFeature: boolean | undefined = undefined;
    static hasEvaluateArrayLength() {
        /*
         * Evaluate array length in debugger like `arrayPtr, length`.
         * This is only cppdbg feature.
         */
        if (this.arrayLengthFeature === undefined) {
            const cppDbgExtension = vscode.extensions.getExtension('ms-vscode.cpptools');
            if (cppDbgExtension?.packageJSON.version) {
                const cppDbgVersion = version(cppDbgExtension.packageJSON.version);
                this.arrayLengthFeature = version('1.13.0') <= cppDbgVersion;
            } else {
                /* Safe default */
                this.arrayLengthFeature = false;
            }
        }
        return this.arrayLengthFeature;
    }

    static hasLogOutputChannel() {
        /* used only during initialization - do not have to save it */
        return this.versionAtLeast('1.74.0');
    }
}

export function getWorkspacePgSrcFile(workspace: vscode.Uri, ...paths: string[]) {
    const customDir = VsCodeSettings.getSrcPath();
    if (customDir) {
        return utils.joinPath(workspace, customDir, ...paths);
    }

    return utils.joinPath(workspace, ...paths);
}
