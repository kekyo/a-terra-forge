// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import dayjs from 'dayjs';
import {
  buildCandidateVariables,
  outputErrors,
  type FunCityLogEntry,
  type FunCityVariables,
} from 'funcity';
import type { Logger } from 'mark-deco';

import { adjustPath, toPosixRelativePath, writeContentFile } from '../utils';
import {
  applyHeaderIconCode,
  buildArticleAnchorId,
  scriptVariables,
  toPosixPath,
} from './helpers';
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

//////////////////////////////////////////////////////////////////////////////

/**
 * Blog entry metadata stored in blog.json.
 */
export interface BlogEntry {
  readonly title: string;
  readonly date: string;
  readonly anchorId?: string;
  readonly entryPath: string;
}

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
  const blogOutputDir = dirname(destinationPath);
  const blogBodiesDir = join(blogOutputDir, 'blog-bodies');
  const prerenderCount = resolvePrerenderCount(configVariables);

  await mkdir(blogBodiesDir, { recursive: true });

  const entryCandidates: {
    entry: BlogEntry;
    dateValue: number;
    hasDate: boolean;
    idValue: number;
    dirtyRank: number;
    isIndex: boolean;
    orderValue: number;
    pathValue: string;
  }[] = [];

  const bodyWrites = renderedResults.map(
    async ({ articleFile, result, git }) => {
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
      const entryFileName = `${idValue}.html`;
      const entryFilePath = join(blogBodiesDir, entryFileName);
      const entryPath = toPosixRelativePath(
        dirname(destinationPath),
        entryFilePath
      );
      const entryBody = result.html;
      const entryFrontmatter = result.frontmatter as Record<string, unknown>;
      const entryVariables = {
        title,
        date: entryDate,
        anchorId,
        id: entryId,
        git,
        headerIcon: entryFrontmatter?.headerIcon,
        body: entryBody,
        ...entryFrontmatter,
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
        blogEntryTemplate.path,
        blogEntryTemplate.script,
        entryTemplateVariables,
        entryErrors,
        [blogEntryTemplate.path],
        signal
      );
      const entryHasError = outputErrors(blogEntryTemplate.path, entryErrors);
      if (!entryHasError) {
        await writeContentFile(entryFilePath, entryRendered);
      }

      const isIndex = isIndexMarkdown(articleFile.relativePath);
      const orderValue =
        resolveOrderValue(entryFrontmatter) ?? Number.POSITIVE_INFINITY;
      const pathValue = toPosixPath(articleFile.relativePath);

      entryCandidates.push({
        entry: {
          title,
          date,
          ...(anchorId ? { anchorId } : {}),
          entryPath,
        },
        dateValue,
        hasDate,
        idValue,
        dirtyRank,
        isIndex,
        orderValue,
        pathValue,
      });
    }
  );

  await Promise.all(bodyWrites);

  const sortedEntries = entryCandidates
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
      if (a.isIndex !== b.isIndex) {
        return a.isIndex ? -1 : 1;
      }
      if (a.orderValue !== b.orderValue) {
        return a.orderValue - b.orderValue;
      }
      return a.pathValue.localeCompare(b.pathValue);
    })
    .map((item) => item.entry);

  const blogIndexPath = join(blogOutputDir, 'blog.json');
  const blogIndexRelativePath = toPosixRelativePath(
    dirname(destinationPath),
    blogIndexPath
  );

  const blogIndexContent = JSON.stringify(sortedEntries);
  await writeContentFile(blogIndexPath, blogIndexContent);

  const getBlogEntry = async (arg0: unknown) => {
    const entryPath =
      typeof arg0 === 'string'
        ? arg0
        : arg0 &&
            typeof (arg0 as { entryPath?: unknown }).entryPath === 'string'
          ? ((arg0 as { entryPath?: string }).entryPath ?? '')
          : '';
    if (!entryPath) {
      return '';
    }
    const entryFilePath = resolve(dirname(destinationPath), entryPath);
    try {
      return await readFile(entryFilePath, 'utf8');
    } catch {
      return '';
    }
  };

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

  const latestDate =
    sortedEntries.find((entry) => entry.date.length > 0)?.date ??
    dayjs().format();
  const categoryLabel = getDirectoryLabel(directory);

  const contentVariables = {
    title: categoryLabel,
    description: '',
    date: latestDate,
    getSiteTemplatePath,
    navItems,
    ...(navItemsAfter.length > 0 ? { navItemsAfter } : {}),
    blogIndexPath: blogIndexRelativePath,
    blogCount: sortedEntries.length,
    blogEntries: sortedEntries,
    getBlogEntry,
    ...(prerenderCount !== undefined ? { prerenderCount } : {}),
  };

  const templateVariables = applyHeaderIconCode(
    buildCandidateVariables(scriptVariables, configVariables, contentVariables),
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
    const builtPath = toPosixRelativePath(
      configDir,
      adjustPath(destinationPath, outDir, finalOutDir)
    );
    logger.info(`built: ${builtPath}`);
  }
};
