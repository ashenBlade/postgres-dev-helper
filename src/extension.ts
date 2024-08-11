import * as vscode from 'vscode';
import * as utils from './utils';
import * as vars from './variables';

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
}