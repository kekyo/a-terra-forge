// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  convertToString,
  FunCityReducerError,
  makeFunCityFunction,
  outputErrors,
  reduceNode,
  runParser,
  runReducer,
  runTokenizer,
  type FunCityBlockNode,
  type FunCityExpressionNode,
  type FunCityFunctionContext,
  type FunCityLogEntry,
  type FunCityRange,
  type FunCityRangedObject,
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

const createFallbackRange = (sourceId: string): FunCityRange => ({
  sourceId,
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
});

const resolveLogRange = (
  node: FunCityRangedObject | undefined,
  fallbackSourceId: string
): FunCityRange => node?.range ?? createFallbackRange(fallbackSourceId);

const appendTemplateError = (
  logs: FunCityLogEntry[],
  node: FunCityRangedObject | undefined,
  fallbackSourceId: string,
  description: string
): void => {
  logs.push({
    type: 'error',
    description,
    range: resolveLogRange(node, fallbackSourceId),
  });
};

/**
 * Parse a template script into tokens and AST nodes with caching.
 */
const parseTemplate = (
  sourceId: string,
  templateScript: string
): ParsedTemplateCacheEntry => {
  const cacheKey = `${sourceId}\u0000${templateScript}`;
  const cached = parsedTemplateCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const parseErrors: FunCityLogEntry[] = [];
  const tokens = runTokenizer(templateScript, parseErrors, sourceId);
  const nodes = runParser(tokens, parseErrors);
  const parsed: ParsedTemplateCacheEntry = {
    tokens,
    nodes,
    logs: parseErrors,
  };
  parsedTemplateCache.set(cacheKey, parsed);
  return parsed;
};

type ImportHandlers = {
  readonly importTemplate: Function;
  readonly tryImportTemplate: Function;
};

const createImportHandlers = (
  templatePath: string,
  logs: FunCityLogEntry[],
  importStack: readonly string[]
): ImportHandlers => {
  const templateDir = dirname(templatePath);

  const renderImportedTemplate = async (
    context: FunCityFunctionContext,
    argNode: FunCityExpressionNode | undefined,
    allowMissing: boolean
  ): Promise<string> => {
    const resolvedArg =
      argNode === undefined ? undefined : await context.reduce(argNode);
    const importPath = resolve(templateDir, String(resolvedArg));

    if (importStack.includes(importPath)) {
      appendTemplateError(
        logs,
        context.thisNode,
        templatePath,
        `circular import detected: ${importPath}`
      );
      return '';
    }

    let importScript: string | undefined;
    try {
      importScript = allowMissing
        ? await readFileIfExists(importPath)
        : await readFile(importPath, 'utf8');
    } catch (error: unknown) {
      appendTemplateError(
        logs,
        context.thisNode,
        templatePath,
        `failed to read imported template: ${importPath} (${
          error instanceof Error ? error.message : String(error)
        })`
      );
      return '';
    }
    if (importScript === undefined) {
      return '';
    }

    const parsed = parseTemplate(importPath, importScript);
    if (parsed.logs.length > 0) {
      logs.push(...parsed.logs);
    }
    if (parsed.logs.some((entry) => entry.type === 'error')) {
      return '';
    }

    const scope = context.newScope();
    const nestedHandlers = createImportHandlers(importPath, logs, [
      ...importStack,
      importPath,
    ]);
    scope.setValue(
      'import',
      nestedHandlers.importTemplate,
      context.abortSignal
    );
    scope.setValue(
      'tryImport',
      nestedHandlers.tryImportTemplate,
      context.abortSignal
    );

    const reducedValues: unknown[] = [];
    try {
      for (const node of parsed.nodes) {
        const reduced = await reduceNode(scope, node, context.abortSignal);
        reducedValues.push(...reduced);
      }
    } catch (error: unknown) {
      if (error instanceof FunCityReducerError) {
        logs.push(error.info);
        return '';
      }
      throw error;
    }

    return reducedValues
      .filter((value) => value !== undefined)
      .map((value) => scope.convertToString(value))
      .join('');
  };

  const importTemplate = makeFunCityFunction(async function (
    this: FunCityFunctionContext,
    arg0?: FunCityExpressionNode
  ) {
    return await renderImportedTemplate(this, arg0, false);
  });

  const tryImportTemplate = makeFunCityFunction(async function (
    this: FunCityFunctionContext,
    arg0?: FunCityExpressionNode
  ) {
    return await renderImportedTemplate(this, arg0, true);
  });

  return { importTemplate, tryImportTemplate };
};

/**
 * Render a FunCity template with variables and collect logs.
 */
const renderFunCity = async (
  sourceId: string,
  templateScript: string,
  variables: FunCityVariables,
  logs: FunCityLogEntry[],
  signal: AbortSignal
): Promise<string> => {
  const parsed = parseTemplate(sourceId, templateScript);
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
  const { importTemplate, tryImportTemplate } = createImportHandlers(
    categoryIndexTemplatePath,
    logs,
    importStack
  );

  const variables = new Map(baseVariables);
  variables.set('import', importTemplate);
  variables.set('tryImport', tryImportTemplate);

  const result = await renderFunCity(
    categoryIndexTemplatePath,
    templateScript,
    variables,
    logs,
    signal
  );
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
  const isError = outputErrors(logs);
  if (!isError) {
    await writeContentFile(outputPath, rendered);
  }
};
