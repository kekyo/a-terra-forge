// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { load as loadYaml, JSON_SCHEMA } from 'js-yaml';

//////////////////////////////////////////////////////////////////////////////

/**
 * Default user agent for markdown processing fetchers.
 */
export const defaultUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.0.0 Safari/537.36';

/**
 * Regex to capture YAML frontmatter block.
 */
const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Check whether a value is a valid article id.
 */
export const isValidArticleId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseFrontmatterYaml = (
  content: string,
  relativePath: string
): Record<string, unknown> | undefined => {
  const match = content.match(frontmatterRegex);
  if (!match) {
    return undefined;
  }
  const yamlContent = match[1] ?? '';
  try {
    const parsed = loadYaml(yamlContent, { schema: JSON_SCHEMA });
    return isRecord(parsed) ? parsed : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse frontmatter YAML (${relativePath}): ${message}`
    );
  }
};

const isTrueString = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().toLowerCase() === 'true';

export interface FrontmatterInfo {
  readonly id?: number;
  readonly draft: boolean;
}

/**
 * Parse frontmatter id/flags from markdown content.
 */
export const parseFrontmatterInfo = (
  content: string,
  relativePath: string
): FrontmatterInfo => {
  const parsed = parseFrontmatterYaml(content, relativePath);
  if (!parsed) {
    return { draft: false };
  }

  const id = isValidArticleId(parsed.id) ? parsed.id : undefined;
  const draftValue = parsed.draft;
  const draft = draftValue === true || isTrueString(draftValue);

  return { id, draft };
};

/**
 * Parse frontmatter id from markdown content.
 */
export const parseFrontmatterId = (
  content: string,
  relativePath: string
): number | undefined => parseFrontmatterInfo(content, relativePath).id;
