// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import fs from 'fs/promises';
import { readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import * as git from 'isomorphic-git';

//////////////////////////////////////////////////////////////////////////////

const parseGitDir = (content: string): string | undefined => {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^gitdir:\s*(.+)$/i);
    if (match) {
      return match[1]?.trim();
    }
  }
  return undefined;
};

export const resolveGitDirFromRoot = async (
  gitRoot: string
): Promise<string | undefined> => {
  const dotGitPath = join(gitRoot, '.git');
  try {
    const entry = await stat(dotGitPath);
    if (entry.isDirectory()) {
      return dotGitPath;
    }
    if (entry.isFile()) {
      const content = await readFile(dotGitPath, 'utf8');
      const gitDir = parseGitDir(content);
      return gitDir ? resolve(gitRoot, gitDir) : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

export const resolveGitDir = async (
  docsDir: string
): Promise<string | undefined> => {
  let gitRoot: string;
  try {
    gitRoot = await git.findRoot({ fs, filepath: docsDir });
  } catch {
    return undefined;
  }
  return await resolveGitDirFromRoot(gitRoot);
};

export const collectGitWatchTargets = async (
  gitDir: string
): Promise<string[]> => {
  const candidates = [
    join(gitDir, 'HEAD'),
    join(gitDir, 'index'),
    join(gitDir, 'packed-refs'),
    join(gitDir, 'refs', 'heads'),
    join(gitDir, 'logs', 'HEAD'),
  ];
  const targets: string[] = [];
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      targets.push(candidate);
    } catch {
      // ignore missing paths
    }
  }
  return targets;
};
