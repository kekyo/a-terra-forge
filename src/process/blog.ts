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
  type BlogEntry,
  type BlogIndexEntry,
  createEntryGetter,
} from './entries';
import { resolvePrerenderCount } from './paging';
import { renderTemplateWithImportHandler } from './templates';
import {
  buildNavItems,
  getDirectoryLabel,
  isIndexMarkdown,
  resolveCategoryDestinationPath,
  resolveOrderValue,
  type NavCategory,
} from './navigation';
import type { PageTemplateInfo, RenderedArticleInfo } from './directory';
import {
  renderOgImage,
  resolveOgImageOutputPath,
  type OgImageTemplateSet,
} from './ogImage';

//////////////////////////////////////////////////////////////////////////////

/**
 * Generate a blog category page using blog.json and entry fragments.
 */
export const generateBlogDocument = async (
  logger: Logger,
  configDir: string,
  outDir: string,
  finalOutDir: string,
  directory: string,
  renderedResults: readonly RenderedArticleInfo[],
  pageTemplate: PageTemplateInfo,
  blogEntryTemplate: PageTemplateInfo,
  blogSingleTemplate: PageTemplateInfo,
  configVariables: FunCityVariables,
  navOrderBefore: readonly string[],
  navOrderAfter: readonly string[],
  navCategories: ReadonlyMap<string, NavCategory>,
  frontPage: string,
  includeTimeline: boolean,
  siteTemplateOutputMap: ReadonlyMap<string, string>,
  ogImageTemplates: OgImageTemplateSet,
  baseUrl: URL,
  signal: AbortSignal
): Promise<readonly string[]> => {
  const destinationPath = resolveCategoryDestinationPath(
    outDir,
    directory,
    frontPage
  );
  const blogOutputDir = dirname(destinationPath);
  const articleBodiesDir = join(blogOutputDir, 'article-bodies');
  const prerenderCount = resolvePrerenderCount(configVariables);
  const categoryLabel = getDirectoryLabel(directory);
  const categoryPath = toPosixRelativePath(blogOutputDir, destinationPath);

  await mkdir(articleBodiesDir, { recursive: true });

  const entryCandidates: {
    entry: BlogEntry;
    dateValue: number;
    hasDate: boolean;
    idValue: number;
    dirtyRank: number;
    isIndex: boolean;
    orderValue: number;
    pathValue: string;
    entrySingleFilePath: string;
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
      const idValue =
        typeof result.frontmatter.id === 'number' &&
        Number.isFinite(result.frontmatter.id)
          ? result.frontmatter.id
          : 0;
      const dateValue = hasDate ? dayjs(date).valueOf() : 0;
      const anchorId = buildArticleAnchorId(result.frontmatter.id);
      const entryId =
        typeof result.frontmatter.id === 'number'
          ? result.frontmatter.id
          : undefined;
      const entryDate = hasDate ? date : undefined;
      const entryFileName = `${idValue}.txt`;
      const entryFilePath = join(articleBodiesDir, entryFileName);
      const entryPath = toPosixRelativePath(
        dirname(destinationPath),
        entryFilePath
      );
      const entrySingleFileName = `${idValue}.html`;
      const entrySingleFilePath = join(blogOutputDir, entrySingleFileName);
      const entrySinglePath = toPosixRelativePath(
        dirname(destinationPath),
        entrySingleFilePath
      );
      const entryBody = result.html;
      const entryFrontmatter = result.frontmatter as Record<string, unknown>;
      const filePath = toPosixPath(articleFile.relativePath);
      const fileName = posix.basename(filePath);
      const directory = toPosixPath(articleFile.directory);
      const entryVariables = {
        title,
        date: entryDate,
        category: categoryLabel,
        categoryPath,
        anchorId,
        id: entryId,
        git,
        headerIcon: entryFrontmatter?.headerIcon,
        entrySinglePath,
        contentHtml: entryBody,
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
        blogEntryTemplate.path,
        blogEntryTemplate.script,
        entryTemplateVariables,
        entryErrors,
        [blogEntryTemplate.path],
        signal
      );
      const entryHasError = outputErrors(entryErrors);
      const entryHtml = entryHasError ? entryBody : entryRendered;
      await writeContentFile(entryFilePath, entryHtml);

      const isIndex = isIndexMarkdown(articleFile.relativePath);
      const orderValue =
        resolveOrderValue(entryFrontmatter) ?? Number.POSITIVE_INFINITY;
      const pathValue = toPosixPath(articleFile.relativePath);

      entryCandidates.push({
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
          category: categoryLabel,
          categoryPath,
          contentHtml: entryBody,
          timelineHtml,
          entryHtml,
          entryPath,
          entrySinglePath,
        },
        dateValue,
        hasDate,
        idValue,
        dirtyRank,
        isIndex,
        orderValue,
        pathValue,
        entrySingleFilePath,
      });
    }
  );

  await Promise.all(bodyWrites);

  const sortedCandidates = entryCandidates.sort((a, b) => {
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
    if (a.isIndex !== b.isIndex) {
      return a.isIndex ? -1 : 1;
    }
    if (a.orderValue !== b.orderValue) {
      return a.orderValue - b.orderValue;
    }
    return a.pathValue.localeCompare(b.pathValue);
  });
  const sortedEntries = sortedCandidates.map((item) => item.entry);

  const blogIndexPath = join(blogOutputDir, 'blog.json');
  const blogIndexRelativePath = toPosixRelativePath(
    dirname(destinationPath),
    blogIndexPath
  );

  const blogIndexEntries: BlogIndexEntry[] = sortedEntries.map((entry) => ({
    entryPath: entry.entryPath,
  }));
  const blogIndexContent = JSON.stringify(blogIndexEntries);
  await writeContentFile(blogIndexPath, blogIndexContent);

  const createSiteTemplatePathResolver =
    (documentPath: string) =>
    (arg0: unknown): string => {
      const name = typeof arg0 === 'string' ? arg0 : String(arg0 ?? '');
      if (!name) {
        return '';
      }
      const outputPath = siteTemplateOutputMap.get(name);
      if (!outputPath) {
        return '';
      }
      return toPosixRelativePath(dirname(documentPath), outputPath);
    };
  const getSiteTemplatePath = createSiteTemplatePathResolver(destinationPath);

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

  const latestDate =
    sortedEntries.find((entry) => entry.date && entry.date.length > 0)?.date ??
    dayjs().format();
  const contentVariables = {
    title: categoryLabel,
    description: '',
    date: latestDate,
    getSiteTemplatePath,
    navItems,
    ...(navItemsAfter.length > 0 ? { navItemsAfter } : {}),
    blogIndexPath: blogIndexRelativePath,
    blogCount: sortedEntries.length,
    articleEntries: sortedEntries,
    entryMode: 'blog',
    getEntry: createEntryGetter(destinationPath),
    ...(prerenderCount !== undefined ? { prerenderCount } : {}),
  };

  const buildIndexTemplateVariables = (
    documentPath: string,
    extraVariables?: Record<string, unknown>
  ) =>
    applyHeaderIconCode(
      buildCandidateVariables(
        scriptVariables,
        configVariables,
        contentVariables,
        ...(extraVariables ? [extraVariables] : []),
        createPathFunctions({
          outDir,
          documentPath,
          baseUrl,
        })
      ),
      configVariables
    );

  const ogImageOutputPath = resolveOgImageOutputPath(destinationPath);
  const ogImagePath = await renderOgImage({
    templates: ogImageTemplates,
    mode: 'blog',
    variables: buildIndexTemplateVariables(ogImageOutputPath),
    outputPath: ogImageOutputPath,
    configDir,
    outDir,
    finalOutDir,
    logger,
    signal,
  });

  const templateVariables = buildIndexTemplateVariables(
    destinationPath,
    ogImagePath ? { ogImagePath } : undefined
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

  const isError = outputErrors(logs);

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

  const singlePageOutputs = await Promise.all(
    sortedCandidates.map(async (candidate) => {
      const { entry, entrySingleFilePath } = candidate;
      const singleNavItems = buildNavItems(
        entrySingleFilePath,
        outDir,
        directory,
        navOrderBefore,
        navCategories,
        frontPage,
        includeTimeline
      );
      const singleNavItemsAfter = buildNavItems(
        entrySingleFilePath,
        outDir,
        directory,
        navOrderAfter,
        navCategories,
        frontPage,
        includeTimeline
      );
      const singleContentVariables = {
        articleEntries: [entry],
        entryMode: 'blog-single',
        getSiteTemplatePath:
          createSiteTemplatePathResolver(entrySingleFilePath),
        getEntry: createEntryGetter(entrySingleFilePath),
        navItems: singleNavItems,
        ...(singleNavItemsAfter.length > 0
          ? { navItemsAfter: singleNavItemsAfter }
          : {}),
      };
      const buildSingleTemplateVariables = (
        documentPath: string,
        extraVariables?: Record<string, unknown>
      ) =>
        applyHeaderIconCode(
          buildCandidateVariables(
            scriptVariables,
            configVariables,
            entry,
            singleContentVariables,
            ...(extraVariables ? [extraVariables] : []),
            createPathFunctions({
              outDir,
              documentPath,
              baseUrl,
            })
          ),
          configVariables
        );
      const singleOgImageOutputPath =
        resolveOgImageOutputPath(entrySingleFilePath);
      const singleOgImagePath = await renderOgImage({
        templates: ogImageTemplates,
        mode: 'blog-single',
        variables: buildSingleTemplateVariables(singleOgImageOutputPath),
        outputPath: singleOgImageOutputPath,
        configDir,
        outDir,
        finalOutDir,
        logger,
        signal,
      });
      const singleTemplateVariables = buildSingleTemplateVariables(
        entrySingleFilePath,
        singleOgImagePath ? { ogImagePath: singleOgImagePath } : undefined
      );
      const singleLogs: FunCityLogEntry[] = [];
      const singleRendered = await renderTemplateWithImportHandler(
        blogSingleTemplate.path,
        blogSingleTemplate.script,
        singleTemplateVariables,
        singleLogs,
        [blogSingleTemplate.path],
        signal
      );
      const singleHasError = outputErrors(singleLogs);
      if (singleHasError) {
        return undefined;
      }
      await writeContentFile(entrySingleFilePath, singleRendered);
      return entrySingleFilePath;
    })
  );

  return singlePageOutputs.filter(
    (path): path is string => typeof path === 'string'
  );
};
