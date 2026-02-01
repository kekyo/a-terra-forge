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
      logs.push({
        type: 'error',
        description: `circular import detected: ${importPath}`,
        range: context.thisNode?.range ?? {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
      });
      return '';
    }

    const importScript = allowMissing
      ? await readFileIfExists(importPath)
      : await readFile(importPath, 'utf8');
    if (importScript === undefined) {
      return '';
    }

    const parsed = parseTemplate(importScript);
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
  const { importTemplate, tryImportTemplate } = createImportHandlers(
    categoryIndexTemplatePath,
    logs,
    importStack
  );

  const variables = new Map(baseVariables);
  variables.set('import', importTemplate);
  variables.set('tryImport', tryImportTemplate);

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
