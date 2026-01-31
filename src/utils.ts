// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { existsSync } from 'fs';
import {
  mkdir,
  readdir,
  stat,
  copyFile,
  writeFile,
  unlink,
  rename,
  readFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'path';
import JSON5 from 'json5';
import { glob } from 'glob';
import {
  getConsoleLogger,
  type BeautifulMermaidPluginOptions,
  type CodeHighlightOptions,
  type CodeHighlightThemeConfig,
} from 'mark-deco';
import type { FunCityVariables } from 'funcity';

import { name } from './generated/packageMetadata';
import type {
  Logger,
  ATerraForgeConfig,
  ATerraForgeConfigInput,
  ATerraForgeConfigOverrides,
  ATerraForgeMessageList,
  ATerraForgeMessageListByLocale,
  ATerraForgeProcessingOptions,
} from './types';

//////////////////////////////////////////////////////////////////////////////

export type ConsoleLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

export const getTrimmingConsoleLogger = (
  logLevel: ConsoleLogLevel = 'info'
): Logger => {
  const cl = getConsoleLogger();
  const levelRank: Record<ConsoleLogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
  };
  const currentLevel = levelRank[logLevel] ?? levelRank.info;
  const produced = new Set<string>();
  const isProduced = (level: string, message: string) => {
    const m = `${level}:${message}`;
    if (!produced.has(m)) {
      produced.add(m);
      return true;
    }
    return false;
  };
  return {
    debug: (message: string) => {
      if (currentLevel >= levelRank.debug && isProduced('debug', message)) {
        cl.debug(`debug: ${message}`);
      }
    },
    info: (message: string) => {
      if (currentLevel >= levelRank.info && isProduced('info', message)) {
        cl.info(message);
      }
    },
    warn: (message: string) => {
      if (currentLevel >= levelRank.warn && isProduced('warn', message)) {
        cl.warn(`warning: ${message}`);
      }
    },
    error: (message: string) => {
      if (currentLevel >= levelRank.error && isProduced('error', message)) {
        cl.error(`error: ${message}`);
      }
    },
  };
};

export const toSafeId = (value: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'id';
};

export const toPosixRelativePath = (from: string, to: string): string => {
  const r = relative(from, to);
  return r.split(sep).join('/');
};

export const adjustPath = (
  path: string,
  fromBasePath: string,
  toBasePath: string
): string => {
  const resolvedPath = isAbsolute(path) ? path : resolve(fromBasePath, path);
  const relativePath = relative(fromBasePath, resolvedPath);
  return resolve(toBasePath, relativePath);
};

const isWithinDir = (filePath: string, dirPath: string): boolean => {
  const relativePath = relative(dirPath, filePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
};

export const resolveBuiltLogPath = (
  configDir: string,
  outputPath: string,
  outDir: string,
  finalOutDir: string
): string => {
  const resolvedConfigDir = resolve(configDir);
  const resolvedFinalOutDir = resolve(finalOutDir);
  const baseDir = isWithinDir(resolvedFinalOutDir, resolvedConfigDir)
    ? resolvedConfigDir
    : dirname(resolvedFinalOutDir);
  const adjustedPath = adjustPath(outputPath, outDir, finalOutDir);
  return toPosixRelativePath(baseDir, adjustedPath);
};

const clampRgbValue = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

const parseRgbComponent = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.endsWith('%')) {
    const percentage = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(percentage)) {
      return undefined;
    }
    return clampRgbValue((percentage / 100) * 255);
  }
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return clampRgbValue(numeric);
};

const parseRgbTriple = (values: string[]): string | undefined => {
  if (values.length < 3) {
    return undefined;
  }
  const components = values.slice(0, 3).map(parseRgbComponent);
  if (components.some((component) => component === undefined)) {
    return undefined;
  }
  const [r, g, b] = components as number[];
  return `${r}, ${g}, ${b}`;
};

export const toRgbString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const rawTripleMatch = trimmed.match(
    /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/
  );
  if (rawTripleMatch) {
    return parseRgbTriple(rawTripleMatch.slice(1));
  }
  const rgbMatch = trimmed.match(/^rgba?\((.+)\)$/i);
  if (rgbMatch) {
    const withoutAlpha = rgbMatch[1]!.split('/')[0] ?? '';
    const parts = withoutAlpha.split(/[\s,]+/).filter(Boolean);
    return parseRgbTriple(parts);
  }
  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i);
  if (!hexMatch) {
    return undefined;
  }
  const hex = hexMatch[1]!;
  const expanded =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split('')
          .map((char) => char + char)
          .join('')
      : hex.slice(0, 6);
  if (expanded.length !== 6) {
    return undefined;
  }
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) {
    return undefined;
  }
  return `${r}, ${g}, ${b}`;
};

export const assertDirectoryExists = async (
  dirPath: string,
  label: string
): Promise<void> => {
  try {
    const result = await stat(dirPath);
    if (!result.isDirectory()) {
      throw new Error(`${label} directory is not found: ${dirPath}`);
    }
  } catch (error) {
    throw new Error(`${label} directory is not found: ${dirPath}`);
  }
};

const normalizeGlobPattern = (pattern: string): string => {
  const trimmed = pattern.trim();
  const withoutDot =
    trimmed.startsWith('./') || trimmed.startsWith('.\\')
      ? trimmed.slice(2)
      : trimmed;
  return withoutDot.replaceAll('\\', '/');
};

export const copyTargetContentFiles = async (
  fromDir: string,
  patterns: readonly string[],
  toDir: string,
  options?: {
    rewritePath?: (relativePath: string) => string;
    detectDuplicates?: boolean;
  }
) => {
  if (patterns.length === 0) {
    return [];
  }

  const normalizedPatterns = patterns
    .map(normalizeGlobPattern)
    .filter((pattern) => pattern.length > 0);

  if (normalizedPatterns.length === 0) {
    return [];
  }

  const matchedFiles = await glob(normalizedPatterns, {
    cwd: fromDir,
    nodir: true,
    follow: false,
    posix: true,
  });
  const uniqueMatchedFiles = Array.from(new Set(matchedFiles));
  const rewritePath = options?.rewritePath;
  const detectDuplicates = options?.detectDuplicates ?? false;
  const targetMap = detectDuplicates ? new Map<string, string>() : undefined;

  return await Promise.all(
    uniqueMatchedFiles.map(async (relativePath) => {
      const rewrittenPath = rewritePath
        ? rewritePath(relativePath)
        : relativePath;
      const normalizedPath = rewrittenPath.replaceAll('\\', '/');
      if (detectDuplicates && targetMap) {
        const existing = targetMap.get(normalizedPath);
        if (existing) {
          throw new Error(
            `Content file collision for "${normalizedPath}": "${existing}" and "${relativePath}"`
          );
        }
        targetMap.set(normalizedPath, relativePath);
      }
      const from = resolve(fromDir, relativePath);
      const to = resolve(toDir, normalizedPath);
      try {
        await mkdir(dirname(to), { recursive: true });
        await copyFile(from, to);
        return true;
      } catch {
        return false;
      }
    })
  );
};

export const writeContentFile = async (path: string, content: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + '.tmp', content, 'utf8');
  try {
    if (existsSync(path)) {
      await unlink(path);
    }
  } catch (e: unknown) {
    await unlink(path + '.tmp');
    throw e;
  }
  await rename(path + '.tmp', path);
};

export const buildDirectoryDestinationPath = (
  outDir: string,
  relativeDir: string
): string => {
  const normalizedDir = normalize(relativeDir);
  if (normalizedDir === '' || normalizedDir === '.') {
    return join(outDir, 'index.html');
  }
  return join(outDir, normalizedDir, 'index.html');
};

//////////////////////////////////////////////////////////////////////////////

export const collectArticleFiles = async (
  dir: string,
  ext: string
): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectArticleFiles(fullPath, ext);
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
        return [fullPath];
      }
      return [];
    })
  );

  return files.flat();
};

export interface ArticleFileInfo {
  absolutePath: string;
  relativePath: string;
  directory: string;
}

export const groupArticleFilesByDirectory = (
  articleFilePaths: readonly string[],
  docsDir: string
): ReadonlyMap<string, ArticleFileInfo[]> => {
  const groupedArticleFiles = new Map<string, ArticleFileInfo[]>();

  for (const articleFilePath of articleFilePaths) {
    const articleFileRelativePath = relative(docsDir, articleFilePath);
    const articleFileDir = dirname(articleFileRelativePath);

    const filesInDirectory = groupedArticleFiles.get(articleFileDir) ?? [];
    filesInDirectory.push({
      absolutePath: articleFilePath,
      relativePath: articleFileRelativePath,
      directory: articleFileDir,
    });
    groupedArticleFiles.set(articleFileDir, filesInDirectory);
  }

  for (const articleFiles of groupedArticleFiles.values()) {
    articleFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  return groupedArticleFiles;
};

//////////////////////////////////////////////////////////////////////////////

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const defaultTargetContents = ['./**/*.png', './**/*.jpg'] as const;
export const defaultDocsDir = 'docs' as const;
export const defaultTemplatesDir = 'templates' as const;
export const defaultOutDir = 'dist' as const;
export const defaultAssetDir = 'assets/' as const;
export const defaultTmpDir = tmpdir();
export const defaultCacheDir = process.env.HOME
  ? join(process.env.HOME, '.cache', name)
  : join('.cache', name);
const defaultCodeHighlightConfig: CodeHighlightOptions = {};

const recordToMap = (value: Record<string, unknown>): Map<string, unknown> => {
  const map = new Map<string, unknown>();
  for (const key of Object.keys(value)) {
    map.set(key, value[key]);
  }
  return map;
};

const recordToMapSkippingUndefined = (
  value: Record<string, unknown>
): Map<string, unknown> => {
  const map = new Map<string, unknown>();
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (entry !== undefined) {
      map.set(key, entry);
    }
  }
  return map;
};

const buildMessageList = (
  value: Record<string, unknown>
): ATerraForgeMessageList => {
  const map = new Map<string, string>();
  for (const key of Object.keys(value)) {
    map.set(key, String(value[key]));
  }
  return map;
};

const buildMessageListByLocale = (
  value: Record<string, unknown>,
  configPath: string
): ATerraForgeMessageListByLocale => {
  const map = new Map<string, ATerraForgeMessageList>();
  const keys = Object.keys(value);
  const isFlatList =
    keys.length > 0 && keys.every((key) => !isRecord(value[key]));
  if (isFlatList) {
    map.set('', buildMessageList(value));
    return map;
  }
  for (const locale of keys) {
    const messages = value[locale];
    if (!isRecord(messages)) {
      throw new Error(
        `"${locale}" in "messages" must be an object: ${configPath}`
      );
    }
    map.set(locale, buildMessageList(messages));
  }
  return map;
};

const parseStringList = (
  value: unknown,
  configPath: string,
  label: string
): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(
      `"${label}" in atr.json must be an array of strings: ${configPath}`
    );
  }
  return value.map((item) => item.trim()).filter((item) => item.length > 0);
};

const parseStringMap = (
  value: unknown,
  configPath: string,
  label: string
): Record<string, string> => {
  if (!isRecord(value)) {
    throw new Error(`"${label}" in atr.json must be an object: ${configPath}`);
  }
  const parsed: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== 'string') {
      throw new Error(
        `"${label}.${key}" in atr.json must be a string: ${configPath}`
      );
    }
    const trimmedKey = key.trim();
    const trimmedValue = rawValue.trim();
    if (trimmedKey.length === 0 || trimmedValue.length === 0) {
      continue;
    }
    parsed[trimmedKey] = trimmedValue;
  }
  return parsed;
};

const parseCodeHighlightTheme = (
  value: unknown,
  configPath: string
): string | CodeHighlightThemeConfig | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (!isRecord(value)) {
    throw new Error(
      `"codeHighlight.theme" in atr.json must be a string or object: ${configPath}`
    );
  }
  const light = value.light;
  const dark = value.dark;
  if (light !== undefined && typeof light !== 'string') {
    throw new Error(
      `"codeHighlight.theme.light" in atr.json must be a string: ${configPath}`
    );
  }
  if (dark !== undefined && typeof dark !== 'string') {
    throw new Error(
      `"codeHighlight.theme.dark" in atr.json must be a string: ${configPath}`
    );
  }
  if (light === undefined && dark === undefined) {
    return undefined;
  }
  return {
    light,
    dark,
  };
};

const parseVariables = (
  value: unknown,
  configPath: string
): FunCityVariables => {
  if (value === undefined) {
    return new Map();
  }
  if (!isRecord(value)) {
    throw new Error(`"variables" in atr.json must be an object: ${configPath}`);
  }
  return recordToMap(value);
};

const parseVariablesOverrides = (
  value: unknown,
  configPath: string
): FunCityVariables | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`"variables" in atr.json must be an object: ${configPath}`);
  }
  return recordToMapSkippingUndefined(value);
};

const parseMessages = (
  value: unknown,
  configPath: string
): ATerraForgeMessageListByLocale => {
  if (value === undefined) {
    return new Map();
  }
  if (!isRecord(value)) {
    throw new Error(`"messages" in atr.json must be an object: ${configPath}`);
  }
  return buildMessageListByLocale(value, configPath);
};

const parseMessagesOverrides = (
  value: unknown,
  configPath: string
): ATerraForgeMessageListByLocale | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`"messages" in atr.json must be an object: ${configPath}`);
  }
  return buildMessageListByLocale(value, configPath);
};

const parseCodeHighlightConfig = (
  highlight: Record<string, unknown>,
  configPath: string
): CodeHighlightOptions => {
  const languages =
    highlight.languages === undefined
      ? []
      : parseStringList(
          highlight.languages,
          configPath,
          'codeHighlight.languages'
        );

  const languageAliasesFromConfig =
    highlight.languageAliases === undefined
      ? {}
      : parseStringMap(
          highlight.languageAliases,
          configPath,
          'codeHighlight.languageAliases'
        );

  const languageAliases =
    languages.length > 0
      ? {
          ...languageAliasesFromConfig,
          ...Object.fromEntries(
            languages.map((language) => [language, language])
          ),
        }
      : languageAliasesFromConfig;

  const theme = parseCodeHighlightTheme(highlight.theme, configPath);

  const lineNumbers = highlight.lineNumbers;
  if (lineNumbers !== undefined && typeof lineNumbers !== 'boolean') {
    throw new Error(
      `"codeHighlight.lineNumbers" in atr.json must be a boolean: ${configPath}`
    );
  }

  const defaultLanguage = highlight.defaultLanguage;
  if (defaultLanguage !== undefined && typeof defaultLanguage !== 'string') {
    throw new Error(
      `"codeHighlight.defaultLanguage" in atr.json must be a string: ${configPath}`
    );
  }

  return {
    languageAliases,
    theme,
    lineNumbers,
    defaultLanguage,
  };
};

const parseCodeHighlight = (
  value: unknown,
  configPath: string
): CodeHighlightOptions => {
  if (value === undefined) {
    return defaultCodeHighlightConfig;
  }
  if (!isRecord(value)) {
    throw new Error(
      `"codeHighlight" in atr.json must be an object: ${configPath}`
    );
  }
  return parseCodeHighlightConfig(value, configPath);
};

const resolveCodeHighlightInput = (
  explicitValue: unknown,
  variables: FunCityVariables | undefined
): unknown =>
  explicitValue !== undefined ? explicitValue : variables?.get('codeHighlight');

const parseCodeHighlightOverrides = (
  value: unknown,
  configPath: string
): CodeHighlightOptions | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(
      `"codeHighlight" in atr.json must be an object: ${configPath}`
    );
  }
  return parseCodeHighlightConfig(value, configPath);
};

const parseBeautifulMermaidOptions = (
  value: unknown,
  configPath: string
): BeautifulMermaidPluginOptions | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(
      `"beautiful-mermaid" in atr.json must be an object: ${configPath}`
    );
  }
  return value as BeautifulMermaidPluginOptions;
};

const parseBeautifulMermaidOverrides = (
  value: unknown,
  configPath: string
): BeautifulMermaidPluginOptions | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(
      `"beautiful-mermaid" in atr.json must be an object: ${configPath}`
    );
  }
  return value as BeautifulMermaidPluginOptions;
};

export const normalizeBeautifulMermaidOptions = (
  options: BeautifulMermaidPluginOptions | undefined
): BeautifulMermaidPluginOptions => {
  const { theme, themeMode, themeStrategy, cssVarPrefix, svgOptions, ...rest } =
    options ?? {};
  const normalizedSvgOptions = {
    ...(svgOptions ?? {}),
    padding: svgOptions?.padding ?? 2,
  };
  return {
    ...rest,
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    themeMode: 'auto',
    themeStrategy: 'css-vars',
    cssVarPrefix: '--mdc-bm',
    svgOptions: normalizedSvgOptions,
  };
};

const resolveVariableStringList = (
  variables: FunCityVariables,
  configPath: string,
  key: string,
  defaultValue: readonly string[]
): readonly string[] => {
  const value = variables.get(key);
  if (value === undefined) {
    return [...defaultValue];
  }
  return parseStringList(value, configPath, `variables.${key}`);
};

const normalizeVariablesWithLists = (
  variables: FunCityVariables,
  configPath: string
): Pick<
  ATerraForgeConfig,
  | 'variables'
  | 'contentFiles'
  | 'menuOrder'
  | 'afterMenuOrder'
  | 'blogCategories'
> => {
  const normalized = new Map(variables);
  const localeValue = normalized.get('locale');
  if (typeof localeValue !== 'string' || localeValue.trim().length === 0) {
    normalized.set('locale', 'en');
  }
  const normalizeDirectoryVariable = (
    key: string,
    defaultValue: string
  ): void => {
    const rawValue = normalized.get(key);
    if (rawValue === undefined || rawValue === null) {
      normalized.set(key, defaultValue);
      return;
    }
    if (typeof rawValue !== 'string') {
      throw new Error(`"${key}" in variables must be a string: ${configPath}`);
    }
    const trimmed = rawValue.trim();
    normalized.set(key, trimmed.length > 0 ? trimmed : defaultValue);
  };

  normalizeDirectoryVariable('docsDir', defaultDocsDir);
  normalizeDirectoryVariable('templatesDir', defaultTemplatesDir);
  normalizeDirectoryVariable('assetsDir', defaultAssetDir);
  normalizeDirectoryVariable('outDir', defaultOutDir);
  normalizeDirectoryVariable('tmpDir', defaultTmpDir);
  normalizeDirectoryVariable('cacheDir', defaultCacheDir);
  const contentFiles = resolveVariableStringList(
    normalized,
    configPath,
    'contentFiles',
    defaultTargetContents
  );
  const menuOrder = resolveVariableStringList(
    normalized,
    configPath,
    'menuOrder',
    []
  );
  const afterMenuOrder = resolveVariableStringList(
    normalized,
    configPath,
    'afterMenuOrder',
    []
  );
  const blogCategories = resolveVariableStringList(
    normalized,
    configPath,
    'blogCategories',
    []
  );

  normalized.set('contentFiles', contentFiles);
  normalized.set('menuOrder', menuOrder);
  normalized.set('afterMenuOrder', afterMenuOrder);
  normalized.set('blogCategories', blogCategories);

  return {
    variables: normalized,
    contentFiles,
    menuOrder,
    afterMenuOrder,
    blogCategories,
  };
};

const createDefaultATerraForgeConfig = (): ATerraForgeConfig => {
  const { variables, contentFiles, menuOrder, afterMenuOrder, blogCategories } =
    normalizeVariablesWithLists(new Map(), '<defaults>');

  return {
    variables,
    messages: new Map(),
    codeHighlight: defaultCodeHighlightConfig,
    beautifulMermaid: undefined,
    contentFiles,
    menuOrder,
    afterMenuOrder,
    blogCategories,
  };
};

const parseATerraForgeConfigObject = (
  parsed: Record<string, unknown>,
  configPath: string
): ATerraForgeConfig => {
  const parsedVariables = parseVariables(parsed.variables, configPath);
  const { variables, contentFiles, menuOrder, afterMenuOrder, blogCategories } =
    normalizeVariablesWithLists(parsedVariables, configPath);
  const codeHighlightInput = resolveCodeHighlightInput(
    parsed.codeHighlight,
    parsedVariables
  );

  return {
    variables,
    messages: parseMessages(parsed.messages, configPath),
    codeHighlight: parseCodeHighlight(codeHighlightInput, configPath),
    beautifulMermaid: parseBeautifulMermaidOptions(
      parsed['beautiful-mermaid'],
      configPath
    ),
    contentFiles,
    menuOrder,
    afterMenuOrder,
    blogCategories,
  };
};

export const parseATerraForgeConfigOverrides = (
  input: ATerraForgeConfigInput | undefined,
  configPath: string
): ATerraForgeConfigOverrides => {
  if (!input) {
    return {};
  }

  const overrides: ATerraForgeConfigOverrides = {};

  const parsedVariables =
    input.variables !== undefined
      ? parseVariablesOverrides(input.variables, configPath)
      : undefined;

  if (parsedVariables !== undefined) {
    overrides.variables = parsedVariables;
  }

  if (input.messages !== undefined) {
    overrides.messages = parseMessagesOverrides(input.messages, configPath);
  }

  const codeHighlightInput = resolveCodeHighlightInput(
    input.codeHighlight,
    parsedVariables
  );

  if (codeHighlightInput !== undefined) {
    overrides.codeHighlight = parseCodeHighlightOverrides(
      codeHighlightInput,
      configPath
    );
  }

  if (input['beautiful-mermaid'] !== undefined) {
    overrides.beautifulMermaid = parseBeautifulMermaidOverrides(
      input['beautiful-mermaid'],
      configPath
    );
  }

  return overrides;
};

export const mergeATerraForgeConfig = (
  baseConfig: ATerraForgeConfig,
  overrides: ATerraForgeConfigOverrides | undefined,
  configPath = '<config>'
): ATerraForgeConfig => {
  if (!overrides) {
    return baseConfig;
  }

  const variables = new Map(baseConfig.variables);
  if (overrides.variables) {
    for (const [key, value] of overrides.variables.entries()) {
      variables.set(key, value);
    }
  }

  const normalized = normalizeVariablesWithLists(variables, configPath);

  return {
    variables: normalized.variables,
    messages: overrides.messages ?? baseConfig.messages,
    codeHighlight: overrides.codeHighlight ?? baseConfig.codeHighlight,
    beautifulMermaid: overrides.beautifulMermaid ?? baseConfig.beautifulMermaid,
    contentFiles: normalized.contentFiles,
    menuOrder: normalized.menuOrder,
    afterMenuOrder: normalized.afterMenuOrder,
    blogCategories: normalized.blogCategories,
  };
};

const defaultConfigFileNames = ['atr.json5', 'atr.jsonc', 'atr.json'] as const;

export const resolveATerraForgeConfigPathFromDir = (
  configDir: string
): string => {
  const resolvedDir = resolve(configDir);
  for (const filename of defaultConfigFileNames) {
    const candidate = join(resolvedDir, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const fallbackName =
    defaultConfigFileNames[defaultConfigFileNames.length - 1] ?? 'atr.json';
  return join(resolvedDir, fallbackName);
};

export const loadATerraForgeConfig = async (
  configPath: string
): Promise<ATerraForgeConfig> => {
  try {
    const content = await readFile(configPath, 'utf8');
    const parsed = JSON5.parse<Record<string, unknown>>(content);

    if (!isRecord(parsed)) {
      throw new Error(`atr.json must be an object: ${configPath}`);
    }

    return parseATerraForgeConfigObject(parsed, configPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return createDefaultATerraForgeConfig();
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load atr.json (${configPath}): ${message}`);
  }
};

const getTrimmedStringValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getBooleanValue = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const resolveVariablePath = (
  variables: FunCityVariables,
  baseDir: string,
  key: string
): string | undefined => {
  const rawValue = variables.get(key);
  const trimmed = getTrimmedStringValue(rawValue);
  return trimmed ? resolve(baseDir, trimmed) : undefined;
};

type ProcessingDirKey =
  | 'docsDir'
  | 'templatesDir'
  | 'assetsDir'
  | 'outDir'
  | 'tmpDir'
  | 'cacheDir';

const applyResolvedDirOption = (
  target: Partial<ATerraForgeProcessingOptions>,
  variables: FunCityVariables,
  baseDir: string,
  key: ProcessingDirKey
): void => {
  const resolvedPath = resolveVariablePath(variables, baseDir, key);
  if (resolvedPath) {
    target[key] = resolvedPath;
  }
};

export const resolveATerraForgeProcessingOptionsFromVariables = (
  variables: FunCityVariables,
  baseDir: string
): Partial<ATerraForgeProcessingOptions> => {
  const resolved: Partial<ATerraForgeProcessingOptions> = {};

  applyResolvedDirOption(resolved, variables, baseDir, 'docsDir');
  applyResolvedDirOption(resolved, variables, baseDir, 'templatesDir');
  applyResolvedDirOption(resolved, variables, baseDir, 'assetsDir');
  applyResolvedDirOption(resolved, variables, baseDir, 'outDir');
  applyResolvedDirOption(resolved, variables, baseDir, 'tmpDir');
  applyResolvedDirOption(resolved, variables, baseDir, 'cacheDir');

  const userAgent = getTrimmedStringValue(variables.get('userAgent'));
  if (userAgent) {
    resolved.userAgent = userAgent;
  }

  const enableGitMetadata = getBooleanValue(variables.get('enableGitMetadata'));
  if (enableGitMetadata !== undefined) {
    resolved.enableGitMetadata = enableGitMetadata;
  }

  return resolved;
};
