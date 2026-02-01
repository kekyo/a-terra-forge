// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { realpathSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { Command, Option } from 'commander';

import {
  name,
  version,
  description,
  git_commit_hash,
  repository_url,
  license,
  author,
} from './generated/packageMetadata';
import { generateDocs } from './process';
import { initScaffold } from './init';
import { createNewArticle } from './new';
import type {
  ATerraForgeConfigOverrides,
  ATerraForgeProcessingOptions,
} from './types';
import {
  type ConsoleLogLevel,
  defaultAssetDir,
  defaultCacheDir,
  defaultDocsDir,
  defaultOutDir,
  defaultTemplatesDir,
  defaultTmpDir,
  getTrimmingConsoleLogger,
  loadATerraForgeConfig,
  resolveATerraForgeConfigPathFromDir,
  resolveATerraForgeProcessingOptionsFromVariables,
  toPosixRelativePath,
} from './utils';

///////////////////////////////////////////////////////////////////////////////////

const program = new Command('atr');
program.version(version);
program.summary(description);

const resolveCliPath = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return resolve(trimmed);
};

type BuildCliOptions = {
  docs?: string;
  templates?: string;
  assets?: string;
  out?: string;
  temp?: string;
  cache?: string;
  baseUrl?: string;
  config?: string;
  log?: ConsoleLogLevel;
};

type NewCliOptions = {
  config?: string;
  log?: ConsoleLogLevel;
};

const logLevelChoices: ConsoleLogLevel[] = [
  'silent',
  'error',
  'warn',
  'info',
  'debug',
];

const resolveLogLevel = (value: unknown): ConsoleLogLevel => {
  if (typeof value === 'string' && logLevelChoices.includes(value as any)) {
    return value as ConsoleLogLevel;
  }
  return 'info';
};

const resolveBuildOptions = async (
  opts: BuildCliOptions
): Promise<ATerraForgeProcessingOptions> => {
  const configPath = opts.config
    ? resolve(opts.config)
    : resolveATerraForgeConfigPathFromDir(process.cwd());
  const config = await loadATerraForgeConfig(configPath);
  const variableOptions = resolveATerraForgeProcessingOptionsFromVariables(
    config.variables,
    dirname(configPath)
  );
  const configDir = dirname(configPath);
  const defaultDocsDirResolved = resolve(configDir, defaultDocsDir);
  const defaultTemplatesDirResolved = resolve(configDir, defaultTemplatesDir);
  const defaultAssetsDirResolved = resolve(configDir, defaultAssetDir);
  const defaultOutDirResolved = resolve(configDir, defaultOutDir);
  const defaultTmpDirResolved = resolve(configDir, defaultTmpDir);
  const defaultCacheDirResolved = resolve(configDir, defaultCacheDir);
  return {
    docsDir:
      resolveCliPath(opts.docs) ??
      variableOptions.docsDir ??
      defaultDocsDirResolved,
    templatesDir:
      resolveCliPath(opts.templates) ??
      variableOptions.templatesDir ??
      defaultTemplatesDirResolved,
    assetsDir:
      resolveCliPath(opts.assets) ??
      variableOptions.assetsDir ??
      defaultAssetsDirResolved,
    outDir:
      resolveCliPath(opts.out) ??
      variableOptions.outDir ??
      defaultOutDirResolved,
    tmpDir:
      resolveCliPath(opts.temp) ??
      variableOptions.tmpDir ??
      defaultTmpDirResolved,
    cacheDir:
      resolveCliPath(opts.cache) ??
      variableOptions.cacheDir ??
      defaultCacheDirResolved,
    userAgent: variableOptions.userAgent,
    configPath,
  };
};

const resolveDocsDir = async (opts: NewCliOptions): Promise<string> => {
  const configPath = opts.config
    ? resolve(opts.config)
    : resolveATerraForgeConfigPathFromDir(process.cwd());
  const config = await loadATerraForgeConfig(configPath);
  const variableOptions = resolveATerraForgeProcessingOptionsFromVariables(
    config.variables,
    dirname(configPath)
  );
  return (
    variableOptions.docsDir ?? resolve(dirname(configPath), defaultDocsDir)
  );
};

const banner = () => {
  console.info(`atr [${version}-${git_commit_hash}]`);
  console.info(`${name} - ${description}`);
  console.info(`Copyright (c) ${author}`);
  console.info(`License under ${license}`);
  console.info(repository_url);
  console.info('');
};

const executedUrl = (() => {
  if (typeof process.argv[1] !== 'string') {
    return '';
  }
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return pathToFileURL(resolve(process.argv[1])).href;
  }
})();
const isDirectExecution = import.meta.url === executedUrl;

if (isDirectExecution) {
  const abortController = new AbortController();
  program
    .command('build', { isDefault: true })
    .summary('Build static site contents for deployment')
    .addOption(new Option('-d, --docs <dir>', 'Markdown document directory'))
    .addOption(new Option('-t, --templates <dir>', 'Template directory'))
    .addOption(new Option('-a, --assets <dir>', 'Asset directory'))
    .addOption(new Option('-o, --out <dir>', 'Output directory'))
    .addOption(new Option('--temp <dir>', 'Temporary working directory'))
    .addOption(new Option('--cache <dir>', 'Cache directory'))
    .addOption(new Option('--base-url <url>', 'Override baseUrl variable'))
    .addOption(
      new Option('--log <level>', 'Log level').choices(logLevelChoices)
    )
    .addOption(
      new Option(
        '-c, --config <path>',
        'Config file path (atr.json5 / atr.jsonc / atr.json)'
      )
    )
    .action(async (opts: BuildCliOptions) => {
      banner();
      const options = await resolveBuildOptions(opts);
      const logLevel = resolveLogLevel(opts.log);
      const baseUrlOverride =
        typeof opts.baseUrl === 'string' ? opts.baseUrl.trim() : '';
      const overrides: ATerraForgeConfigOverrides | undefined =
        baseUrlOverride.length > 0
          ? {
              variables: new Map([['baseUrl', baseUrlOverride]]),
            }
          : undefined;
      await generateDocs(
        {
          ...options,
          logger: getTrimmingConsoleLogger(logLevel),
        },
        abortController.signal,
        overrides
      );
    });

  program
    .command('init')
    .summary('Initialize a new atr scaffold in the current directory')
    .addOption(
      new Option('--target <dir>', 'Target directory to scaffold into')
    )
    .addOption(new Option('--no-vite', 'Skip Vite scaffold files'))
    .addOption(new Option('-f, --force', 'Overwrite existing files'))
    .addOption(
      new Option('--log <level>', 'Log level').choices(logLevelChoices)
    )
    .action(
      async (opts: {
        target?: string;
        vite?: boolean;
        force?: boolean;
        log?: ConsoleLogLevel;
      }) => {
        banner();
        const logLevel = resolveLogLevel(opts.log);
        await initScaffold({
          targetDir: opts.target ? resolve(opts.target) : process.cwd(),
          includeVite: opts.vite ?? true,
          force: opts.force ?? false,
          logger: getTrimmingConsoleLogger(logLevel),
        });
      }
    );

  program
    .command('new')
    .summary('Create a new markdown article')
    .argument('<category>', 'Category path (e.g. hello or hello/world)')
    .addOption(
      new Option(
        '-c, --config <path>',
        'Config file path (atr.json5/atr.jsonc/atr.json)'
      )
    )
    .addOption(
      new Option('--log <level>', 'Log level').choices(logLevelChoices)
    )
    .action(async (category: string, opts: NewCliOptions) => {
      banner();
      const logLevel = resolveLogLevel(opts.log);
      const docsDir = await resolveDocsDir(opts);
      const logger = getTrimmingConsoleLogger(logLevel);
      const result = await createNewArticle({ docsDir, category });
      const relativePath = toPosixRelativePath(docsDir, result.path);
      logger.info(`New article created: ${relativePath}`);
    });

  program.parseAsync(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
