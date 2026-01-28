// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { format } from 'util';
import createDebug from 'debug';
import type { LogLevel, Logger as ViteLogger } from 'vite';
import type { Logger as MarkDecoLogger } from 'mark-deco';

import type { Logger } from './types';

//////////////////////////////////////////////////////////////////////////////

const formatMessage = (message: string, args: readonly unknown[]): string => {
  if (args.length === 0) {
    return message;
  }
  return format(message, ...args);
};

export const createConsoleLogger = (
  prefix: string,
  debugNamespace: string = prefix
): Logger => {
  const debugLogger = createDebug(debugNamespace);
  return {
    debug: (message: string) => {
      debugLogger(message);
    },
    info: (message: string) => {
      console.info(`[${prefix}] ${message}`);
    },
    warn: (message: string) => {
      console.warn(`[${prefix}] ${message}`);
    },
    error: (message: string) => {
      console.error(`[${prefix}] ${message}`);
    },
  };
};

export const createViteLoggerAdapter = (
  viteLogger: ViteLogger,
  logLevel: LogLevel,
  prefix: string,
  debugNamespace: string = `vite:plugin:${prefix}`
): Logger => {
  const debugLogger = createDebug(debugNamespace);
  return {
    debug: (message: string) => {
      debugLogger(message);
    },
    info:
      logLevel !== 'silent'
        ? (message: string) => viteLogger.info(`[${prefix}] ${message}`)
        : () => {},
    warn:
      logLevel === 'warn' || logLevel === 'info' || logLevel === 'error'
        ? (message: string) => viteLogger.warn(`[${prefix}] ${message}`)
        : () => {},
    error:
      logLevel !== 'silent'
        ? (message: string) => viteLogger.error(`[${prefix}] ${message}`)
        : () => {},
  };
};

export const createProcessorLogger = (
  baseLogger: Logger,
  debugNamespace: string
): MarkDecoLogger => {
  const debugLogger = createDebug(debugNamespace);
  const debug = (message: string, ...args: unknown[]) => {
    debugLogger(message, ...args);
  };
  return {
    debug,
    info: debug,
    warn: (message: string, ...args: unknown[]) => {
      baseLogger.warn(formatMessage(message, args));
    },
    error: (message: string, ...args: unknown[]) => {
      baseLogger.error(formatMessage(message, args));
    },
  };
};
