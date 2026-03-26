// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { existsSync } from 'fs';
import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { assertDirectoryExists } from './utils';

///////////////////////////////////////////////////////////////////////////////////

/**
 * A single file or directory copy operation within a scaffold plan.
 */
export interface ScaffoldCopyEntry {
  /** Source path inside the packaged scaffold tree. */
  source: string;
  /** Destination path inside the target workspace. */
  target: string;
  /** True when the entry represents a directory. */
  isDirectory: boolean;
}

/**
 * A source directory copied into a target directory.
 */
export interface ScaffoldCopySource {
  /** Source directory inside the packaged scaffold tree. */
  sourceDir: string;
  /** Target directory in the destination workspace. */
  targetDir: string;
  /** Human-readable label used in validation errors. */
  label: string;
  /** Names excluded while walking the source directory. */
  excludeNames?: ReadonlySet<string>;
}

/**
 * Resolve the package root that contains the bundled scaffold directory.
 */
export const resolvePackageRoot = (override?: string): string => {
  if (override) {
    return resolve(override);
  }
  if (typeof __dirname === 'string') {
    return resolve(__dirname, '..');
  }
  const moduleUrl = import.meta.url;
  if (typeof moduleUrl === 'string' && moduleUrl.startsWith('file:')) {
    return resolve(dirname(fileURLToPath(moduleUrl)), '..');
  }
  return resolve(process.cwd());
};

const collectEntries = async (
  sourceDir: string,
  targetDir: string,
  excludeNames: ReadonlySet<string> | undefined
): Promise<ScaffoldCopyEntry[]> => {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const results: ScaffoldCopyEntry[] = [];

  for (const entry of entries) {
    if (excludeNames?.has(entry.name)) {
      continue;
    }

    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      results.push({
        source: sourcePath,
        target: targetPath,
        isDirectory: true,
      });
      const childEntries = await collectEntries(
        sourcePath,
        targetPath,
        undefined
      );
      results.push(...childEntries);
    } else if (entry.isFile()) {
      results.push({
        source: sourcePath,
        target: targetPath,
        isDirectory: false,
      });
    }
  }

  return results;
};

/**
 * Build a copy plan from one or more scaffold source directories.
 */
export const buildCopyPlanFromSources = async (
  sources: readonly ScaffoldCopySource[]
): Promise<ScaffoldCopyEntry[]> => {
  const entries: ScaffoldCopyEntry[] = [];

  for (const source of sources) {
    await assertDirectoryExists(source.sourceDir, source.label);
    const collectedEntries = await collectEntries(
      source.sourceDir,
      source.targetDir,
      source.excludeNames
    );
    entries.push(...collectedEntries);
  }

  return entries;
};

const ensureDirectoryForCopy = async (
  entry: ScaffoldCopyEntry,
  force: boolean
): Promise<void> => {
  if (entry.isDirectory) {
    if (existsSync(entry.target)) {
      const targetStat = await stat(entry.target);
      if (!targetStat.isDirectory()) {
        if (force) {
          await rm(entry.target, { recursive: true, force: true });
        } else {
          throw new Error(
            `Target exists and is not a directory: ${entry.target}`
          );
        }
      }
    }
    await mkdir(entry.target, { recursive: true });
    return;
  }

  await mkdir(dirname(entry.target), { recursive: true });
  if (existsSync(entry.target)) {
    const targetStat = await stat(entry.target);
    if (targetStat.isDirectory()) {
      if (force) {
        await rm(entry.target, { recursive: true, force: true });
      } else {
        throw new Error(`Target exists and is a directory: ${entry.target}`);
      }
    }
  }
};

/**
 * Execute a scaffold copy plan.
 */
export const executeCopyPlan = async (
  entries: readonly ScaffoldCopyEntry[],
  force: boolean
): Promise<void> => {
  for (const entry of entries) {
    await ensureDirectoryForCopy(entry, force);
    if (!entry.isDirectory) {
      await copyFile(entry.source, entry.target);
    }
  }
};
