// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { cp, mkdir, readFile, stat, symlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import dayjs from 'dayjs';

///////////////////////////////////////////////////////////////////////////////////

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);
const distIndex = resolve('dist', 'index.cjs');
const indexTemplate = `---\ndraft: true\n---\n\n# New article\n`;
const articleTemplate = `---\ndraft: true\n---\n\n## New section\n`;

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = resolve('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

const runNode = (args: string[], cwd?: string) => {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  return result;
};

const copyScaffold = async (fn: TestContext, name: string) => {
  const destination = await createTempDir(fn, name);
  await cp(resolve('scaffold'), destination, { recursive: true });
  return destination;
};

const expectSuccess = (result: ReturnType<typeof runNode>) => {
  if (result.status !== 0) {
    throw new Error(
      `Command failed with status ${result.status}.\n` +
        `stdout:\n${result.stdout}\n` +
        `stderr:\n${result.stderr}`
    );
  }
};

///////////////////////////////////////////////////////////////////////////////////

describe('CLI distribution', () => {
  it('prints help when executed via a symlinked bin.', async (fn) => {
    const destination = await createTempDir(fn, 'symlink-bin');
    const symlinkPath = join(destination, 'atr');

    await symlink(distIndex, symlinkPath);

    const result = runNode([symlinkPath, '--help'], destination);
    expectSuccess(result);
    expect(result.stdout).toContain('Usage: atr');
  });

  it('initializes scaffold without vite from the dist CLI.', async (fn) => {
    const destination = await createTempDir(fn, 'init');

    const result = runNode([distIndex, 'init', '--no-vite'], destination);
    expectSuccess(result);

    expect(existsSync(join(destination, 'atr.json'))).toBe(true);
    expect(existsSync(join(destination, 'docs', 'hello', 'index.md'))).toBe(
      true
    );
    expect(
      existsSync(join(destination, 'templates', 'index-timeline.html'))
    ).toBe(true);
    expect(existsSync(join(destination, 'vite.config.ts'))).toBe(false);

    const distStat = await stat(join(destination, 'dist'));
    expect(distStat.isDirectory()).toBe(true);
  });

  it('builds site assets with explicit scaffold paths.', async (fn) => {
    const outDir = await createTempDir(fn, 'build');
    const scaffoldRoot = await copyScaffold(fn, 'scaffold');

    const result = runNode(
      [
        distIndex,
        'build',
        '--log',
        'error',
        '--config',
        resolve(scaffoldRoot, 'atr.json'),
        '--docs',
        resolve(scaffoldRoot, 'docs'),
        '--templates',
        resolve(scaffoldRoot, 'templates'),
        '--out',
        outDir,
      ],
      process.cwd()
    );
    expectSuccess(result);

    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
  });

  it('builds immediately after init without git metadata.', async (fn) => {
    const destination = await createTempDir(fn, 'init-build');

    const initResult = runNode([distIndex, 'init', '--no-vite'], destination);
    expectSuccess(initResult);

    const buildResult = runNode([distIndex, 'build'], destination);
    expectSuccess(buildResult);
    expect(buildResult.stdout).not.toContain('variable is not bound');
    expect(buildResult.stderr).not.toContain('variable is not bound');

    expect(existsSync(join(destination, 'dist', 'index.html'))).toBe(true);
  });

  it('creates index.md for a new category.', async (fn) => {
    const destination = await copyScaffold(fn, 'new-category');

    const result = runNode([distIndex, 'new', 'news'], destination);
    expectSuccess(result);

    const createdPath = join(destination, 'docs', 'news', 'index.md');
    expect(existsSync(createdPath)).toBe(true);
    const content = await readFile(createdPath, 'utf8');
    expect(content).toBe(indexTemplate);
  });

  it('creates article<n>.md for an existing category.', async (fn) => {
    const destination = await copyScaffold(fn, 'existing-category');

    const result = runNode([distIndex, 'new', 'hello'], destination);
    expectSuccess(result);

    const createdPath = join(destination, 'docs', 'hello', 'article1.md');
    expect(existsSync(createdPath)).toBe(true);
    const content = await readFile(createdPath, 'utf8');
    expect(content).toBe(articleTemplate);
  });

  it('treats categories with non-markdown files as existing.', async (fn) => {
    const destination = await copyScaffold(fn, 'existing-non-md');
    const assetsDir = join(destination, 'docs', 'assets');
    await mkdir(assetsDir, { recursive: true });
    await writeFile(join(assetsDir, 'image.png'), 'data', 'utf8');

    const result = runNode([distIndex, 'new', 'assets'], destination);
    expectSuccess(result);

    expect(existsSync(join(assetsDir, 'article1.md'))).toBe(true);
    expect(existsSync(join(assetsDir, 'index.md'))).toBe(false);
  });

  it('fails when creating a subcategory under a parent with documents.', async (fn) => {
    const destination = await copyScaffold(fn, 'subcategory-parent-docs');

    const result = runNode([distIndex, 'new', 'hello/sub'], destination);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already has documents');
  });

  it('fails when the category already has subcategories.', async (fn) => {
    const destination = await copyScaffold(fn, 'subcategory-exists');
    const subcategoryDir = join(destination, 'docs', 'guides', 'intro');
    await mkdir(subcategoryDir, { recursive: true });
    await writeFile(join(subcategoryDir, 'note.txt'), 'note', 'utf8');

    const result = runNode([distIndex, 'new', 'guides'], destination);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already has subcategories');
  });
});
