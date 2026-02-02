// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import dayjs from 'dayjs';
import type { FunCityVariables } from 'funcity';
import type { Logger } from 'mark-deco';

import type { RenderedArticleInfo } from './directory';
import { buildArticleAnchorId } from './helpers';
import {
  getDirectoryLabel,
  resolveCategoryDestinationPath,
} from './navigation';
import { toPosixRelativePath } from '../utils';

///////////////////////////////////////////////////////////////////////////////////

export type FeedTemplateEntry = {
  title: string;
  link: string;
  date: string;
  dateRfc1123: string;
  summary: string;
};

export type FeedTemplateData = {
  feedTitle: string;
  feedDescription: string;
  feedLanguage?: string;
  siteLink: string;
  rssLink: string;
  atomLink: string;
  feedUpdatedRfc1123: string;
  feedUpdatedIso: string;
  feedEntries: readonly FeedTemplateEntry[];
};

///////////////////////////////////////////////////////////////////////////////////

const defaultFeedSummaryLength = 200;

const getTrimmedStringValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveFeedSummaryLength = (variables: FunCityVariables): number => {
  const raw = variables.get('feedSummaryLength');
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const normalized = Math.floor(raw);
    return normalized > 0 ? normalized : defaultFeedSummaryLength;
  }
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : defaultFeedSummaryLength;
  }
  return defaultFeedSummaryLength;
};

const resolveFeedTitle = (variables: FunCityVariables): string => {
  const custom = getTrimmedStringValue(variables.get('feedTitle'));
  if (custom) {
    return custom;
  }
  const siteName = getTrimmedStringValue(variables.get('siteName'));
  return siteName ?? 'feed';
};

const resolveFeedDescription = (variables: FunCityVariables): string => {
  const custom = getTrimmedStringValue(variables.get('feedDescription'));
  if (custom) {
    return custom;
  }
  return getTrimmedStringValue(variables.get('siteDescription')) ?? '';
};

const resolveFeedLanguage = (variables: FunCityVariables): string | undefined =>
  getTrimmedStringValue(variables.get('locale'));

const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

const stripFrontmatter = (markdown: string): string =>
  markdown.replace(frontmatterRegex, '');

const extractPlainTextFromMarkdown = (markdown: string): string => {
  let text = stripFrontmatter(markdown);
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/~~~[\s\S]*?~~~/g, ' ');
  text = text.replace(/^\s*<!--[\s\S]*?-->\s*$/gm, ' ');
  text = text.replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1');
  text = text.replace(/^\s*\[[^\]]+\]:\s*.+$/gm, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/~~([^~]+)~~/g, '$1');
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s*>+\s?/gm, '');
  text = text.replace(/^\s*([-*+]|\d+\.)\s+/gm, '');
  text = text.replace(/<\/?[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};

const truncateText = (text: string, maxLength: number): string => {
  if (maxLength <= 0) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
};

const buildFeedEntries = async ({
  logger,
  outDir,
  baseUrl,
  renderedResults,
  summaryLength,
  frontPage,
  blogCategoryNames,
}: {
  logger: Logger;
  outDir: string;
  baseUrl: URL;
  renderedResults: readonly RenderedArticleInfo[];
  summaryLength: number;
  frontPage: string;
  blogCategoryNames: ReadonlySet<string>;
}): Promise<FeedTemplateEntry[]> => {
  const entries = await Promise.all(
    renderedResults.map(async (rendered) => {
      const gitDate = rendered.git?.committer?.date;
      if (!gitDate) {
        return undefined;
      }
      if (!dayjs(gitDate).isValid()) {
        logger.warn(
          `warning: Invalid git date for ${rendered.articleFile.relativePath}`
        );
        return undefined;
      }
      const entryId = rendered.result.frontmatter.id;
      const anchorId = buildArticleAnchorId(entryId);
      const categoryLabel = getDirectoryLabel(rendered.articleFile.directory);
      const isBlogCategory = blogCategoryNames.has(categoryLabel);

      let link = '';
      if (
        isBlogCategory &&
        typeof entryId === 'number' &&
        Number.isFinite(entryId)
      ) {
        const categoryPath = resolveCategoryDestinationPath(
          outDir,
          rendered.articleFile.directory,
          frontPage
        );
        const blogOutputDir = dirname(categoryPath);
        const singleFilePath = join(blogOutputDir, `${entryId}.html`);
        const singleRelativePath = toPosixRelativePath(outDir, singleFilePath);
        link = new URL(singleRelativePath, baseUrl).toString();
      } else if (anchorId) {
        const categoryPath = resolveCategoryDestinationPath(
          outDir,
          rendered.articleFile.directory,
          frontPage
        );
        const categoryRelativePath = toPosixRelativePath(outDir, categoryPath);
        link = new URL(
          `${categoryRelativePath}#${anchorId}`,
          baseUrl
        ).toString();
      } else {
        logger.warn(
          `warning: Missing article id for ${rendered.articleFile.relativePath}`
        );
        return undefined;
      }

      const title =
        typeof rendered.result.frontmatter.title === 'string'
          ? rendered.result.frontmatter.title
          : rendered.articleFile.relativePath;

      const frontmatterDescription =
        typeof rendered.result.frontmatter.description === 'string'
          ? rendered.result.frontmatter.description
          : '';
      let summary = frontmatterDescription.trim();
      if (!summary) {
        const markdown = await readFile(
          rendered.articleFile.absolutePath,
          'utf8'
        );
        summary = extractPlainTextFromMarkdown(markdown);
      }
      summary = truncateText(summary, summaryLength);
      if (!summary) {
        summary = truncateText(title, summaryLength);
      }

      return {
        title,
        link,
        date: gitDate,
        dateRfc1123: dayjs(gitDate).toDate().toUTCString(),
        summary,
      } satisfies FeedTemplateEntry;
    })
  );

  return entries.filter((entry): entry is FeedTemplateEntry => !!entry);
};

const sortFeedEntries = (entries: FeedTemplateEntry[]): FeedTemplateEntry[] => {
  const list = [...entries];
  list.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
  return list;
};

export const buildFeedTemplateData = async ({
  logger,
  outDir,
  baseUrl,
  renderedResults,
  variables,
  frontPage,
  blogCategoryNames,
  siteTemplateOutputMap,
}: {
  logger: Logger;
  outDir: string;
  baseUrl: URL;
  renderedResults: readonly RenderedArticleInfo[];
  variables: FunCityVariables;
  frontPage: string;
  blogCategoryNames: ReadonlySet<string>;
  siteTemplateOutputMap: ReadonlyMap<string, string>;
}): Promise<FeedTemplateData> => {
  const summaryLength = resolveFeedSummaryLength(variables);
  const entries = await buildFeedEntries({
    logger,
    outDir,
    baseUrl,
    renderedResults,
    summaryLength,
    frontPage,
    blogCategoryNames,
  });
  const sortedEntries = sortFeedEntries(entries);

  const feedTitle = resolveFeedTitle(variables);
  const feedDescription = resolveFeedDescription(variables);
  const feedLanguage = resolveFeedLanguage(variables);

  const siteLink = new URL('index.html', baseUrl).toString();
  const rssOutputPath =
    siteTemplateOutputMap.get('feed.xml') ?? join(outDir, 'feed.xml');
  const atomOutputPath =
    siteTemplateOutputMap.get('atom.xml') ?? join(outDir, 'atom.xml');
  const rssRelativePath = toPosixRelativePath(outDir, rssOutputPath);
  const atomRelativePath = toPosixRelativePath(outDir, atomOutputPath);
  const rssLink = new URL(rssRelativePath, baseUrl).toString();
  const atomLink = new URL(atomRelativePath, baseUrl).toString();

  const latestDate =
    sortedEntries.length > 0 ? sortedEntries[0]!.date : dayjs().toISOString();

  return {
    feedTitle,
    feedDescription,
    ...(feedLanguage ? { feedLanguage } : {}),
    siteLink,
    rssLink,
    atomLink,
    feedUpdatedRfc1123: dayjs(latestDate).toDate().toUTCString(),
    feedUpdatedIso: dayjs(latestDate).toISOString(),
    feedEntries: sortedEntries,
  };
};
