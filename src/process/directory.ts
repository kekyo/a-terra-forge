// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { dirname, posix } from 'path';
import {
  buildCandidateVariables,
  outputErrors,
  type FunCityLogEntry,
  type FunCityVariables,
} from 'funcity';
import type { Logger } from 'mark-deco';

import type { GitCommitMetadata } from '../types';
import {
  resolveBuiltLogPath,
  toPosixRelativePath,
  writeContentFile,
  type ArticleFileInfo,
} from '../utils';
import {
  applyHeaderIconCode,
  buildArticleAnchorId,
  scriptVariables,
  toPosixPath,
} from './helpers';
import { renderTemplateWithImportHandler } from './templates';
import {
  buildNavItems,
  isIndexMarkdown,
  resolveOrderValue,
  resolveCategoryDestinationPath,
  type NavCategory,
} from './navigation';

//////////////////////////////////////////////////////////////////////////////

/**
 * Template script and origin path.
 */
export interface PageTemplateInfo {
  readonly script: string;
  readonly path: string;
}

/**
 * Rendered article content snapshot.
 */
export interface RenderedArticleResult {
  readonly html: string;
  readonly frontmatter: Record<string, unknown>;
  readonly uniqueIdPrefix: string;
}

/**
 * Rendered article info combined with file and git metadata.
 */
export interface RenderedArticleInfo {
  readonly articleFile: ArticleFileInfo;
  readonly result: RenderedArticleResult;
  readonly timelineHtml: string;
  readonly git?: GitCommitMetadata;
}

/**
 * Generate a category page by combining rendered article entries.
 */
export const generateDirectoryDocument = async (
  logger: Logger,
  configDir: string,
  outDir: string,
  finalOutDir: string,
  directory: string,
  renderedResults: readonly RenderedArticleInfo[],
  pageTemplate: PageTemplateInfo,
  categoryEntryTemplate: PageTemplateInfo | undefined,
  configVariables: FunCityVariables,
  navOrderBefore: readonly string[],
  navOrderAfter: readonly string[],
  navCategories: ReadonlyMap<string, NavCategory>,
  frontPage: string,
  includeTimeline: boolean,
  siteTemplateOutputMap: ReadonlyMap<string, string>,
  signal: AbortSignal
): Promise<void> => {
  const destinationPath = resolveCategoryDestinationPath(
    outDir,
    directory,
    frontPage
  );

  const sortedResults = [...renderedResults].sort((a, b) => {
    const aIsIndex = isIndexMarkdown(a.articleFile.relativePath);
    const bIsIndex = isIndexMarkdown(b.articleFile.relativePath);
    if (aIsIndex !== bIsIndex) {
      return aIsIndex ? -1 : 1;
    }
    const aOrder = resolveOrderValue(
      a.result.frontmatter as Record<string, unknown>
    );
    const bOrder = resolveOrderValue(
      b.result.frontmatter as Record<string, unknown>
    );
    const aOrderValue = aOrder ?? Number.POSITIVE_INFINITY;
    const bOrderValue = bOrder ?? Number.POSITIVE_INFINITY;
    if (aOrderValue !== bOrderValue) {
      return aOrderValue - bOrderValue;
    }
    const aPath = toPosixPath(a.articleFile.relativePath);
    const bPath = toPosixPath(b.articleFile.relativePath);
    return aPath.localeCompare(bPath);
  });

  const articleEntries = sortedResults.map(
    ({ articleFile, result, git }, index) => {
      const anchorId = buildArticleAnchorId(result.frontmatter.id);
      const title =
        typeof result.frontmatter.title === 'string'
          ? result.frontmatter.title
          : '';
      const heading = index > 0 && title.length > 0 ? `<h2>${title}</h2>` : '';
      const parts = [
        anchorId ? `<a id="${anchorId}"></a>` : '',
        heading,
        result.html,
      ].filter((part) => part.length > 0);
      const filePath = toPosixPath(articleFile.relativePath);
      const fileName = posix.basename(filePath);
      return {
        articleFile,
        result,
        git,
        index,
        title,
        anchorId,
        filePath,
        fileName,
        directory: toPosixPath(articleFile.directory),
        body: parts.join('\n'),
      };
    }
  );

  const baseResult = sortedResults[0]!.result;

  const entryHtmlList = categoryEntryTemplate
    ? await Promise.all(
        articleEntries.map(async (entry) => {
          const entryFrontmatter = entry.result.frontmatter as Record<
            string,
            unknown
          >;
          const entryBaseVariables = {
            id: entry.result.frontmatter.id,
            title: entry.title,
            fileName: entry.fileName,
            ...entryFrontmatter,
          };
          const entryVariables = {
            ...entryBaseVariables,
            index: entry.index,
            filePath: entry.filePath,
            directory: entry.directory,
            anchorId: entry.anchorId,
            git: entry.git,
            contentHtml: entry.body,
          };

          const entryTemplateVariables = applyHeaderIconCode(
            buildCandidateVariables(
              scriptVariables,
              configVariables,
              entryVariables
            ),
            configVariables
          );

          const entryErrors: FunCityLogEntry[] = [];
          const entryRendered = await renderTemplateWithImportHandler(
            categoryEntryTemplate.path,
            categoryEntryTemplate.script,
            entryTemplateVariables,
            entryErrors,
            [categoryEntryTemplate.path],
            signal
          );
          const entryHasError = outputErrors(
            categoryEntryTemplate.path,
            entryErrors
          );
          return entryHasError ? entry.body : entryRendered;
        })
      )
    : undefined;

  const articles = articleEntries.map((entry, index) => {
    const entryFrontmatter = entry.result.frontmatter as Record<
      string,
      unknown
    >;
    const entryHtml = entryHtmlList ? entryHtmlList[index] : entry.body;
    return {
      id: entry.result.frontmatter.id,
      title: entry.title,
      fileName: entry.fileName,
      ...entryFrontmatter,
      index: entry.index,
      filePath: entry.filePath,
      directory: entry.directory,
      anchorId: entry.anchorId,
      git: entry.git,
      entryHtml,
    };
  });

  const commitIds = articleEntries
    .map((entry) => entry.git?.shortOid)
    .filter((oid): oid is string => typeof oid === 'string' && oid.length > 0);
  const categoryCommitKeyWithDirty =
    commitIds.length > 0
      ? articleEntries.some(
          (entry) => entry.git?.dirty === true || entry.git === undefined
        )
        ? `${commitIds.join(',')}:dirty`
        : commitIds.join(',')
      : undefined;

  const getSiteTemplatePath = (arg0: unknown): string => {
    const name = typeof arg0 === 'string' ? arg0 : String(arg0 ?? '');
    if (!name) {
      return '';
    }
    const outputPath = siteTemplateOutputMap.get(name);
    if (!outputPath) {
      return '';
    }
    return toPosixRelativePath(dirname(destinationPath), outputPath);
  };

  const navItems = buildNavItems(
    destinationPath,
    outDir,
    directory,
    navOrderBefore,
    navCategories,
    frontPage,
    includeTimeline
  );
  const navItemsAfter = buildNavItems(
    destinationPath,
    outDir,
    directory,
    navOrderAfter,
    navCategories,
    frontPage,
    includeTimeline
  );
  const contentVariables = {
    articles,
    getSiteTemplatePath,
    navItems,
    ...(navItemsAfter.length > 0 ? { navItemsAfter } : {}),
    ...(categoryCommitKeyWithDirty ? { categoryCommitKeyWithDirty } : {}),
  };

  const templateVariables = applyHeaderIconCode(
    buildCandidateVariables(
      scriptVariables,
      configVariables,
      baseResult.frontmatter,
      contentVariables
    ),
    configVariables
  );

  const logs: FunCityLogEntry[] = [];
  const rendered = await renderTemplateWithImportHandler(
    pageTemplate.path,
    pageTemplate.script,
    templateVariables,
    logs,
    [pageTemplate.path],
    signal
  );

  const isError = outputErrors(pageTemplate.path, logs);

  if (!isError) {
    await writeContentFile(destinationPath, rendered);
    const builtPath = resolveBuiltLogPath(
      configDir,
      destinationPath,
      outDir,
      finalOutDir
    );
    logger.info(`built: ${builtPath}`);
  }
};
