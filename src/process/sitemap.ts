// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { toPosixRelativePath } from '../utils';

//////////////////////////////////////////////////////////////////////////////

/**
 * Build sitemap URL list from rendered document paths.
 */
export const buildSitemapUrls = ({
  outDir,
  baseUrl,
  documentPaths,
}: {
  outDir: string;
  baseUrl: URL;
  documentPaths: readonly string[];
}): string[] =>
  Array.from(new Set(documentPaths))
    .map((filePath) => toPosixRelativePath(outDir, filePath))
    .sort((a, b) => a.localeCompare(b))
    .map((relativePath) => new URL(relativePath, baseUrl).toString());
