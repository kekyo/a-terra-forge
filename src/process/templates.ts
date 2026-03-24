// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  compileScriptCached,
  createIncludeFunction,
  createReducerContext,
  createSharedDCodegenExecutor,
  FunCityReducerError,
  makeFunCityFunction,
  outputErrors,
  type FunCityExpressionNode,
  type FunCityFunctionContext,
  type FunCityLogEntry,
  type FunCityVariables,
  type FunCityWarningEntry,
} from 'funcity';

import { writeContentFile } from '../utils';

//////////////////////////////////////////////////////////////////////////////

const templateExecutionBackend = 'source' as const;
const templateAggressiveOptimize = false;

const compileTemplate = (sourceId: string, templateScript: string) =>
  compileScriptCached(
    templateScript,
    sourceId,
    'template',
    templateExecutionBackend,
    templateAggressiveOptimize
  );

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
  const compiled = compileTemplate(sourceId, templateScript);
  if (compiled.logs.length > 0) {
    logs.push(...compiled.logs);
  }
  if (logs.some((error) => error.type === 'error')) {
    return '';
  }

  const warningLogs: FunCityWarningEntry[] = [];
  const reducerContext = createReducerContext(
    variables,
    warningLogs,
    createSharedDCodegenExecutor(
      templateExecutionBackend,
      templateAggressiveOptimize
    )
  );
  try {
    const rendered = await compiled.textProgram(reducerContext, signal);
    logs.push(...warningLogs);
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
