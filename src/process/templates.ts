// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  convertToString,
  FunCityReducerError,
  outputErrors,
  runParser,
  runReducer,
  runTokenizer,
  type FunCityBlockNode,
  type FunCityLogEntry,
  type FunCityToken,
  type FunCityVariables,
  type FunCityWarningEntry,
} from 'funcity';

import { writeContentFile } from '../utils';

//////////////////////////////////////////////////////////////////////////////

/**
 * Cached parsed template artifacts.
 */
interface ParsedTemplateCacheEntry {
  readonly tokens: readonly FunCityToken[];
  readonly nodes: readonly FunCityBlockNode[];
  readonly logs: readonly FunCityLogEntry[];
}

/**
 * Cache for parsed FunCity templates.
 */
const parsedTemplateCache = new Map<string, ParsedTemplateCacheEntry>();

/**
 * Parse a template script into tokens and AST nodes with caching.
 */
const parseTemplate = (templateScript: string): ParsedTemplateCacheEntry => {
  const cached = parsedTemplateCache.get(templateScript);
  if (cached) {
    return cached;
  }
  const parseErrors: FunCityLogEntry[] = [];
  const tokens = runTokenizer(templateScript, parseErrors);
  const nodes = runParser(tokens, parseErrors);
  const parsed: ParsedTemplateCacheEntry = {
    tokens,
    nodes,
    logs: parseErrors,
  };
  parsedTemplateCache.set(templateScript, parsed);
  return parsed;
};

/**
 * Render a FunCity template with variables and collect logs.
 */
const renderFunCity = async (
  templateScript: string,
  variables: FunCityVariables,
  logs: FunCityLogEntry[],
  signal: AbortSignal
): Promise<string> => {
  const parsed = parseTemplate(templateScript);
  if (parsed.logs.length > 0) {
    logs.push(...parsed.logs);
  }
  if (logs.some((error) => error.type === 'error')) {
    return '';
  }

  const warningLogs: FunCityWarningEntry[] = [];
  try {
    const reducedList = await runReducer(
      parsed.nodes,
      variables,
      warningLogs,
      signal
    );
    logs.push(...warningLogs);
    const rendered = reducedList.map((r) => convertToString(r)).join('');
    return rendered;
  } catch (e: unknown) {
    if (e instanceof FunCityReducerError) {
      logs.push(...warningLogs);
      logs.push(e.info);
      return '';
    }
    throw e;
  }
};

/**
 * Render a template with import handling for nested includes.
 */
export const renderTemplateWithImportHandler = async (
  categoryIndexTemplatePath: string,
  templateScript: string,
  baseVariables: FunCityVariables,
  logs: FunCityLogEntry[],
  importStack: readonly string[],
  signal: AbortSignal
): Promise<string> => {
  const templateDir = dirname(categoryIndexTemplatePath);
  const importTemplate = async (arg0: unknown) => {
    const importPath = resolve(templateDir, String(arg0));
    if (importStack.includes(importPath)) {
      logs.push({
        type: 'error',
        description: `circular import detected: ${importPath}`,
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
      });
      return '';
    }
    const importScript = await readFile(importPath, 'utf8');
    return await renderTemplateWithImportHandler(
      importPath,
      importScript,
      baseVariables,
      logs,
      [...importStack, importPath],
      signal
    );
  };

  const variables = new Map(baseVariables);
  variables.set('import', importTemplate);

  const result = await renderFunCity(templateScript, variables, logs, signal);
  return result;
};

/**
 * Read a file if it exists, otherwise return undefined.
 */
export const readFileIfExists = async (
  filePath: string
): Promise<string | undefined> => {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

/**
 * Render an optional template file when it exists.
 */
export const renderOptionalTemplateFile = async (
  templatePath: string,
  outputPath: string,
  baseVariables: FunCityVariables,
  signal: AbortSignal
): Promise<void> => {
  const templateScript = await readFileIfExists(templatePath);
  if (templateScript === undefined) {
    return;
  }

  const logs: FunCityLogEntry[] = [];
  const rendered = await renderTemplateWithImportHandler(
    templatePath,
    templateScript,
    baseVariables,
    logs,
    [templatePath],
    signal
  );
  const isError = outputErrors(templatePath, logs);
  if (!isError) {
    await writeContentFile(outputPath, rendered);
  }
};
