import * as vscode from 'vscode';
import { ExtensionPrettyName, VsCodeSettings, Features } from './configuration';

interface ILogger {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (error: string | Error, message: string, ...args: unknown[]) => void;
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
    abstract debug(message: string, ...args: unknown[]): void;
    abstract info(message: string, ...args: unknown[]): void;
    abstract warn(message: string, ...args: unknown[]): void;
    abstract error(error: string | Error, message: string, ...args: unknown[]): void;
}

class ObsoleteVsCodeLogger extends BaseLogger implements ILogger {
    constructor(channel: vscode.OutputChannel,
                public minLogLevel: LogLevel) {
        super(channel);
    }
    
    format(message: string, args: unknown[]) {
        if (args.length === 0) {
            return message;
        }
        
        return [
            message,
            ...args.map(a => !a ? '(null)' : typeof a === 'object' ? JSON.stringify(a) : a.toString()),
        ].join(' ');
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

    debug(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Debug, 'debug', message, args);
    }
    info(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Info, 'info', message, args);
    }
    warn(message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Warn, 'warn', message, args);
    }
    error(error: string | Error, message: string, ...args: unknown[]) {
        this.logGeneric(LogLevel.Error, 'error', message, args);
    }
}

class VsCodeLogger extends BaseLogger implements ILogger {
    constructor(private logOutput: vscode.LogOutputChannel) {
        super(logOutput);
    }

    debug(message: string, ...args: unknown[]) {
        this.logOutput.debug(message, ...args);
    }
    info(message: string, ...args: unknown[]) {
        this.logOutput.info(message, ...args);
    }
    warn(message: string, ...args: unknown[]) {
        this.logOutput.warn(message, ...args);
    }
    error(error: string | Error, message: string, ...args: unknown[]) {
        this.logOutput.error(error, message, ...args);
    }
}

class NullLogger implements ILogger {
    debug(_message: string, ..._args: unknown[]) { }
    info(_message: string, ..._args: unknown[]) { }
    warn(_message: string, ..._args: unknown[]) { }
    error(_error: string | Error, _message: string, ..._args: unknown[]) { }
    focus() { }
}

export class Log {
    static logger: ILogger = new NullLogger();

    static debug(message: string, ...args: unknown[]) {
        this.logger.debug(message, ...args);
    }
    static info(message: string, ...args: unknown[]) {
        this.logger.info(message, ...args);
    } 
    static warn(message: string, ...args: unknown[]) {
        this.logger.warn(message, ...args);
    }
    static error(error: unknown, message: string, ...args: unknown[]) {
        /* For 'error' use 'unknown', because 'catch (err)' is unknown  */
        this.logger.error(error as string | Error, message, ...args);
    }
}

export function initLogger(context: vscode.ExtensionContext) {
    const extName = ExtensionPrettyName;

    let outputChannel;
    let logger;    
    if (Features.hasLogOutputChannel()) {
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
