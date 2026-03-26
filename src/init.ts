// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, relative, resolve } from 'path';

import type { Logger } from './types';
import {
  buildCopyPlanFromSources,
  executeCopyPlan,
  resolvePackageRoot,
  type ScaffoldCopyEntry,
  type ScaffoldCopySource,
} from './scaffold';
import { getTrimmingConsoleLogger } from './utils';

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

const buildCopyPlan = async (
  sourceRoot: string,
  targetDir: string,
  includeVite: boolean
): Promise<ScaffoldCopyEntry[]> => {
  const scaffoldDir = resolve(sourceRoot, 'scaffold');
  const templatesDir = resolve(scaffoldDir, '.templates');
  const viteScaffoldDir = resolve(scaffoldDir, 'vite');

  const sources: ScaffoldCopySource[] = [
    {
      sourceDir: scaffoldDir,
      targetDir,
      label: 'scaffold',
      excludeNames: new Set(['.templates', 'vite']),
    },
    {
      sourceDir: templatesDir,
      targetDir: join(targetDir, '.templates'),
      label: '.templates',
    },
  ];

  if (includeVite) {
    sources.splice(1, 0, {
      sourceDir: viteScaffoldDir,
      targetDir,
      label: 'vite',
    });
  }

  const entries = await buildCopyPlanFromSources(sources);
  return entries.map((entry) => {
    if (entry.isDirectory) {
      return entry;
    }
    const relativePath = relative(scaffoldDir, entry.source);
    if (relativePath === '_gitignore') {
      return {
        ...entry,
        target: join(targetDir, '.gitignore'),
      };
    }
    return entry;
  });
};

const listConflicts = (
  entries: readonly ScaffoldCopyEntry[],
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
