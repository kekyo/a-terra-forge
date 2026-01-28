// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';

import { writeContentFile } from './utils';

///////////////////////////////////////////////////////////////////////////////////

export interface ATerraForgeNewOptions {
  /** Markdown document directory. */
  docsDir: string;
  /** Category path. */
  category: string;
}

export interface ATerraForgeNewResult {
  /** Created file path. */
  path: string;
  /** True when index.md was created. */
  isNewCategory: boolean;
}

const indexTemplate = `---\ndraft: true\n---\n\n# New article\n`;
const articleTemplate = `---\ndraft: true\n---\n\n## New section\n`;

const normalizeCategoryInput = (
  value: string
): { segments: string[]; relativeDir: string; displayPath: string } => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Category is required.');
  }
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error('Category must be a relative path.');
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Category is required.');
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Category path must not include "." or "..".');
  }
  if (segments.length > 2) {
    throw new Error(
      `Nested categories are not supported: ${segments.join('/')}`
    );
  }
  return {
    segments,
    relativeDir: join(...segments),
    displayPath: segments.join('/'),
  };
};

const readDirSafe = async (dir: string) => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const ensureDirectoryIfExists = async (
  dir: string,
  label: string
): Promise<void> => {
  if (!existsSync(dir)) {
    return;
  }
  const entryStat = await stat(dir);
  if (!entryStat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${dir}`);
  }
};

const directoryHasDirectFiles = async (dir: string): Promise<boolean> => {
  const entries = await readDirSafe(dir);
  return entries.some((entry) => !entry.isDirectory());
};

const directoryContainsAnyFile = async (dir: string): Promise<boolean> => {
  const entries = await readDirSafe(dir);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (await directoryContainsAnyFile(join(dir, entry.name))) {
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
};

const categoryHasSubcategories = async (dir: string): Promise<boolean> => {
  const entries = await readDirSafe(dir);
  const subdirectories = entries.filter((entry) => entry.isDirectory());
  for (const entry of subdirectories) {
    const subdirPath = join(dir, entry.name);
    if (await directoryContainsAnyFile(subdirPath)) {
      return true;
    }
  }
  return false;
};

const resolveNextArticleName = (dir: string): string => {
  let index = 1;
  while (existsSync(join(dir, `article${index}.md`))) {
    index += 1;
  }
  return `article${index}.md`;
};

export const createNewArticle = async (
  options: Readonly<ATerraForgeNewOptions>
): Promise<ATerraForgeNewResult> => {
  const docsDir = resolve(options.docsDir);
  await ensureDirectoryIfExists(docsDir, 'Docs directory');

  const categoryInfo = normalizeCategoryInput(options.category);
  const categoryDir = resolve(docsDir, categoryInfo.relativeDir);
  await ensureDirectoryIfExists(
    categoryDir,
    `Category "${categoryInfo.displayPath}"`
  );

  if (categoryInfo.segments.length === 2) {
    const parentDir = resolve(docsDir, categoryInfo.segments[0]!);
    await ensureDirectoryIfExists(
      parentDir,
      `Parent category "${categoryInfo.segments[0]!}"`
    );
    if (await directoryHasDirectFiles(parentDir)) {
      throw new Error(
        `Parent category "${categoryInfo.segments[0]!}" already has documents.`
      );
    }
  }

  if (await categoryHasSubcategories(categoryDir)) {
    throw new Error(
      `Category "${categoryInfo.displayPath}" already has subcategories.`
    );
  }

  const hasDirectFiles = await directoryHasDirectFiles(categoryDir);
  const filename = hasDirectFiles
    ? resolveNextArticleName(categoryDir)
    : 'index.md';
  const content = hasDirectFiles ? articleTemplate : indexTemplate;
  const createdPath = resolve(categoryDir, filename);

  await writeContentFile(createdPath, content);

  return {
    path: createdPath,
    isNewCategory: !hasDirectFiles,
  };
};
