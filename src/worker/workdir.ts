// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdtemp, mkdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

//////////////////////////////////////////////////////////////////////////////

/**
 * Create a temporary work directory under the given base directory.
 */
export const createWorkDir = async (baseDir: string): Promise<string> => {
  await mkdir(baseDir, { recursive: true });
  return mkdtemp(join(baseDir, 'atr-'));
};

/**
 * Check whether a file exists.
 */
const fileExists = async (path: string): Promise<boolean> => {
  try {
    const result = await stat(path);
    return result.isFile();
  } catch {
    return false;
  }
};

/**
 * Resolve the worker bundle entry path.
 */
export const resolveWorkerEntry = async (): Promise<string | undefined> => {
  const candidates = new Set<string>();

  const currentDir =
    typeof __dirname === 'string'
      ? __dirname
      : typeof import.meta.url === 'string'
        ? dirname(fileURLToPath(import.meta.url))
        : undefined;

  if (currentDir) {
    const parentDir = dirname(currentDir);
    candidates.add(join(currentDir, 'worker.cjs'));
    candidates.add(join(currentDir, 'worker.mjs'));
    candidates.add(join(parentDir, 'worker.cjs'));
    candidates.add(join(parentDir, 'worker.mjs'));
    candidates.add(join(parentDir, '..', 'dist', 'worker.cjs'));
    candidates.add(join(parentDir, '..', 'dist', 'worker.mjs'));
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
};
