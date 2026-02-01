// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';

import type { GitCommitMetadata } from '../types';

//////////////////////////////////////////////////////////////////////////////

/**
 * Base entry data available to templates.
 */
export interface BaseEntry extends Record<string, unknown> {
  readonly id?: number;
  readonly title: string;
  readonly fileName?: string;
  readonly filePath?: string;
  readonly directory?: string;
  readonly anchorId?: string;
  readonly git?: GitCommitMetadata;
  readonly date?: string;
  readonly contentHtml?: string;
  readonly timelineHtml?: string;
  readonly entryHtml?: string;
  readonly entryPath?: string;
}

/**
 * Category entry data.
 */
export interface CategoryEntry extends BaseEntry {
  readonly index: number;
  readonly contentHtml: string;
  readonly entryHtml: string;
}

/**
 * Blog entry data.
 */
export interface BlogEntry extends BaseEntry {
  readonly entryPath: string;
}

/**
 * Timeline entry data.
 */
export interface TimelineEntry extends BaseEntry {
  readonly entryPath: string;
  readonly category?: string;
  readonly categoryPath?: string;
}

/**
 * Minimal index entry for blog.json.
 */
export interface BlogIndexEntry {
  readonly entryPath: string;
}

/**
 * Minimal index entry for timeline.json.
 */
export interface TimelineIndexEntry {
  readonly entryPath: string;
}

const resolveEntryCandidate = (
  value: unknown
): {
  entryHtml?: string;
  contentHtml?: string;
  entryPath?: string;
} => {
  if (typeof value === 'string') {
    return { entryPath: value };
  }
  if (!value || typeof value !== 'object') {
    return {};
  }
  const record = value as Record<string, unknown>;
  const entryHtml =
    typeof record.entryHtml === 'string' ? record.entryHtml : undefined;
  const contentHtml =
    typeof record.contentHtml === 'string' ? record.contentHtml : undefined;
  const entryPath =
    typeof record.entryPath === 'string' ? record.entryPath : undefined;
  return { entryHtml, contentHtml, entryPath };
};

/**
 * Create a template helper to resolve entry HTML.
 */
export const createEntryGetter = (destinationPath: string) => {
  return async (arg0: unknown): Promise<string> => {
    const { entryHtml, contentHtml, entryPath } = resolveEntryCandidate(arg0);
    if (entryHtml && entryHtml.length > 0) {
      return entryHtml;
    }
    if (contentHtml && contentHtml.length > 0) {
      return contentHtml;
    }
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
};
