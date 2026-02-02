// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir } from 'fs/promises';
import { dirname, join, posix } from 'path';
import dayjs from 'dayjs';
import {
  buildCandidateVariables,
  outputErrors,
  type FunCityLogEntry,
  type FunCityVariables,
} from 'funcity';
import type { Logger } from 'mark-deco';

import {
  resolveBuiltLogPath,
  toPosixRelativePath,
  writeContentFile,
} from '../utils';
import {
  applyHeaderIconCode,
  buildArticleAnchorId,
  createPathFunctions,
  scriptVariables,
  toPosixPath,
} from './helpers';
import {
  type TimelineEntry,
  type TimelineIndexEntry,
  createEntryGetter,
} from './entries';
import { resolvePrerenderCount } from './paging';
import { renderTemplateWithImportHandler } from './templates';
import {
  buildNavItems,
  getDirectoryLabel,
  resolveCategoryDestinationPath,
  resolveTimelineDestinationPath,
  resolveTimelineOutputDir,
  type NavCategory,
} from './navigation';
import type { PageTemplateInfo, RenderedArticleInfo } from './directory';

//////////////////////////////////////////////////////////////////////////////

/**
 * Generate timeline index and entry pages.
 */
export const generateTimelineDocument = async (
  logger: Logger,
  configDir: string,
  outDir: string,
  finalOutDir: string,
  renderedResults: readonly RenderedArticleInfo[],
  indexTemplate: PageTemplateInfo,
  configVariables: FunCityVariables,
  navOrderBefore: readonly string[],
  navOrderAfter: readonly string[],
  navCategories: ReadonlyMap<string, NavCategory>,
  blogCategoryNames: ReadonlySet<string>,
  timelineEntryTemplate: PageTemplateInfo,
  frontPage: string,
  siteTemplateOutputMap: ReadonlyMap<string, string>,
  baseUrl: URL,
  signal: AbortSignal
): Promise<void> => {
  const destinationPath = resolveTimelineDestinationPath(outDir, frontPage);
  const timelineOutputDir = resolveTimelineOutputDir(outDir, frontPage);
  const articleBodiesDir = join(timelineOutputDir, 'article-bodies');
  const prerenderCount = resolvePrerenderCount(configVariables);
  const indexPathFunctions = createPathFunctions({
    outDir,
    documentPath: destinationPath,
    baseUrl,
  });

  await mkdir(articleBodiesDir, { recursive: true });

  const timelineEntries: {
    entry: TimelineEntry;
    dateValue: number;
    hasDate: boolean;
    idValue: number;
    dirtyRank: number;
  }[] = [];

  const bodyWrites = renderedResults.map(
    async ({ articleFile, result, timelineHtml, git }) => {
      const title =
        typeof result.frontmatter.title === 'string'
          ? result.frontmatter.title
          : articleFile.relativePath;
      const date = git?.committer?.date ?? '';
      const hasDate = date.length > 0 && dayjs(date).isValid();
      const isMissingGit = !git;
      const isDirty = git?.dirty === true;
      const dirtyRank = isMissingGit ? 0 : isDirty ? 1 : 2;
      const categoryDirectory = articleFile.directory;
      const categoryLabel = getDirectoryLabel(categoryDirectory);
      const idValue =
        typeof result.frontmatter.id === 'number' &&
        Number.isFinite(result.frontmatter.id)
          ? result.frontmatter.id
          : 0;
      const dateValue = hasDate ? dayjs(date).valueOf() : 0;
      const hasCategory = categoryLabel.length > 0;
      const isBlogCategory =
        hasCategory && blogCategoryNames.has(categoryLabel);
      const categoryPath = hasCategory
        ? toPosixRelativePath(
            dirname(destinationPath),
            resolveCategoryDestinationPath(outDir, categoryDirectory, frontPage)
          )
        : undefined;
      const blogOutputDir = isBlogCategory
        ? dirname(
            resolveCategoryDestinationPath(outDir, categoryDirectory, frontPage)
          )
        : undefined;
      const entrySingleFilePath =
        blogOutputDir && idValue > 0
          ? join(blogOutputDir, `${idValue}.html`)
          : undefined;
      const entrySinglePath = entrySingleFilePath
        ? toPosixRelativePath(dirname(destinationPath), entrySingleFilePath)
        : undefined;
      const anchorId = buildArticleAnchorId(result.frontmatter.id);
      const entryId =
        typeof result.frontmatter.id === 'number'
          ? result.frontmatter.id
          : undefined;
      const entryDate = hasDate ? date : undefined;
      const entryCategory = hasCategory ? categoryLabel : undefined;
      const entryFileName = `${idValue}.txt`;
      const entryFilePath = join(articleBodiesDir, entryFileName);
      const entryPath = toPosixRelativePath(
        dirname(destinationPath),
        entryFilePath
      );
      const entryFrontmatter = result.frontmatter as Record<string, unknown>;
      const filePath = toPosixPath(articleFile.relativePath);
      const fileName = posix.basename(filePath);
      const directory = toPosixPath(articleFile.directory);

      const entryVariables = {
        title,
        date: entryDate,
        category: entryCategory,
        categoryPath,
        entrySinglePath,
        anchorId,
        id: entryId,
        git,
        headerIcon: entryFrontmatter?.headerIcon,
        contentHtml: timelineHtml,
        ...entryFrontmatter,
      };

      const entryTemplateVariables = applyHeaderIconCode(
        buildCandidateVariables(
          scriptVariables,
          configVariables,
          entryVariables,
          createPathFunctions({
            outDir,
            documentPath: entryFilePath,
            baseUrl,
          })
        ),
        configVariables
      );

      const entryErrors: FunCityLogEntry[] = [];
      const entryRendered = await renderTemplateWithImportHandler(
        timelineEntryTemplate.path,
        timelineEntryTemplate.script,
        entryTemplateVariables,
        entryErrors,
        [timelineEntryTemplate.path],
        signal
      );
      const entryHasError = outputErrors(
        timelineEntryTemplate.path,
        entryErrors
      );
      const entryHtml = entryHasError ? timelineHtml : entryRendered;
      await writeContentFile(entryFilePath, entryHtml);

      timelineEntries.push({
        entry: {
          id: entryId,
          title,
          fileName,
          ...entryFrontmatter,
          filePath,
          directory,
          anchorId,
          git,
          date,
          contentHtml: timelineHtml,
          timelineHtml,
          entryHtml,
          entryPath,
          category: entryCategory,
          ...(entrySinglePath ? { entrySinglePath } : {}),
          ...(categoryPath ? { categoryPath } : {}),
        },
        dateValue,
        hasDate,
        idValue,
        dirtyRank,
      });
    }
  );

  await Promise.all(bodyWrites);

  const sortedEntries = timelineEntries
    .sort((a, b) => {
      const dirtyDiff = a.dirtyRank - b.dirtyRank;
      if (dirtyDiff !== 0) {
        return dirtyDiff;
      }
      if (a.hasDate !== b.hasDate) {
        return a.hasDate ? 1 : -1;
      }
      if (a.hasDate && b.hasDate) {
        const dateDiff = b.dateValue - a.dateValue;
        if (dateDiff !== 0) {
          return dateDiff;
        }
      }
      const idDiff = b.idValue - a.idValue;
      if (idDiff !== 0) {
        return idDiff;
      }
      return a.entry.title.localeCompare(b.entry.title);
    })
    .map((item) => item.entry);

  const timelineIndexPath = join(timelineOutputDir, 'timeline.json');
  const timelineIndexRelativePath = toPosixRelativePath(
    dirname(destinationPath),
    timelineIndexPath
  );

  const timelineIndexEntries: TimelineIndexEntry[] = sortedEntries.map(
    (entry) => ({
      entryPath: entry.entryPath,
    })
  );
  const timelineIndexContent = JSON.stringify(timelineIndexEntries);
  await writeContentFile(timelineIndexPath, timelineIndexContent);

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
    'timeline',
    navOrderBefore,
    navCategories,
    frontPage,
    true
  );
  const navItemsAfter = buildNavItems(
    destinationPath,
    outDir,
    'timeline',
    navOrderAfter,
    navCategories,
    frontPage,
    true
  );

  const latestDate =
    sortedEntries.find((entry) => entry.date && entry.date.length > 0)?.date ??
    dayjs().format();

  const contentVariables = {
    title: 'timeline',
    description: '',
    date: latestDate,
    getSiteTemplatePath,
    navItems,
    ...(navItemsAfter.length > 0 ? { navItemsAfter } : {}),
    timelineIndexPath: timelineIndexRelativePath,
    timelineCount: sortedEntries.length,
    articleEntries: sortedEntries,
    entryMode: 'timeline',
    getEntry: createEntryGetter(destinationPath),
    ...(prerenderCount !== undefined ? { prerenderCount } : {}),
  };

  const templateVariables = applyHeaderIconCode(
    buildCandidateVariables(
      scriptVariables,
      configVariables,
      contentVariables,
      indexPathFunctions
    ),
    configVariables
  );

  const logs: FunCityLogEntry[] = [];
  const rendered = await renderTemplateWithImportHandler(
    indexTemplate.path,
    indexTemplate.script,
    templateVariables,
    logs,
    [indexTemplate.path],
    signal
  );

  const isError = outputErrors(indexTemplate.path, logs);

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
