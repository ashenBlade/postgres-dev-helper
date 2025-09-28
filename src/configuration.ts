import * as vscode from 'vscode';

import * as vars from './variables';
import * as utils from './utils';
import { Log as logger } from './logger';

export interface VariablesConfiguration {
    /* Array special members */
    arrayInfos?: vars.ArraySpecialMemberInfo[];
    /* Information about type aliases */
    aliasInfos?: vars.AliasInfo[];
    /* Custom List types */
    customListTypes?: vars.ListPtrSpecialMemberInfo[];   
    /* Types stored in HTABs */
    htabTypes?: vars.HtabEntryInfo[];
    /* Types for simple hash */
    simpleHashTableTypes?: vars.SimplehashEntryInfo[];
    /* Enum values for integer fields */
    bitmaskEnumMembers?: vars.BitmaskMemberInfo[];
    /* Extra NodeTags */
    nodetags?: string[];
}

export interface PgindentConfiguration {
    typedefs?: string[];
}

export function parseFormatterConfiguration(configFile: unknown): PgindentConfiguration | undefined {
    const parseTypedefs = (obj: unknown): string[] | undefined => {
        if (!obj) {
            return;
        }

        let arr: string[] | undefined;
        if (typeof obj === 'string') {
            arr = [obj.trim()];
        } else if (Array.isArray(obj)) {
            arr = obj.map(x => x.toString());
        }
        
        if (!arr?.length) {
            return;
        }
        
        return arr.filter(x => x.length > 0);
    };
    
    if (!(typeof configFile === 'object' && configFile && 'typedefs' in configFile)) {
        return;
    }
    const typedefs = parseTypedefs(configFile.typedefs);

    if (typedefs?.length) {
        return {
            typedefs,
        };
    }
}

export function parseVariablesConfiguration(configFile: unknown): VariablesConfiguration | undefined {
    const parseArrayMember = (obj: unknown): vars.ArraySpecialMemberInfo | undefined => {
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
            if (!utils.isValidIdentifier(typeName)) {
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
            if (!utils.isValidIdentifier(memberName)) {
                vscode.window.showErrorMessage(`memberName field ${memberName} is not valid identifier`);
                return;
            }
        }

        let lengthExpr;
        if ('lengthExpression' in obj) {
            lengthExpr = obj.lengthExpression;
            if (!lengthExpr) {
                vscode.window.showErrorMessage(`lengthExpression not provided for: ${typeName}->${memberName}`);
                return;
            }
    
            if (typeof lengthExpr !== 'string') {
                vscode.window.showErrorMessage(`lengthExpression field must be string for: ${typeName}->${memberName}`);
                return;
            }
    
            lengthExpr = lengthExpr.trim();
            if (!lengthExpr.length) {
                vscode.window.showErrorMessage('lengthExpression can not be empty string');
                return;
            }
        }

        if (typeName && memberName && lengthExpr) {
            return {
                typeName,
                memberName,
                lengthExpr,
            };
        }
    };

    const parseSingleAlias = (obj: unknown): vars.AliasInfo | undefined => {
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

    const normalizeFuncName = (name: string) => {
        /*
         * Earlier extension versions used solib prefix in function name
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

    const parseListTypes = (obj: unknown): vars.ListPtrSpecialMemberInfo[] | undefined => {
        /* 
         * [
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

        const elements: vars.ListPtrSpecialMemberInfo[] = [];
        for (const o of obj) {
            if (!(typeof o === 'object' && o)) {
                continue;
            }

            if (!('type' in o && typeof o.type === 'string' && o.type)) {
                continue;
            }

            const type = o.type;
            let memberEntry: [string, string] | undefined;
            if (Array.isArray(o.member) && o.member.length === 2) {
                const struct = o.member[0];
                const member = o.member[1];
                if (!(typeof struct === 'string' && typeof member === 'string' &&
                             struct              &&        member)) {
                    vscode.window.showErrorMessage(`"member" entry should be array of struct and member strings. given: [${typeof struct}, ${typeof member}]`);
                    continue;
                }

                memberEntry = [struct, member];
            }

            let variableEntry: [string, string] | undefined;
            if (Array.isArray(o.variable) && o.variable.length === 2) {
                let func = o.variable[0];
                let variable = o.variable[1];
                if (!(typeof func === 'string' && typeof variable === 'string' &&
                             func              &&        variable)) {
                    vscode.window.showErrorMessage(`"variable" entry should be array of function name and variable strings. given: [${typeof func}, ${typeof variable}]`);
                    continue;
                }
                
                func = normalizeFuncName(func.trim());
                variable = variable.trim();
                
                if (!(func && variable)) {
                    continue;
                }

                variableEntry = [func, variable];
            }
            
            elements.push({
                type,
                member: memberEntry,
                variable: variableEntry,
            });
        }

        return elements;
    };

    const parseHtabTypes = (obj: unknown): vars.HtabEntryInfo[] | undefined => {
        /*
         * {
         *     "parent": "string",
         *     "member": ["string", "string"],
         *     "variable": ["string", "string"]
         * }
         */
        const extractParentMember = (o: unknown): [string, string] | undefined => {
            if (!(Array.isArray(o) && o.length === 2)) {
                return;
            }

            let [parent, member] = o;
            if (!(typeof parent === 'string' && typeof member === 'string'
                      && parent              &&        member)) {
                return;
            }

            parent = normalizeFuncName(parent.trim());
            member = member.trim();
            if (!(parent && member)) {
                return;
            }

            return [parent, member];
        };

        if (!Array.isArray(obj)) {
            return;
        }

        const elements: vars.HtabEntryInfo[] = [];
        for (const o of obj) {
            if (!(o && typeof o === 'object')) {
                continue;
            }

            const type = o.type;
            if (typeof type !== 'string' && type) {
                continue;
            }

            let pair = extractParentMember(o.member);
            if (!pair) {
                pair = extractParentMember(o.variable);
            }
            
            if (!pair) {
                continue;
            }

            elements.push({
                type, 
                member: pair[1],
                parent: pair[0],
            });
        }

        return elements;
    };

    const parseSimplehashTypes = (obj: unknown): vars.SimplehashEntryInfo[] | undefined => {
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

        const elements = [];
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

            elements.push({
                prefix,
                canIterate: true,
                elementType: type,
            } as vars.SimplehashEntryInfo);
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
            if (typeof type !== 'string') {
                continue;
            }
            
            if (typeof member !== 'string') {
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
            if (!utils.isValidIdentifier(o)) {
                continue;
            }

            result.push(o);
        }
        
        return result;
    };

    if (!(typeof configFile === 'object' && configFile)) {
        return;
    }

    const nonUndefined = <T>(arg: T | undefined) => arg !== undefined;

    const arrayInfos = 'arrays' in configFile &&
                        Array.isArray(configFile.arrays) &&
                        configFile.arrays.length > 0
        ? configFile.arrays.map(parseArrayMember).filter(nonUndefined)
        : undefined;

    const aliasInfos = 'aliases' in configFile &&
                        Array.isArray(configFile.aliases) &&
                        configFile.aliases.length > 0
        ? configFile.aliases.map(parseSingleAlias).filter(nonUndefined)
        : undefined;

    const customListTypes = 'customListTypes' in configFile
        ? parseListTypes(configFile.customListTypes)
        : undefined;
    const htabTypes = 'htab' in configFile
        ? parseHtabTypes(configFile.htab)
        : undefined;
    const simpleHashTableTypes = 'simplehash' in configFile
        ? parseSimplehashTypes(configFile.simplehash)
        : undefined;
    const bitmaskEnumMembers = 'enums' in configFile 
        ? parseEnumBitmasks(configFile.enums)
        : undefined;
    const nodetags = 'nodetags' in configFile
        ? parseNodeTags(configFile.nodetags)
        : undefined;

    if (   arrayInfos?.length
        || aliasInfos?.length
        || customListTypes?.length
        || htabTypes?.length
        || simpleHashTableTypes?.length
        || bitmaskEnumMembers?.length
        || nodetags?.length) {
        return {
            arrayInfos,
            aliasInfos,
            customListTypes,
            htabTypes,
            simpleHashTableTypes,
            bitmaskEnumMembers,
            nodetags,
        };
    }
}

async function readConfigFile(file: vscode.Uri) {
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
    
    return data;
}

let variablesConfig: VariablesConfiguration | undefined;
let formatterConfig: PgindentConfiguration | undefined;

/* Flag indicating that configuration file should be refreshed */
let configDirty = true;

async function checkConfigurationFresh() {
    if (!configDirty) {
        return;
    }
    
    await refreshConfiguration();
    configDirty = false;
}

export async function getVariablesConfiguration() {
    await checkConfigurationFresh();
    return variablesConfig;
}

export async function getFormatterConfiguration() {
    await checkConfigurationFresh();
    return formatterConfig;
}

export async function refreshConfiguration() {
    /* Do not check 'dirtyFlag', because this function must be invoked explicitly */

    if (!vscode.workspace.workspaceFolders?.length) {
        return;
    }

    for (const folder of vscode.workspace.workspaceFolders) {
        const file = getExtensionConfigFile(folder.uri);
        const config = await readConfigFile(file);
        if (!config) {
            return;
        }

        try {
            formatterConfig = parseFormatterConfiguration(config);
        } catch (err) {
            logger.error('could not parse formatter configuration', err);
        }
        
        try {
            variablesConfig = parseVariablesConfiguration(config);
        } catch (err) {
            logger.error('could not parse variables configuration', err);
        }
    }
    
    configDirty = false;
}

export function markConfigFileDirty() {
    configDirty = true;
}

export const ExtensionPrettyName = 'PostgreSQL Hacker Helper';
export const ExtensionId = 'postgresql-hacker-helper';

export const ExtensionSettingsFileName = 'pgsql_hacker_helper.json';
export function getExtensionConfigFile(workspace: vscode.Uri) {
    return vscode.Uri.joinPath(workspace, '.vscode', ExtensionSettingsFileName);
}

export const PgVariablesViewName = `${ExtensionId}.node-tree-view`;

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

export function setupVsCodeSettings(context: vscode.ExtensionContext) {
    vscode.workspace.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration(VsCodeSettings.ConfigSections.TopLevelSection)) {
            return;
        }

        VsCodeSettings.refreshConfiguration();
    }, undefined, context.subscriptions);
}

export class Commands {
    static DumpNodeToLog = `${ExtensionId}.dumpNodeToLog`;
    static DumpNodeToDoc = `${ExtensionId}.dumpNodeToDoc`;
    static OpenConfigFile = `${ExtensionId}.openConfigurationFile`;
    static RefreshConfigFile = `${ExtensionId}.refreshConfigFile`;
    static FormatterDiffView = `${ExtensionId}.formatterShowDiff`;
    static RefreshPostgresVariables = `${ExtensionId}.refreshPostgresVariablesView`;
    static BootstrapExtension = `${ExtensionId}.bootstrapExtension`;
    static AddToWatchView = `${ExtensionId}.addVariableToWatch`;
    static GetVariables = `${ExtensionId}.getVariables`;
    static GetTreeViewProvider = `${ExtensionId}.getTreeViewProvider`;
    static FindCustomTypedefsLists = `${ExtensionId}.formatterFindTypedefsList`;
}

