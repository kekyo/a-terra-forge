// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { existsSync } from 'fs';
import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

import type { Logger } from './types';
import { assertDirectoryExists, getTrimmingConsoleLogger } from './utils';

///////////////////////////////////////////////////////////////////////////////////

export interface ATerraForgeInitOptions {
  /** Target directory to scaffold into. */
  targetDir: string;
  /** Include Vite scaffold files (defaults to true). */
  includeVite?: boolean;
  /** Overwrite existing files when true. */
  force?: boolean;
  /** Logger implementation (defaults to the trimming console logger when omitted). */
  logger?: Logger;
  /** Override package root path (used for testing). */
  sourceRoot?: string;
}

interface CopyEntry {
  source: string;
  target: string;
  isDirectory: boolean;
}

const resolvePackageRoot = (override?: string): string => {
  if (override) {
    return resolve(override);
  }
  const moduleUrl = import.meta.url;
  if (moduleUrl.startsWith('file:')) {
    return resolve(dirname(fileURLToPath(moduleUrl)), '..');
  }
  return resolve(process.cwd());
};

const collectEntries = async (
  sourceDir: string,
  targetDir: string,
  excludeNames: ReadonlySet<string> | undefined
): Promise<CopyEntry[]> => {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const results: CopyEntry[] = [];

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

const buildCopyPlan = async (
  sourceRoot: string,
  targetDir: string,
  includeVite: boolean
): Promise<CopyEntry[]> => {
  const scaffoldDir = resolve(sourceRoot, 'scaffold');
  const templatesDir = resolve(scaffoldDir, 'templates');
  const viteScaffoldDir = resolve(scaffoldDir, 'vite');

  await assertDirectoryExists(scaffoldDir, 'scaffold');
  await assertDirectoryExists(templatesDir, 'templates');

  const entries: CopyEntry[] = [];
  const scaffoldEntries = await collectEntries(
    scaffoldDir,
    targetDir,
    new Set(['templates', 'vite'])
  );
  entries.push(...scaffoldEntries);

  if (includeVite) {
    await assertDirectoryExists(viteScaffoldDir, 'vite');
    const viteEntries = await collectEntries(
      viteScaffoldDir,
      targetDir,
      undefined
    );
    entries.push(...viteEntries);
  }

  const templateEntries = await collectEntries(
    templatesDir,
    join(targetDir, 'templates'),
    undefined
  );
  entries.push(...templateEntries);

  return entries;
};

const listConflicts = (
  entries: readonly CopyEntry[],
  targetDir: string
): string[] => {
  const conflicts = new Set<string>();
  for (const entry of entries) {
    if (existsSync(entry.target)) {
      const rel = relative(targetDir, entry.target) || entry.target;
      conflicts.add(rel);
    }
  }
  return Array.from(conflicts.values()).sort();
};

const ensureDirectoryForCopy = async (
  entry: CopyEntry,
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

const executeCopyPlan = async (
  entries: readonly CopyEntry[],
  force: boolean
): Promise<void> => {
  for (const entry of entries) {
    await ensureDirectoryForCopy(entry, force);
    if (!entry.isDirectory) {
      await copyFile(entry.source, entry.target);
    }
  }
};

export const initScaffold = async (
  options: Readonly<ATerraForgeInitOptions>
): Promise<void> => {
  const targetDir = resolve(options.targetDir);
  const includeVite = options.includeVite ?? true;
  const force = options.force ?? false;
  const logger = options.logger ?? getTrimmingConsoleLogger();

  const sourceRoot = resolvePackageRoot(options.sourceRoot);
  const entries = await buildCopyPlan(sourceRoot, targetDir, includeVite);

  if (!force) {
    const conflicts = listConflicts(entries, targetDir);
    if (conflicts.length > 0) {
      const preview = conflicts.slice(0, 8).map((item) => `  ${item}`);
      const more =
        conflicts.length > 8 ? `\n  ...and ${conflicts.length - 8} more` : '';
      throw new Error(
        `Destination already contains ${conflicts.length} item(s). Use --force to overwrite.\n${preview.join(
          '\n'
        )}${more}`
      );
    }
  }

  await executeCopyPlan(entries, force);
  await mkdir(join(targetDir, 'dist'), { recursive: true });
  logger.info(`Scaffold created at ${targetDir}`);
};
