// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger as ViteLogger } from 'vite';

import type { Logger as AppLogger } from '../src/types';

const debugInstances: Array<ReturnType<typeof vi.fn>> = [];

vi.mock('debug', () => ({
  default: vi.fn((namespace: string) => {
    const debugFn = vi.fn();
    (debugFn as any).namespace = namespace;
    debugInstances.push(debugFn);
    return debugFn;
  }),
}));

import { createProcessorLogger, createViteLoggerAdapter } from '../src/logger';

const createViteLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }) as unknown as ViteLogger;

describe('createViteLoggerAdapter', () => {
  beforeEach(() => {
    debugInstances.length = 0;
    vi.clearAllMocks();
  });

  it('routes debug to debug logger and prefixes Vite output.', () => {
    const viteLogger = createViteLogger();
    const logger = createViteLoggerAdapter(
      viteLogger,
      'info',
      'atr-vite-plugin',
      'vite:plugin:atr'
    );

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(debugInstances).toHaveLength(1);
    expect(debugInstances[0]).toHaveBeenCalledWith('debug message');
    expect(viteLogger.info).toHaveBeenCalledWith(
      '[atr-vite-plugin] info message'
    );
    expect(viteLogger.warn).toHaveBeenCalledWith(
      '[atr-vite-plugin] warn message'
    );
    expect(viteLogger.error).toHaveBeenCalledWith(
      '[atr-vite-plugin] error message'
    );
  });

  it('suppresses info/warn/error when log level is silent.', () => {
    const viteLogger = createViteLogger();
    const logger = createViteLoggerAdapter(
      viteLogger,
      'silent',
      'atr',
      'vite:plugin:atr'
    );

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(debugInstances).toHaveLength(1);
    expect(debugInstances[0]).toHaveBeenCalledWith('debug message');
    expect(viteLogger.info).not.toHaveBeenCalled();
    expect(viteLogger.warn).not.toHaveBeenCalled();
    expect(viteLogger.error).not.toHaveBeenCalled();
  });
});

describe('createProcessorLogger', () => {
  beforeEach(() => {
    debugInstances.length = 0;
    vi.clearAllMocks();
  });

  it('routes info/debug to debug logger and formats warn/error.', () => {
    const baseLogger: AppLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logger = createProcessorLogger(baseLogger, 'atr:processor');

    logger.debug('debug message', 'extra');
    logger.info('info message', 1);
    logger.warn('warn message', 2);
    logger.error('error message', 3);

    expect(debugInstances).toHaveLength(1);
    expect(debugInstances[0]!.mock.calls).toEqual([
      ['debug message', 'extra'],
      ['info message', 1],
    ]);
    expect(baseLogger.debug).not.toHaveBeenCalled();
    expect(baseLogger.info).not.toHaveBeenCalled();
    expect(baseLogger.warn).toHaveBeenCalledWith('warn message 2');
    expect(baseLogger.error).toHaveBeenCalledWith('error message 3');
  });
});
