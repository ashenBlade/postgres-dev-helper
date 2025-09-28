import { format } from 'util';
import * as vscode from 'vscode';
import * as utils from './utils';
import { ExtensionPrettyName, VsCodeSettings } from './configuration';

interface ILogger {
    debug: (message: string, args: unknown[]) => void;
    info: (message: string, args: unknown[]) => void;
    warn: (message: string, args: unknown[]) => void;
    error: (message: string, args: unknown[]) => void;
}

/* Start with 2 as in vscode.LogLevel */
enum LogLevel {
    Debug = 2,
    Info = 3,
    Warn = 4,
    Error = 5,
    Disable = 6,
}

abstract class BaseLogger implements ILogger {
    constructor(protected channel: vscode.OutputChannel) { }

    protected format(msg: string, args: unknown[]) {
        if (args.length && args[args.length - 1] instanceof Error) {
            const err = args[args.length - 1] as Error;
            return `${format(msg, ...args)}\n${err}`;
        } else {
            return format(msg, ...args);
        }
    }

    abstract debug(message: string, args: unknown[]): void;
    abstract info(message: string, args: unknown[]): void;
    abstract warn(message: string, args: unknown[]): void;
    abstract error(message: string, args: unknown[]): void;
}

class ObsoleteVsCodeLogger extends BaseLogger implements ILogger {
    constructor(channel: vscode.OutputChannel,
                public minLogLevel: LogLevel) {
        super(channel);
    }

    logGeneric(level: LogLevel, levelStr: string, message: string, args: unknown[]) {
        if (level < this.minLogLevel) {
            return;
        }

        /* 
         * VS Code prior to 1.74.0 does not have LogOutputChannel
         * with builtin level/timing features
         */

        /* YYYY-mm-ddTHH:MM:SS.ffffZ -> YYYY-mm-dd HH:MM:SS.ffff */
        const timestamp = new Date().toISOString()
                                    .replace('T', ' ')
                                    .replace('Z', '');
        /* TIMESTAMP [LEVEL]: MESSAGE \n EXCEPTION */
        this.channel.append(timestamp);
        this.channel.append(' [');
        this.channel.append(levelStr);
        this.channel.append(']: ');
        this.channel.appendLine(this.format(message, args));
    }

    debug(message: string, args: unknown[]) {
        this.logGeneric(LogLevel.Debug, 'debug', message, args);
    }
    info(message: string, args: unknown[]) {
        this.logGeneric(LogLevel.Info, 'info', message, args);
    }
    warn(message: string, args: unknown[]) {
        this.logGeneric(LogLevel.Warn, 'warn', message, args);
    }
    error(message: string, args: unknown[]) {
        this.logGeneric(LogLevel.Error, 'error', message, args);
    }
}

class VsCodeLogger extends BaseLogger implements ILogger {
    constructor(private logOutput: vscode.LogOutputChannel) {
        super(logOutput);
    }

    canLog(level: vscode.LogLevel): boolean {
        return this.logOutput.logLevel != vscode.LogLevel.Off && 
               this.logOutput.logLevel <= level;
    }
    
    logGeneric(level: vscode.LogLevel, handler: (msg: string) => void,
               fmt: string, args: unknown[]) {
        if (this.canLog(level)) {
            /* VS Code LogOutputChannel can not use format strings, so do it manually */
            handler(super.format(fmt, args));
        }
    }

    debug(message: string, args: unknown[]) {
        this.logGeneric(vscode.LogLevel.Debug, this.logOutput.debug, message, args);
    }
    info(message: string, args: unknown[]) {
        this.logGeneric(vscode.LogLevel.Info, this.logOutput.info, message, args);
    }
    warn(message: string, args: unknown[]) {
        this.logGeneric(vscode.LogLevel.Warning, this.logOutput.warn, message, args);
    }
    error(message: string, args: unknown[]) {
        this.logGeneric(vscode.LogLevel.Error, this.logOutput.error, message, args);
    }
}

class NullLogger implements ILogger {
    debug(_message: string, ..._args: unknown[]) { }
    info(_message: string, ..._args: unknown[]) { }
    warn(_message: string, ..._args: unknown[]) { }
    error(_message: string, ..._args: unknown[]) { }
    focus() { }
}

export class Log {
    static logger: ILogger = new NullLogger();

    static debug(message: string, ...args: unknown[]) {
        this.logger.debug(message, args);
    }
    static info(message: string, ...args: unknown[]) {
        this.logger.info(message, args);
    } 
    static warn(message: string, ...args: unknown[]) {
        this.logger.warn(message, args);
    }
    static error(message: string, ...args: unknown[]) {
        this.logger.error(message, args);
    }
}

export function initLogger(context: vscode.ExtensionContext) {
    const extName = ExtensionPrettyName;

    let outputChannel;
    let logger;    
    if (utils.Features.hasLogOutputChannel()) {
        outputChannel = vscode.window.createOutputChannel(extName, {log: true});
        logger = new VsCodeLogger(outputChannel);
    } else {
        outputChannel = vscode.window.createOutputChannel(extName, 'log');

        const logLevelConfigSection = VsCodeSettings.ConfigSections.LogLevel;
        const fullConfigSectionName = VsCodeSettings.getFullConfigSection(logLevelConfigSection);
        const getCurrentLogLevel = () => {
            /* Legacy versions without LogOutputChannel with builtin log levels */
            const configValue = VsCodeSettings.getLogLevel();
            switch (configValue) {
                case 'INFO':
                    return LogLevel.Info;
                case 'DEBUG':
                    return LogLevel.Debug;
                case 'WARNING':
                    return LogLevel.Warn;
                case 'ERROR':
                    return LogLevel.Error;
                case 'DISABLE':
                    return LogLevel.Disable;
                default:
                    return LogLevel.Info;
            }
        };

        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
            if (!event.affectsConfiguration(fullConfigSectionName)) {
                return;
            }

            vsCodeLogger.minLogLevel = getCurrentLogLevel();
        }, undefined, context.subscriptions));
        const vsCodeLogger = new ObsoleteVsCodeLogger(outputChannel, getCurrentLogLevel());
        logger = vsCodeLogger;
    }

    context.subscriptions.push(outputChannel);
    Log.logger = logger;
}
