// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { rmSync, statSync, watch, type FSWatcher } from 'fs';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
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
  defaultCacheDir,
  defaultAssetDir,
  defaultDocsDir,
  defaultTemplatesDir,
  defaultTmpDir,
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
  /** Temporary working directory base (defaults to the system temp directory when omitted). */
  tmpDir?: string;
  /** Base directory for temporary preview root (defaults to `$TEMP/atr-preview/`). */
  previewBaseDir?: string;
  /** Additional watch targets (mainly for atr development). */
  watchInclude?: string[];
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

const resolvePreviewBaseDir = (options: ATerraForgeVitePluginOptions): string =>
  resolve(options.previewBaseDir ?? join(tmpdir(), 'atr-preview'));

const getNewPreviewRootDir = async (previewBaseDir: string) => {
  await mkdir(previewBaseDir, { recursive: true });
  const previewRootDir = await mkdtemp(join(previewBaseDir, `dist-`));
  return previewRootDir;
};

let runningProcessor = false;
let queuedProcessorRequest = false;

/**
 * a-terra-forge preview plugin for Vite.
 * @param options - a-terra-forge options.
 * @returns Vite plugin instance.
 */
export const atrPreview = (
  options: ATerraForgeVitePluginOptions = {}
): Plugin => {
  const previewRootBaseDir = resolvePreviewBaseDir(options);

  let configPath = resolveConfigPath(options.configPath, process.cwd());
  let configDir = dirname(configPath);
  const resolveDefaultDirs = (baseDir: string) => ({
    docsDir: resolve(baseDir, defaultDocsDir),
    templatesDir: resolve(baseDir, defaultTemplatesDir),
    assetsDir: resolve(baseDir, defaultAssetDir),
    cacheDir: resolve(baseDir, defaultCacheDir),
    tmpDir: resolve(baseDir, defaultTmpDir),
  });
  const configOverrides: ATerraForgeConfigOverrides =
    parseATerraForgeConfigOverrides(options, configPath);
  let { docsDir, templatesDir, assetsDir } = resolveDefaultDirs(configDir);

  // Current serving preview directory.
  let activePreviewRootDir: string | undefined;

  const pluginName = `atr-vite`;
  const abortController = new AbortController();
  const debugNamespace = `vite:plugin:${pluginName}`;
  let projectRoot = process.cwd();
  let extraWatchDirs: string[] = [];
  let extraWatchFiles: string[] = [];

  let timer: NodeJS.Timeout | undefined;
  let logger: Logger = createConsoleLogger(pluginName, debugNamespace);
  let pendingOpen: boolean | string | undefined;
  const watchedPaths = new Set<string>();
  let gitWatchers: FSWatcher[] = [];
  let watchedGitDir: string | undefined;
  const allowedRecursiveDirs = new Set<string>();
  const allowedExactPaths = new Set<string>();

  const withTrailingSlash = (value: string): string =>
    value.endsWith('/') ? value : `${value}/`;

  const resolveServerBaseUrl = (): string => {
    const resolved = server?.resolvedUrls?.local?.[0];
    if (typeof resolved === 'string' && resolved.length > 0) {
      return withTrailingSlash(resolved);
    }
    if (!server) {
      return 'http://localhost/';
    }
    const protocol = server.config.server.https ? 'https' : 'http';
    let host = server.config.server.host;
    if (host === true || host === undefined || host === null) {
      host = 'localhost';
    }
    if (host === '0.0.0.0' || host === '::') {
      host = 'localhost';
    }
    const hostname =
      typeof host === 'string' && host.trim().length > 0 ? host : 'localhost';
    const port = server.config.server.port ?? 5173;
    return `${protocol}://${hostname}:${port}/`;
  };

  const buildRuntimeOverrides = (
    baseUrl: string
  ): ATerraForgeConfigOverrides => {
    const nextVariables = new Map(configOverrides.variables ?? []);
    nextVariables.set('baseUrl', baseUrl);
    return {
      ...configOverrides,
      variables: nextVariables,
    };
  };

  const resolvePreviewOutDirName = (): string =>
    activePreviewRootDir ? basename(activePreviewRootDir) : '';

  const updateWatchAllowList = (
    nextConfigDir: string,
    recursiveDirs: string[],
    exactPaths: string[]
  ): void => {
    configDir = resolve(nextConfigDir);
    allowedRecursiveDirs.clear();
    for (const dir of recursiveDirs) {
      allowedRecursiveDirs.add(resolve(dir));
    }
    allowedExactPaths.clear();
    for (const target of exactPaths) {
      allowedExactPaths.add(resolve(target));
    }
  };

  const isAllowedWatchPath = (filePath: string): boolean => {
    const resolved = resolve(filePath);
    if (resolved === configDir || dirname(resolved) === configDir) {
      return true;
    }
    if (allowedExactPaths.has(resolved)) {
      return true;
    }
    for (const dir of allowedRecursiveDirs) {
      if (isWithinDir(resolved, dir)) {
        return true;
      }
    }
    return false;
  };

  const resolveWatchIncludePaths = (baseDir: string): void => {
    const rawInclude = options.watchInclude ?? [];
    const nextDirs: string[] = [];
    const nextFiles: string[] = [];
    for (const target of rawInclude) {
      const resolvedTarget = resolve(baseDir, target);
      try {
        const stat = statSync(resolvedTarget);
        if (stat.isDirectory()) {
          nextDirs.push(resolvedTarget);
        } else {
          nextFiles.push(resolvedTarget);
        }
      } catch {
        nextFiles.push(resolvedTarget);
      }
    }
    extraWatchDirs = Array.from(new Set(nextDirs));
    extraWatchFiles = Array.from(new Set(nextFiles));
  };

  resolveWatchIncludePaths(projectRoot);
  updateWatchAllowList(
    configDir,
    [docsDir, templatesDir, assetsDir, ...extraWatchDirs],
    extraWatchFiles
  );

  const shouldHandle = (filePath: string): boolean => {
    const resolved = resolve(filePath);
    return (
      isWithinDir(resolved, docsDir) ||
      isWithinDir(resolved, templatesDir) ||
      isWithinDir(resolved, assetsDir) ||
      resolved === configPath
    );
  };

  let server: ViteDevServer | undefined;
  const updateWatchTargets = (targets: string[]) => {
    if (!server) {
      return;
    }
    const normalizedTargets = Array.from(
      new Set(targets.map((target) => resolve(target)))
    );
    const nextTargets = new Set(normalizedTargets);
    const toRemove = Array.from(watchedPaths).filter(
      (target) => !nextTargets.has(target)
    );
    if (toRemove.length > 0) {
      server.watcher.unwatch(toRemove);
      for (const target of toRemove) {
        watchedPaths.delete(target);
      }
    }
    const toAdd = normalizedTargets.filter(
      (target) => !watchedPaths.has(target)
    );
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
    targetDocsDir: string
  ): Promise<void> => {
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

  const resolveRuntimeOptions = async (
    outDir: string
  ): Promise<ATerraForgeProcessingOptions> => {
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
    const defaults = resolveDefaultDirs(dirname(configPath));

    docsDir = variableOptions.docsDir ?? defaults.docsDir;
    templatesDir = variableOptions.templatesDir ?? defaults.templatesDir;
    assetsDir = variableOptions.assetsDir ?? defaults.assetsDir;

    const cacheDir = variableOptions.cacheDir ?? defaults.cacheDir;
    const tmpDir = options.tmpDir
      ? resolve(options.tmpDir)
      : (variableOptions.tmpDir ?? defaults.tmpDir);

    updateWatchAllowList(
      dirname(configPath),
      [docsDir, templatesDir, assetsDir, ...extraWatchDirs],
      extraWatchFiles
    );
    updateWatchTargets([
      configDir,
      docsDir,
      templatesDir,
      assetsDir,
      ...extraWatchDirs,
      ...extraWatchFiles,
    ]);
    await updateGitWatchTargets(docsDir);

    return {
      docsDir,
      templatesDir,
      assetsDir,
      outDir,
      tmpDir,
      cacheDir,
      userAgent: variableOptions.userAgent,
      configPath,
    };
  };

  const openBrowserWhenReady = () => {
    const activeServer = server;
    if (!activeServer || pendingOpen === undefined) {
      return;
    }
    if (!activeServer.resolvedUrls) {
      setTimeout(openBrowserWhenReady, 100);
      return;
    }

    const openValue = pendingOpen;
    pendingOpen = undefined;
    activeServer.config.server.open = openValue;
    activeServer.openBrowser();
    activeServer.config.server.open = false;
  };

  // Remove preview root directory.
  const removePreviewRootDir = async (previewRootDir: string) => {
    try {
      await rm(previewRootDir, { recursive: true, force: true });
    } catch {
      // Ignore it.
    }
  };

  // Generate preview contents
  const runGenerate = async (): Promise<void> => {
    // Schedule delayed runner when already running
    if (runningProcessor) {
      queuedProcessorRequest = true;
      return;
    }

    runningProcessor = true;
    let failed = false;

    // Create next preview root directory.
    const nextPreviewRootDir = await getNewPreviewRootDir(previewRootBaseDir);
    logger.debug(`Building on: ${withTrailingSlash(nextPreviewRootDir)}`);

    // Generate overall contents into preview root directory.
    try {
      const atrOptions = await resolveRuntimeOptions(nextPreviewRootDir);
      atrOptions.logger = logger;
      const runtimeOverrides = buildRuntimeOverrides(resolveServerBaseUrl());
      await generateDocs(atrOptions, abortController.signal, runtimeOverrides);
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
      runningProcessor = false;
    }

    // Retry when scheduled.
    if (queuedProcessorRequest) {
      queuedProcessorRequest = false;
      await Promise.all([
        removePreviewRootDir(nextPreviewRootDir), // Cancel it.
        runGenerate(),
      ]);
      return;
    }

    const activeServer = server;
    if (!failed && activeServer) {
      // Swap new preview directory.
      const oldPreviewRootDir = activePreviewRootDir;
      activePreviewRootDir = nextPreviewRootDir;

      // Remove old preview directory.
      if (oldPreviewRootDir) {
        await removePreviewRootDir(oldPreviewRootDir);
      }

      // Try to open browser.
      openBrowserWhenReady();

      if (activeServer.config.server.hmr !== false) {
        activeServer.ws.send({ type: 'full-reload' });
      }
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

  // Preserve preview root directory (may not contains any contents)
  const preservePreviewRootDir = async () => {
    if (!activePreviewRootDir) {
      activePreviewRootDir = await getNewPreviewRootDir(previewRootBaseDir);
    }
  };

  // Clean up (sync)
  const cleanSync = (): void => {
    closeGitWatchers();
    if (activePreviewRootDir) {
      try {
        rmSync(activePreviewRootDir, { recursive: true, force: true });
      } catch {
        // Ignore it.
      }
      activePreviewRootDir = undefined;
    }
  };

  // Hook exit handlers.
  process.once('exit', () => cleanSync());
  process.once('SIGINT', () => {
    cleanSync();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    cleanSync();
    process.exit(1);
  });

  return {
    name: pluginName,
    apply: 'serve',
    config: async (_config, env) => {
      if (env.command !== 'serve') {
        return;
      }
      projectRoot = resolve(_config.root ?? process.cwd());
      resolveWatchIncludePaths(projectRoot);
      await preservePreviewRootDir();
      return {
        root: previewRootBaseDir,
        server: {
          watch: {
            ignored: (filePath: string) => !isAllowedWatchPath(filePath),
          },
        },
      };
    },
    configureServer: async (devServer) => {
      server = devServer;
      if (!options.configPath) {
        configPath = resolveATerraForgeConfigPathFromDir(projectRoot);
      }
      const defaults = resolveDefaultDirs(dirname(configPath));
      docsDir = defaults.docsDir;
      templatesDir = defaults.templatesDir;
      assetsDir = defaults.assetsDir;
      resolveWatchIncludePaths(projectRoot);
      updateWatchAllowList(
        dirname(configPath),
        [docsDir, templatesDir, assetsDir, ...extraWatchDirs],
        extraWatchFiles
      );
      const viteLogger =
        devServer.config.customLogger ?? devServer.config.logger;

      await preservePreviewRootDir();

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

      if (devServer.config.server.open) {
        pendingOpen = devServer.config.server.open;
        devServer.config.server.open = false;
      }

      devServer.middlewares.use(
        createPreviewPathRewriteMiddleware(resolvePreviewOutDirName)
      );
      devServer.middlewares.use(
        createPreviewHtmlNotFoundMiddleware(devServer.config.root)
      );

      updateWatchTargets([
        configDir,
        docsDir,
        templatesDir,
        assetsDir,
        ...extraWatchDirs,
        ...extraWatchFiles,
      ]);

      // Hook exit handlers.
      devServer.httpServer?.on('close', () => cleanSync());

      devServer.watcher.on('all', (_event, filePath) => {
        if (shouldHandle(filePath)) {
          scheduleGenerate();
        }
      });
      scheduleGenerate();
    },
  };
};
