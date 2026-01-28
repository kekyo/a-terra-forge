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
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const parentDir = dirname(currentDir);
  const candidates = new Set<string>([
    join(currentDir, 'worker.cjs'),
    join(currentDir, 'worker.mjs'),
    join(parentDir, 'worker.cjs'),
    join(parentDir, 'worker.mjs'),
    join(parentDir, '..', 'dist', 'worker.cjs'),
    join(parentDir, '..', 'dist', 'worker.mjs'),
  ]);

  if (typeof __dirname === 'string') {
    const parent = dirname(__dirname);
    candidates.add(join(__dirname, 'worker.cjs'));
    candidates.add(join(__dirname, 'worker.mjs'));
    candidates.add(join(parent, 'worker.cjs'));
    candidates.add(join(parent, 'worker.mjs'));
    candidates.add(join(parent, '..', 'dist', 'worker.cjs'));
    candidates.add(join(parent, '..', 'dist', 'worker.mjs'));
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
};
