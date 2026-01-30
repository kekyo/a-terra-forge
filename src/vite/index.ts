// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { watch, type FSWatcher } from 'fs';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import type { Plugin, ViteDevServer } from 'vite';

import {
  version,
  git_commit_hash,
  description,
  author,
  license,
  repository_url,
} from '../generated/packageMetadata';
import { generateDocs } from '../process';
import { createConsoleLogger, createViteLoggerAdapter } from '../logger';
import type {
  Logger,
  ATerraForgeConfigInput,
  ATerraForgeConfigOverrides,
  ATerraForgeProcessingOptions,
} from '../types';
import {
  loadATerraForgeConfig,
  mergeATerraForgeConfig,
  parseATerraForgeConfigOverrides,
  resolveATerraForgeConfigPathFromDir,
  resolveATerraForgeProcessingOptionsFromVariables,
} from '../utils';
import {
  createPreviewHtmlNotFoundMiddleware,
  createPreviewPathRewriteMiddleware,
} from './previewMiddleware';
import { collectGitWatchTargets, resolveGitDir } from './gitWatch';

///////////////////////////////////////////////////////////////////////////////////

/**
 * a-terra-forge preview plugin options.
 */
export interface ATerraForgeVitePluginOptions extends ATerraForgeConfigInput {
  /** Path to atr config (defaults to atr.json5/atr.jsonc/atr.json in the Vite root when omitted). */
  configPath?: string;
  /** Temporary working directory base (defaults to /tmp when omitted). */
  tmpDir?: string;
  /** Enable temporary preview root for dev output. */
  useTempPreviewRoot?: boolean;
  /** Base directory for temporary preview root (defaults to os.tmpdir()). */
  previewRootBaseDir?: string;
  /** Output directory name under preview root (defaults to dist). */
  previewOutDirName?: string;
}

const resolveConfigPath = (
  configPath: string | undefined,
  baseDir: string
): string =>
  configPath
    ? resolve(configPath)
    : resolveATerraForgeConfigPathFromDir(baseDir);

const isWithinDir = (filePath: string, dirPath: string): boolean => {
  const relativePath = relative(dirPath, filePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
};

///////////////////////////////////////////////////////////////////////////////////

/**
 * a-terra-forge preview plugin for Vite.
 * @param options - a-terra-forge options.
 * @returns Vite plugin instance.
 */
export const atrPreview = (
  options: ATerraForgeVitePluginOptions = {}
): Plugin => {
  const defaultCacheDir = process.env.HOME
    ? join(process.env.HOME, '.cache', 'atr')
    : '.cache';
  const defaultDocsDir = resolve('docs');
  const defaultTemplatesDir = resolve('templates');
  const defaultOutDir = resolve('dist');
  const defaultTmpDir = resolve('/tmp');
  const defaultPreviewRootBaseDir = tmpdir();
  const useTempPreviewRoot = options.useTempPreviewRoot ?? true;
  const resolvePreviewOutDirName = (value: string | undefined): string => {
    const trimmed = value?.trim() ?? '';
    const normalized = trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
    return normalized.length > 0 ? normalized : 'dist';
  };
  const previewOutDirName = resolvePreviewOutDirName(options.previewOutDirName);
  const defaultCacheDirResolved = resolve(defaultCacheDir);
  let configPath = resolveConfigPath(options.configPath, process.cwd());
  const configOverrides: ATerraForgeConfigOverrides =
    parseATerraForgeConfigOverrides(options, configPath);
  let docsDir = defaultDocsDir;
  let templatesDir = defaultTemplatesDir;
  let previewRoot: string | undefined;
  let previewOutDir: string | undefined;
  let previewRootCreated = false;
  const pluginName = `atr-vite`;
  const abortController = new AbortController();
  const debugNamespace = `vite:plugin:${pluginName}`;

  let server: ViteDevServer | undefined;
  let running = false;
  let queued = false;
  let timer: NodeJS.Timeout | undefined;
  let logger: Logger = createConsoleLogger(pluginName, debugNamespace);
  let pendingOpen: boolean | string | undefined;
  const watchedPaths = new Set<string>();
  let gitWatchers: FSWatcher[] = [];
  let watchedGitDir: string | undefined;

  const withTrailingSlash = (value: string): string =>
    value.endsWith('/') ? value : `${value}/`;

  const ensurePreviewRoot = async (): Promise<void> => {
    if (!useTempPreviewRoot || previewRoot) {
      return;
    }
    const baseDir = options.previewRootBaseDir
      ? resolve(options.previewRootBaseDir)
      : defaultPreviewRootBaseDir;
    await mkdir(baseDir, { recursive: true });
    previewRoot = await mkdtemp(join(baseDir, 'atr-preview-'));
    previewRootCreated = true;
    previewOutDir = join(previewRoot, previewOutDirName);
  };

  const shouldHandle = (filePath: string): boolean => {
    const resolved = resolve(filePath);
    return (
      isWithinDir(resolved, docsDir) ||
      isWithinDir(resolved, templatesDir) ||
      resolved === configPath
    );
  };

  const updateWatchTargets = (targets: string[]) => {
    if (!server) {
      return;
    }
    const uniqueTargets = Array.from(new Set(targets));
    const toAdd = uniqueTargets.filter((target) => !watchedPaths.has(target));
    if (toAdd.length > 0) {
      server.watcher.add(toAdd);
      for (const target of toAdd) {
        watchedPaths.add(target);
      }
    }
  };

  const closeGitWatchers = () => {
    for (const watcher of gitWatchers) {
      watcher.close();
    }
    gitWatchers = [];
    watchedGitDir = undefined;
  };

  const updateGitWatchTargets = async (
    targetDocsDir: string,
    enableGitMetadata: boolean
  ): Promise<void> => {
    if (!enableGitMetadata) {
      closeGitWatchers();
      return;
    }

    const gitDir = await resolveGitDir(targetDocsDir);
    if (!gitDir) {
      closeGitWatchers();
      return;
    }
    if (gitDir === watchedGitDir) {
      return;
    }

    closeGitWatchers();

    const targets = await collectGitWatchTargets(gitDir);
    for (const target of targets) {
      try {
        gitWatchers.push(
          watch(target, { persistent: true }, () => {
            scheduleGenerate();
          })
        );
      } catch {
        logger.debug(`Failed to watch git metadata: ${target}`);
      }
    }
    watchedGitDir = gitDir;
  };

  const resolveRuntimeOptions =
    async (): Promise<ATerraForgeProcessingOptions> => {
      await ensurePreviewRoot();
      const baseConfig = await loadATerraForgeConfig(configPath);
      const resolvedConfig = mergeATerraForgeConfig(
        baseConfig,
        configOverrides,
        configPath
      );
      const variableOptions = resolveATerraForgeProcessingOptionsFromVariables(
        resolvedConfig.variables,
        dirname(configPath)
      );

      docsDir = variableOptions.docsDir ?? defaultDocsDir;
      templatesDir = variableOptions.templatesDir ?? defaultTemplatesDir;

      const outDir = previewOutDir ?? variableOptions.outDir ?? defaultOutDir;
      const cacheDir = variableOptions.cacheDir ?? defaultCacheDirResolved;
      const tmpDir = options.tmpDir
        ? resolve(options.tmpDir)
        : (variableOptions.tmpDir ?? defaultTmpDir);

      updateWatchTargets([docsDir, templatesDir, configPath]);
      await updateGitWatchTargets(
        docsDir,
        variableOptions.enableGitMetadata ?? true
      );

      return {
        docsDir,
        templatesDir,
        outDir,
        tmpDir,
        cacheDir,
        enableGitMetadata: variableOptions.enableGitMetadata ?? true,
        userAgent: variableOptions.userAgent,
        configPath,
      };
    };

  const openWhenReady = (): void => {
    const activeServer = server;
    if (!activeServer || pendingOpen === undefined) {
      return;
    }
    if (!activeServer.resolvedUrls) {
      setTimeout(openWhenReady, 50);
      return;
    }
    const openValue = pendingOpen;
    pendingOpen = undefined;
    activeServer.config.server.open = openValue;
    activeServer.openBrowser();
    activeServer.config.server.open = false;
  };

  const runGenerate = async (): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    let failed = false;

    try {
      const atrOptions = await resolveRuntimeOptions();
      atrOptions.logger = logger;
      await generateDocs(atrOptions, abortController.signal, configOverrides);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? (error.stack ?? '') : '';
      logger.error(message);
      server?.ws.send({
        type: 'error',
        err: {
          message,
          stack,
          plugin: pluginName,
        },
      });
    } finally {
      running = false;
    }

    if (queued) {
      queued = false;
      await runGenerate();
      return;
    }

    const activeServer = server;
    if (!failed && activeServer) {
      if (activeServer.config.server.hmr !== false) {
        activeServer.ws.send({ type: 'full-reload' });
      }
      openWhenReady();
    }
  };

  const scheduleGenerate = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void runGenerate();
    }, 100);
  };

  return {
    name: pluginName,
    apply: 'serve',
    async config(_config, env) {
      if (env.command !== 'serve' || !useTempPreviewRoot) {
        return;
      }
      await ensurePreviewRoot();
      if (!previewRoot) {
        return;
      }
      return {
        root: previewRoot,
      };
    },
    async configureServer(devServer) {
      server = devServer;
      if (!options.configPath && !useTempPreviewRoot) {
        configPath = resolveATerraForgeConfigPathFromDir(devServer.config.root);
      }
      const viteLogger =
        devServer.config.customLogger ?? devServer.config.logger;
      await ensurePreviewRoot();
      logger = createViteLoggerAdapter(
        viteLogger,
        devServer.config.logLevel ?? 'info',
        pluginName,
        debugNamespace
      );
      logger.info(`a-terra-forge - ${description}`);
      logger.info(`Copyright (c) ${author}`);
      logger.info(`License under ${license}`);
      logger.info(repository_url);
      logger.info(`[${version}-${git_commit_hash}] Started.`);
      if (useTempPreviewRoot && previewRoot) {
        logger.info(`Served on: ${withTrailingSlash(previewRoot)}`);
      }
      if (devServer.config.server.open) {
        pendingOpen = devServer.config.server.open;
        devServer.config.server.open = false;
      }

      if (useTempPreviewRoot) {
        devServer.middlewares.use(
          createPreviewPathRewriteMiddleware(previewOutDirName)
        );
      }
      devServer.middlewares.use(
        createPreviewHtmlNotFoundMiddleware(devServer.config.root)
      );
      updateWatchTargets([docsDir, templatesDir, configPath]);
      devServer.httpServer?.on('close', () => {
        closeGitWatchers();
        if (previewRootCreated && previewRoot) {
          void rm(previewRoot, { recursive: true, force: true });
        }
      });
      devServer.watcher.on('all', (_event, filePath) => {
        if (shouldHandle(filePath)) {
          scheduleGenerate();
        }
      });
      scheduleGenerate();
    },
  };
};
