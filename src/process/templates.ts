// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { basename, dirname, posix, resolve } from 'path';
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

export interface TemplateResolver {
  readonly templatesDir: string;
  readonly templateNames: readonly string[];
  readonly resolveTemplate: (
    logicalPath: string
  ) => Promise<ResolvedTemplateFile | undefined>;
  readonly getResolvedTemplateBySourceId: (
    sourceId: string
  ) => ResolvedTemplateFile | undefined;
}

export interface ResolvedTemplateFile {
  readonly resolver: TemplateResolver;
  readonly templateName: string;
  readonly logicalPath: string;
  readonly path: string;
  readonly script: string;
}

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

const normalizeTemplateLogicalPath = (value: string): string | undefined => {
  const replaced = value.trim().replaceAll('\\', '/');
  if (replaced.length === 0 || replaced.startsWith('/')) {
    return undefined;
  }
  if (/^[A-Za-z]:\//.test(replaced)) {
    return undefined;
  }
  const normalized = posix.normalize(replaced);
  if (
    normalized === '.' ||
    normalized === '' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    return undefined;
  }
  return normalized;
};

const resolveRelativeTemplateLogicalPath = (
  importerLogicalPath: string,
  request: string
): string | undefined => {
  const importerDir = posix.dirname(importerLogicalPath);
  const resolved = posix.normalize(posix.join(importerDir, request));
  if (
    resolved === '.' ||
    resolved === '' ||
    resolved === '..' ||
    resolved.startsWith('../')
  ) {
    return undefined;
  }
  return normalizeTemplateLogicalPath(resolved);
};

export const createTemplateResolver = (
  templatesDir: string,
  templateNames: readonly string[]
): TemplateResolver => {
  const resolutionCache = new Map<
    string,
    Promise<ResolvedTemplateFile | undefined>
  >();
  const resolutionsBySourceId = new Map<string, ResolvedTemplateFile>();

  const resolver: TemplateResolver = {
    templatesDir,
    templateNames,
    resolveTemplate: async (logicalPath: string) => {
      const normalizedLogicalPath = normalizeTemplateLogicalPath(logicalPath);
      if (!normalizedLogicalPath) {
        return undefined;
      }

      const cached = resolutionCache.get(normalizedLogicalPath);
      if (cached) {
        return await cached;
      }

      const resolving = (async () => {
        for (const templateName of templateNames) {
          const templatePath = resolve(
            templatesDir,
            templateName,
            normalizedLogicalPath
          );
          const script = await readFileIfExists(templatePath);
          if (script === undefined) {
            continue;
          }
          const resolvedTemplate: ResolvedTemplateFile = {
            resolver,
            templateName,
            logicalPath: normalizedLogicalPath,
            path: templatePath,
            script,
          };
          resolutionsBySourceId.set(templatePath, resolvedTemplate);
          return resolvedTemplate;
        }
        return undefined;
      })();

      resolutionCache.set(normalizedLogicalPath, resolving);
      return await resolving;
    },
    getResolvedTemplateBySourceId: (sourceId: string) =>
      resolutionsBySourceId.get(sourceId),
  };

  return resolver;
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

const createImportHandlers = (
  template: ResolvedTemplateFile,
  logs: FunCityLogEntry[]
): ImportHandlers => {
  const includeHandlers = createIncludeFunction({
    resolve: async (request, context) => {
      const importer = template.resolver.getResolvedTemplateBySourceId(
        context.sourceId
      );
      if (!importer) {
        return undefined;
      }
      const includeLogicalPath = resolveRelativeTemplateLogicalPath(
        importer.logicalPath,
        request
      );
      if (!includeLogicalPath) {
        return undefined;
      }
      const resolvedTemplate =
        await template.resolver.resolveTemplate(includeLogicalPath);
      if (!resolvedTemplate) {
        return undefined;
      }
      return {
        sourceId: resolvedTemplate.path,
        script: resolvedTemplate.script,
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
  template: ResolvedTemplateFile,
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
  } = createImportHandlers(template, logs);

  const variables = new Map(baseVariables);
  variables.set('include', includeTemplate);
  variables.set('tryInclude', tryIncludeTemplate);
  variables.set('import', importTemplate);
  variables.set('tryImport', tryImportTemplate);

  const result = await renderFunCity(
    template.path,
    template.script,
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

  const sourceDir = dirname(templatePath);
  let templateBySourceId: ResolvedTemplateFile | undefined;
  const singleFileResolver: TemplateResolver = {
    templatesDir: sourceDir,
    templateNames: ['<single-file>'],
    resolveTemplate: async (logicalPath: string) => {
      const normalizedLogicalPath = normalizeTemplateLogicalPath(logicalPath);
      if (!normalizedLogicalPath) {
        return undefined;
      }
      const resolvedPath = resolve(sourceDir, normalizedLogicalPath);
      const script = await readFileIfExists(resolvedPath);
      if (script === undefined) {
        return undefined;
      }
      const resolvedTemplate: ResolvedTemplateFile = {
        resolver: singleFileResolver,
        templateName: '<single-file>',
        logicalPath: normalizedLogicalPath,
        path: resolvedPath,
        script,
      };
      if (resolvedPath === templatePath) {
        templateBySourceId = resolvedTemplate;
      }
      return resolvedTemplate;
    },
    getResolvedTemplateBySourceId: (sourceId: string) =>
      sourceId === templatePath ? templateBySourceId : undefined,
  };
  const template: ResolvedTemplateFile = {
    resolver: singleFileResolver,
    templateName: '<single-file>',
    logicalPath: basename(templatePath),
    path: templatePath,
    script: templateScript,
  };
  templateBySourceId = template;

  const logs: FunCityLogEntry[] = [];
  const rendered = await renderTemplateWithImportHandler(
    template,
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
