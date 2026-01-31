// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { EventEmitter } from 'events';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it, vi, type TestContext } from 'vitest';
import dayjs from 'dayjs';
import type { ViteDevServer } from 'vite';

///////////////////////////////////////////////////////////////////////////////////

const mockState = vi.hoisted(() => ({
  generateDocsMock: vi.fn(),
}));

vi.mock('../src/process', () => ({
  generateDocs: mockState.generateDocsMock,
}));

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

///////////////////////////////////////////////////////////////////////////////////

describe('atrPreview', () => {
  afterEach(() => {
    mockState.generateDocsMock.mockReset();
  });

  const runOpenDelayScenario = async (
    fn: TestContext,
    useTempPreviewRoot: boolean
  ) => {
    const rootDir = await createTempDir(
      fn,
      useTempPreviewRoot ? 'root-temp' : 'root-direct'
    );
    const docsDir = join(rootDir, 'docs');
    const templatesDir = join(rootDir, 'templates');
    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const configPath = join(rootDir, 'atr.json');
    const previewRootBaseDir = resolve(join(rootDir, 'preview-root'));
    await writeFile(
      configPath,
      JSON.stringify(
        {
          variables: {
            docsDir: './docs',
            templatesDir: './templates',
            enableGitMetadata: false,
          },
        },
        null,
        2
      ),
      'utf8'
    );

    let resolveGenerate: () => void = () => undefined;
    const generatePromise = new Promise<void>((resolve) => {
      resolveGenerate = resolve;
    });
    mockState.generateDocsMock.mockReturnValue(generatePromise);

    const openBrowser = vi.fn();
    const httpServer = new EventEmitter();
    const devServer = {
      config: {
        root: rootDir,
        logLevel: 'info',
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        server: {
          open: true,
          hmr: true,
        },
      },
      middlewares: {
        use: vi.fn(),
      },
      watcher: {
        add: vi.fn(),
        on: vi.fn(),
      },
      ws: {
        send: vi.fn(),
      },
      httpServer,
      openBrowser,
      resolvedUrls: undefined,
    } as unknown as ViteDevServer;

    vi.resetModules();
    const { atrPreview } = await import('../src/vite');
    const plugin = atrPreview({
      configPath,
      previewRootBaseDir: join(rootDir, 'preview-root'),
      useTempPreviewRoot,
    });

    const configureServerHook = plugin.configureServer;
    if (!configureServerHook) {
      throw new Error('configureServer is not defined.');
    }
    const pluginContext = {} as any;
    if (typeof configureServerHook === 'function') {
      await configureServerHook.call(pluginContext, devServer);
    } else {
      await configureServerHook.handler.call(pluginContext, devServer);
    }

    expect(devServer.config.server.open).toBe(false);
    expect(openBrowser).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(mockState.generateDocsMock).toHaveBeenCalledTimes(1);
    if (useTempPreviewRoot) {
      const [options] = mockState.generateDocsMock.mock.calls[0] ?? [];
      expect(options).toBeDefined();
      const outDir = options.outDir as string;
      expect(typeof outDir).toBe('string');
      expect(outDir.startsWith(previewRootBaseDir)).toBe(true);
      expect(outDir).toMatch(/dist-\d+-\d+$/);
    }
    expect(openBrowser).not.toHaveBeenCalled();

    devServer.resolvedUrls = { local: ['http://localhost:5173/'] } as any;
    resolveGenerate();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(devServer.config.server.open).toBe(false);

    httpServer.emit('close');
  };

  it('delays opening the browser until the first successful build completes.', async (fn) => {
    await runOpenDelayScenario(fn, true);
  });

  it('delays opening the browser without a temp preview root.', async (fn) => {
    await runOpenDelayScenario(fn, false);
  });
});
