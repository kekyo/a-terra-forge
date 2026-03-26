// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, rename, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import dayjs from 'dayjs';
import simpleGit, { type SimpleGit } from 'simple-git';

import { collectGitMetadata } from '../src/gitMetadata';
import type { Logger } from '../src/types';
import type { ArticleFileInfo } from '../src/utils';

///////////////////////////////////////////////////////////////////////////////////

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

const createArticleFileInfo = (
  docsDir: string,
  absolutePath: string
): ArticleFileInfo => {
  const relativePath = relative(docsDir, absolutePath);
  return {
    absolutePath,
    relativePath,
    directory: dirname(relativePath),
  };
};

const initGitRepository = async (siteRoot: string): Promise<SimpleGit> => {
  const repo = simpleGit(siteRoot);
  await repo.init();
  await repo.addConfig('user.name', 'Committer Name');
  await repo.addConfig('user.email', 'committer@example.com');
  return repo;
};

const commitAllWithDate = async (
  repo: SimpleGit,
  date: string,
  message: string
): Promise<void> => {
  await repo.add('.');
  await repo
    .env({
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    })
    .commit(message);
};

const createCapturingLogger = (warnings: string[]): Logger => ({
  debug: () => undefined,
  info: () => undefined,
  warn: (message: string) => {
    warnings.push(message);
  },
  error: () => undefined,
});

///////////////////////////////////////////////////////////////////////////////////

describe('collectGitMetadata history tracing', () => {
  it('tracks created and updated revisions across renames', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-git-history-rename');
    const docsDir = join(siteRoot, 'docs');
    const originalDir = join(docsDir, 'posts');
    const originalPath = join(originalDir, 'original.md');
    const renamedPath = join(originalDir, 'renamed.md');

    await mkdir(originalDir, { recursive: true });
    await writeFile(
      originalPath,
      `---
id: 1
title: Entry
---

# Entry

First body
`,
      'utf8'
    );

    const repo = await initGitRepository(siteRoot);
    await commitAllWithDate(repo, '2024-01-01T00:00:00Z', 'Create entry');

    await rename(originalPath, renamedPath);
    await commitAllWithDate(repo, '2024-02-01T00:00:00Z', 'Rename entry');

    await writeFile(
      renamedPath,
      `---
id: 1
title: Entry
---

# Entry

Updated body
`,
      'utf8'
    );
    await commitAllWithDate(
      repo,
      '2024-03-01T00:00:00Z',
      'Update renamed entry'
    );

    const metadata = await collectGitMetadata(docsDir, [
      createArticleFileInfo(docsDir, renamedPath),
    ]);
    const git = metadata.get(relative(docsDir, renamedPath));

    expect(git).toBeDefined();
    expect(git?.summary).toBe('Update renamed entry');
    expect(git?.file.path).toBe('posts/renamed.md');
    expect(git?.committer.date).toBe('2024-03-01T00:00:00.000Z');
    expect(git?.updated.committer.date).toBe('2024-03-01T00:00:00.000Z');
    expect(git?.created.committer.date).toBe('2024-01-01T00:00:00.000Z');
    expect(git?.updated.summary).toBe('Update renamed entry');
    expect(git?.created.summary).toBe('Create entry');
  });

  it('falls back to matching document ids when rename and edit happen in the same commit', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-git-history-id-fallback');
    const docsDir = join(siteRoot, 'docs');
    const originalDir = join(docsDir, 'notes');
    const movedDir = join(docsDir, 'history');
    const originalPath = join(originalDir, 'entry.md');
    const movedPath = join(movedDir, 'renamed.md');

    await mkdir(originalDir, { recursive: true });
    await writeFile(
      originalPath,
      `---
id: 2
title: Entry
---

# Entry

Original body
`,
      'utf8'
    );

    const repo = await initGitRepository(siteRoot);
    await commitAllWithDate(repo, '2024-01-01T00:00:00Z', 'Create entry');

    await mkdir(movedDir, { recursive: true });
    await rename(originalPath, movedPath);
    await writeFile(
      movedPath,
      `---
id: 2
title: Entry
---

# Entry

Moved and edited body
`,
      'utf8'
    );
    await commitAllWithDate(
      repo,
      '2024-02-01T00:00:00Z',
      'Move and edit entry'
    );

    const metadata = await collectGitMetadata(docsDir, [
      createArticleFileInfo(docsDir, movedPath),
    ]);
    const git = metadata.get(relative(docsDir, movedPath));

    expect(git).toBeDefined();
    expect(git?.summary).toBe('Move and edit entry');
    expect(git?.committer.date).toBe('2024-02-01T00:00:00.000Z');
    expect(git?.updated.committer.date).toBe('2024-02-01T00:00:00.000Z');
    expect(git?.created.committer.date).toBe('2024-01-01T00:00:00.000Z');
    expect(git?.created.summary).toBe('Create entry');
    expect(git?.file.path).toBe('history/renamed.md');
  });

  it('stops id fallback when parent commits contain ambiguous matching ids', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-git-history-ambiguous-id');
    const docsDir = join(siteRoot, 'docs');
    const sourceDir = join(docsDir, 'source');
    const duplicateDir = join(docsDir, 'duplicate');
    const currentDir = join(docsDir, 'current');
    const sourcePath = join(sourceDir, 'entry.md');
    const duplicatePath = join(duplicateDir, 'other.md');
    const currentPath = join(currentDir, 'entry.md');

    await mkdir(sourceDir, { recursive: true });
    await mkdir(duplicateDir, { recursive: true });
    await writeFile(
      sourcePath,
      `---
id: 3
title: Source
---

# Source

Source body
`,
      'utf8'
    );

    const repo = await initGitRepository(siteRoot);
    await commitAllWithDate(
      repo,
      '2024-01-01T00:00:00Z',
      'Create source entry'
    );

    await writeFile(
      duplicatePath,
      `---
id: 3
title: Duplicate
---

# Duplicate

Duplicate body
`,
      'utf8'
    );
    await commitAllWithDate(
      repo,
      '2024-01-15T00:00:00Z',
      'Create duplicate entry'
    );

    await mkdir(currentDir, { recursive: true });
    await rename(sourcePath, currentPath);
    await writeFile(
      currentPath,
      `---
id: 3
title: Current
---

# Current

Current body after move
`,
      'utf8'
    );
    await commitAllWithDate(repo, '2024-02-01T00:00:00Z', 'Move current entry');

    const warnings: string[] = [];
    const metadata = await collectGitMetadata(
      docsDir,
      [createArticleFileInfo(docsDir, currentPath)],
      createCapturingLogger(warnings)
    );
    const git = metadata.get(relative(docsDir, currentPath));

    expect(git).toBeDefined();
    expect(git?.summary).toBe('Move current entry');
    expect(git?.updated.committer.date).toBe('2024-02-01T00:00:00.000Z');
    expect(git?.created.committer.date).toBe('2024-02-01T00:00:00.000Z');
    expect(git?.file.path).toBe('current/entry.md');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('same id 3');
  });
});
