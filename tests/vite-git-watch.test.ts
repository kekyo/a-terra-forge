// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, writeFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import dayjs from 'dayjs';
import simpleGit from 'simple-git';

import {
  collectGitWatchTargets,
  resolveGitDir,
  resolveGitDirFromRoot,
} from '../src/vite/gitWatch';

///////////////////////////////////////////////////////////////////////////////////

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

describe('vite git watch helpers', () => {
  it('resolves git dir for a repository root.', async (fn) => {
    const rootDir = await createTempDir(fn, 'repo-root');
    const git = simpleGit(rootDir);
    await git.init();

    const resolved = await resolveGitDir(rootDir);
    expect(resolved).toBe(join(rootDir, '.git'));
  });

  it('resolves git dir from a .git file.', async (fn) => {
    const rootDir = await createTempDir(fn, 'repo-file');
    const actualGitDir = resolve(rootDir, 'actual-git');
    await mkdir(actualGitDir, { recursive: true });

    await writeFile(
      join(rootDir, '.git'),
      `gitdir: ${relative(rootDir, actualGitDir)}`,
      'utf8'
    );

    const resolved = await resolveGitDirFromRoot(rootDir);
    expect(resolved).toBe(actualGitDir);
  });

  it('collects git watch targets from an initialized repository.', async (fn) => {
    const rootDir = await createTempDir(fn, 'repo-targets');
    const git = simpleGit(rootDir);
    await git.init();

    const gitDir = await resolveGitDir(rootDir);
    expect(gitDir).toBeDefined();

    const targets = await collectGitWatchTargets(gitDir!);
    expect(targets).toContain(join(gitDir!, 'HEAD'));
  });
});
