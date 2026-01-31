// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { EventEmitter } from 'events';
import { mkdir, readdir, writeFile } from 'fs/promises';
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

const createRequest = (url: string) =>
  ({
    method: 'GET',
    url,
    headers: {
      accept: 'text/html',
    },
  }) as any;

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
        unwatch: vi.fn(),
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
      previewBaseDir: join(rootDir, 'preview-root'),
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
      expect(outDir).toMatch(/dist-[A-Za-z0-9]+$/);
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

  it('serves from the preview base directory and rewrites to the active preview output.', async (fn) => {
    const rootDir = await createTempDir(fn, 'root-preview-base');
    const docsDir = join(rootDir, 'docs');
    const templatesDir = join(rootDir, 'templates');
    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const configPath = join(rootDir, 'atr.json');
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

    const previewRootBaseDir = resolve(join(rootDir, 'preview-root'));
    mockState.generateDocsMock.mockResolvedValue(undefined);

    const openBrowser = vi.fn();
    const httpServer = new EventEmitter();
    const middlewareUse = vi.fn();
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
          open: false,
          hmr: false,
        },
      },
      middlewares: {
        use: middlewareUse,
      },
      watcher: {
        add: vi.fn(),
        unwatch: vi.fn(),
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
      previewBaseDir: previewRootBaseDir,
    });

    const configHook = plugin.config;
    if (!configHook) {
      throw new Error('config is not defined.');
    }
    const configEnv = { command: 'serve', mode: 'development' } as any;
    const configContext = {} as any;
    const configResult =
      typeof configHook === 'function'
        ? await configHook.call(configContext, {}, configEnv)
        : await configHook.handler.call(configContext, {}, configEnv);
    expect(configResult?.root).toBe(previewRootBaseDir);
    if (configResult?.root) {
      (devServer.config as any).root = configResult.root as string;
    }

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

    const rewriteCall = middlewareUse.mock.calls[0];
    if (!rewriteCall) {
      throw new Error('rewrite middleware is not registered.');
    }
    const rewriteMiddleware = rewriteCall[0];
    expect(typeof rewriteMiddleware).toBe('function');

    const req = createRequest('/');
    const res = { end: vi.fn(), setHeader: vi.fn(), statusCode: 200 } as any;
    const next = vi.fn();
    rewriteMiddleware(req, res, next);

    expect(req.url).toMatch(/^\/dist-[^/]+\/$/);
    expect(req.url).not.toContain('preview-root');
    expect(next).toHaveBeenCalled();

    httpServer.emit('close');
  });

  it('cleans the preview directory synchronously on server close.', async (fn) => {
    vi.useFakeTimers();
    vi.resetModules();

    try {
      const rootDir = await createTempDir(fn, 'root-sync-cleanup');
      const docsDir = join(rootDir, 'docs');
      const templatesDir = join(rootDir, 'templates');
      await mkdir(docsDir, { recursive: true });
      await mkdir(templatesDir, { recursive: true });

      const configPath = join(rootDir, 'atr.json');
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

      const previewRootBaseDir = resolve(join(rootDir, 'preview-root'));
      mockState.generateDocsMock.mockResolvedValue(undefined);

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
            open: false,
            hmr: false,
          },
        },
        middlewares: {
          use: vi.fn(),
        },
        watcher: {
          add: vi.fn(),
          unwatch: vi.fn(),
          on: vi.fn(),
        },
        ws: {
          send: vi.fn(),
        },
        httpServer,
        openBrowser: vi.fn(),
        resolvedUrls: undefined,
      } as unknown as ViteDevServer;

      const { atrPreview } = await import('../src/vite');
      const plugin = atrPreview({
        configPath,
        previewBaseDir: previewRootBaseDir,
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

      const entriesBefore = (await readdir(previewRootBaseDir)).filter(
        (entry) => entry.startsWith('dist-')
      );
      expect(entriesBefore.length).toBe(1);

      httpServer.emit('close');

      const entriesAfter = (await readdir(previewRootBaseDir)).filter((entry) =>
        entry.startsWith('dist-')
      );
      expect(entriesAfter.length).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.resetModules();
    }
  });

  it('limits the Vite watcher to the allow-listed paths.', async (fn) => {
    const rootDir = await createTempDir(fn, 'root-watch-allow');
    const docsDir = join(rootDir, 'docs');
    const templatesDir = join(rootDir, 'templates');
    const assetsDir = join(rootDir, 'assets');
    const srcDir = join(rootDir, 'src');
    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });
    await mkdir(assetsDir, { recursive: true });
    await mkdir(srcDir, { recursive: true });

    const configPath = join(rootDir, 'atr.json');
    await writeFile(
      configPath,
      JSON.stringify(
        {
          variables: {
            docsDir: './docs',
            templatesDir: './templates',
            assetsDir: './assets',
            enableGitMetadata: false,
          },
        },
        null,
        2
      ),
      'utf8'
    );
    await writeFile(
      join(rootDir, 'vite.config.ts'),
      'export default {}',
      'utf8'
    );

    const previewRootBaseDir = resolve(join(rootDir, 'preview-root'));
    mockState.generateDocsMock.mockResolvedValue(undefined);

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
          open: false,
          hmr: false,
        },
      },
      middlewares: {
        use: vi.fn(),
      },
      watcher: {
        add: vi.fn(),
        unwatch: vi.fn(),
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
      previewBaseDir: previewRootBaseDir,
      watchInclude: ['src', 'vite.config.ts'],
    });

    const configHook = plugin.config;
    if (!configHook) {
      throw new Error('config is not defined.');
    }
    const configEnv = { command: 'serve', mode: 'development' } as any;
    const configContext = {} as any;
    const configResult =
      typeof configHook === 'function'
        ? await configHook.call(configContext, { root: rootDir }, configEnv)
        : await configHook.handler.call(
            configContext,
            { root: rootDir },
            configEnv
          );
    const ignored = configResult?.server?.watch?.ignored as
      | ((filePath: string) => boolean)
      | undefined;
    expect(typeof ignored).toBe('function');
    if (configResult?.root) {
      (devServer.config as any).root = configResult.root as string;
    }

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

    await new Promise((resolve) => setTimeout(resolve, 200));

    if (!ignored) {
      throw new Error('ignored is not defined.');
    }

    expect(ignored(configPath)).toBe(false);
    expect(ignored(join(rootDir, 'config.local.json'))).toBe(false);
    expect(ignored(join(rootDir, 'nested', 'config.json'))).toBe(true);
    expect(ignored(join(docsDir, 'index.md'))).toBe(false);
    expect(ignored(join(templatesDir, 'index.html'))).toBe(false);
    expect(ignored(join(assetsDir, 'logo.png'))).toBe(false);
    expect(ignored(join(srcDir, 'index.ts'))).toBe(false);
    expect(ignored(join(rootDir, 'vite.config.ts'))).toBe(false);
    expect(ignored(join(rootDir, 'other', 'extra.ts'))).toBe(true);
    expect(ignored(join(previewRootBaseDir, 'dist-demo', 'index.html'))).toBe(
      true
    );

    httpServer.emit('close');
  });
});
