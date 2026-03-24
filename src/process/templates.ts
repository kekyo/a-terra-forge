// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  createIncludeFunction,
  convertToString,
  FunCityReducerError,
  makeFunCityFunction,
  outputErrors,
  runParser,
  runReducer,
  runTokenizer,
  type FunCityBlockNode,
  type FunCityExpressionNode,
  type FunCityFunctionContext,
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
  readonly includeTemplate: Function;
  readonly tryIncludeTemplate: Function;
  readonly importTemplate: Function;
  readonly tryImportTemplate: Function;
};

const createIncludeAlias = (targetName: 'include' | 'tryInclude'): Function =>
  makeFunCityFunction(async function (
    this: FunCityFunctionContext,
    arg0?: FunCityExpressionNode
  ) {
    const targetValue = this.getValue(targetName);
    if (!targetValue.isFound || typeof targetValue.value !== 'function') {
      throw new FunCityReducerError({
        type: 'error',
        description: `Missing \`${targetName}\` function`,
        range: this.thisNode.range,
      });
    }

    const targetFunction = targetValue.value as (
      arg0?: FunCityExpressionNode
    ) => Promise<unknown>;
    return await targetFunction.call(this, arg0);
  });

const createImportHandlers = (logs: FunCityLogEntry[]): ImportHandlers => {
  const includeHandlers = createIncludeFunction({
    resolve: async (request, context) => {
      const includePath = resolve(dirname(context.sourceId), request);
      const includeScript = await readFileIfExists(includePath);
      if (includeScript === undefined) {
        return undefined;
      }
      return {
        sourceId: includePath,
        script: includeScript,
      };
    },
    logs,
    mode: 'template',
    scope: 'child',
    includeMissing: 'error',
    tryIncludeMissing: 'empty',
  });

  return {
    includeTemplate: includeHandlers.include,
    tryIncludeTemplate: includeHandlers.tryInclude,
    importTemplate: createIncludeAlias('include'),
    tryImportTemplate: createIncludeAlias('tryInclude'),
  };
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
 * Render a template with nested include handling.
 */
export const renderTemplateWithImportHandler = async (
  categoryIndexTemplatePath: string,
  templateScript: string,
  baseVariables: FunCityVariables,
  logs: FunCityLogEntry[],
  _importStack: readonly string[],
  signal: AbortSignal
): Promise<string> => {
  const {
    includeTemplate,
    tryIncludeTemplate,
    importTemplate,
    tryImportTemplate,
  } = createImportHandlers(logs);

  const variables = new Map(baseVariables);
  variables.set('include', includeTemplate);
  variables.set('tryInclude', tryIncludeTemplate);
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
