// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { posix, resolve, sep } from 'path';
import {
  createCachedFetcher,
  createCardPlugin,
  createMarkdownProcessor,
  createBeautifulMermaidPlugin,
  createMermaidPlugin,
  type BeautifulMermaidPluginOptions,
  type CodeHighlightOptions,
  type MarkdownProcessor,
} from 'mark-deco';
import { createFileSystemCacheStorage } from 'mark-deco/node';
import { createCardOEmbedFallback } from 'mark-deco/card-oembed-fallback';
import { amazonRules, defaultProviderList } from 'mark-deco/misc';

import type { Logger, MermaidRenderer } from '../types';
import {
  normalizeBeautifulMermaidOptions,
  toSafeId,
  writeContentFile,
} from '../utils';

//////////////////////////////////////////////////////////////////////////////

export interface RenderPlanEntry {
  readonly index: number;
  readonly relativePath: string;
  readonly directory: string;
  readonly assignedId: number;
  readonly originalId?: number;
  readonly isDuplicate: boolean;
}

export interface RenderPlan {
  readonly version: 1;
  readonly docsDir: string;
  readonly files: readonly RenderPlanEntry[];
}

export interface RenderedArticleSnapshot {
  readonly index: number;
  readonly relativePath: string;
  readonly directory: string;
  readonly html: string;
  readonly timelineHtml: string;
  readonly frontmatter: Record<string, unknown>;
  readonly uniqueIdPrefix: string;
}

export interface RenderWorkerPayload {
  readonly workerIndex: number;
  readonly docsDir: string;
  readonly workDir: string;
  readonly entries: readonly RenderPlanEntry[];
  readonly cacheDir?: string;
  readonly userAgent: string;
  readonly codeHighlight: CodeHighlightOptions;
  readonly beautifulMermaid?: BeautifulMermaidPluginOptions;
  readonly mermaidRenderer: MermaidRenderer;
  readonly linkTarget?: string;
}

//////////////////////////////////////////////////////////////////////////////

export const createDefaultMarkdownProcessor = ({
  cacheDir,
  userAgent,
  logger,
  mermaidRenderer,
  beautifulMermaid,
}: {
  cacheDir?: string;
  userAgent: string;
  logger: Logger;
  mermaidRenderer: MermaidRenderer;
  beautifulMermaid?: BeautifulMermaidPluginOptions;
}): MarkdownProcessor => {
  const fetcher = createCachedFetcher(
    userAgent,
    undefined,
    createFileSystemCacheStorage(cacheDir ?? '.cache'),
    {
      cacheTTL: 864000000, // 10day
    }
  );

  const cardOEmbedFallback = createCardOEmbedFallback(defaultProviderList);
  const cardPlugin = createCardPlugin({
    scrapingRules: [...amazonRules],
    oembedFallback: cardOEmbedFallback,
  });
  const normalizedBeautifulMermaid =
    mermaidRenderer === 'mermaid'
      ? undefined
      : normalizeBeautifulMermaidOptions(beautifulMermaid);
  const mermaidPlugin =
    mermaidRenderer === 'mermaid'
      ? createMermaidPlugin()
      : createBeautifulMermaidPlugin(normalizedBeautifulMermaid);

  return createMarkdownProcessor({
    plugins: [cardPlugin, mermaidPlugin],
    fetcher,
    logger,
  });
};

//////////////////////////////////////////////////////////////////////////////

const isRelativeUrl = (url: string): boolean => {
  if (url.length === 0 || url.startsWith('#') || url.startsWith('?')) {
    return false;
  }
  if (url.startsWith('/') || url.startsWith('\\')) {
    return false;
  }
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
};

const createTimelineResolveUrl = (directory: string) => {
  const normalizedDirectory = directory === '.' ? '' : directory;
  const posixDirectory = normalizedDirectory.split(sep).join('/');

  return (url: string): string => {
    if (!isRelativeUrl(url) || posixDirectory.length === 0) {
      return url;
    }
    return posix.normalize(posix.join(posixDirectory, url));
  };
};

//////////////////////////////////////////////////////////////////////////////

export const renderArticleSnapshot = async ({
  processor,
  entry,
  docsDir,
  logger,
  codeHighlight,
  linkTarget,
}: {
  processor: MarkdownProcessor;
  entry: RenderPlanEntry;
  docsDir: string;
  logger: Logger;
  codeHighlight: CodeHighlightOptions;
  linkTarget?: string;
}): Promise<RenderedArticleSnapshot> => {
  const absolutePath = resolve(docsDir, entry.relativePath);
  const articleContent = await readFile(absolutePath, 'utf8');
  const uniqueIdPrefix = toSafeId(entry.relativePath);

  const transformed = await processor.processWithFrontmatterTransform(
    articleContent,
    uniqueIdPrefix,
    {
      headingBaseLevel: 2,
      defaultImageOuterClassName: 'article-image-outer',
      codeHighlight,
      linkTarget,
      preTransform: async (ctx) => {
        const hasTitle =
          typeof ctx.originalFrontmatter.title === 'string' &&
          ctx.originalFrontmatter.title.trim().length > 0;
        const updated = {
          ...ctx.originalFrontmatter,
          id: entry.assignedId,
        };

        return {
          frontmatter: updated,
          uniqueIdPrefix: ctx.uniqueIdPrefix,
          // Always lift the first base-level heading into frontmatter.title.
          headerTitleTransform: hasTitle ? 'none' : 'extractAndRemove',
        };
      },
    }
  );

  if (!transformed) {
    throw new Error('Markdown processing was cancelled unexpectedly.');
  }

  if (
    entry.isDuplicate &&
    typeof entry.originalId === 'number' &&
    entry.originalId !== entry.assignedId
  ) {
    logger.warn(
      `Duplicate article id ${entry.originalId} in ${entry.relativePath}; reassigned to ${entry.assignedId}.`
    );
  }

  const updatedMarkdown = transformed.composeMarkdown();
  if (transformed.changed) {
    await writeContentFile(absolutePath, updatedMarkdown);
  }

  const timelineHtml = (
    await processor.process(updatedMarkdown, transformed.uniqueIdPrefix, {
      headingBaseLevel: 2,
      defaultImageOuterClassName: 'article-image-outer',
      codeHighlight,
      linkTarget,
      headerTitleTransform: 'none',
      resolveUrl: createTimelineResolveUrl(entry.directory),
    })
  ).html;

  return {
    index: entry.index,
    relativePath: entry.relativePath,
    directory: entry.directory,
    html: transformed.html,
    timelineHtml,
    frontmatter: transformed.frontmatter as Record<string, unknown>,
    uniqueIdPrefix: transformed.uniqueIdPrefix,
  };
};

export const writeRenderedSnapshot = async (
  workDir: string,
  snapshot: RenderedArticleSnapshot
): Promise<void> => {
  const path = resolve(workDir, 'rendered', `${snapshot.index}.json`);
  await writeContentFile(path, JSON.stringify(snapshot));
};

export const readRenderedSnapshot = async (
  workDir: string,
  index: number
): Promise<RenderedArticleSnapshot> => {
  const path = resolve(workDir, 'rendered', `${index}.json`);
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as RenderedArticleSnapshot;
};

export const getRenderedSnapshotPath = (
  workDir: string,
  index: number
): string => resolve(workDir, 'rendered', `${index}.json`);
