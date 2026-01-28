// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import dayjs from 'dayjs';

import { initScaffold } from '../src/init';
import type { Logger } from '../src/types';

///////////////////////////////////////////////////////////////////////////////////

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const writeFixture = async (root: string) => {
  await mkdir(join(root, 'scaffold', 'docs'), { recursive: true });
  await mkdir(join(root, 'scaffold', '.github', 'workflows'), {
    recursive: true,
  });
  await mkdir(join(root, 'scaffold', 'templates'), { recursive: true });
  await mkdir(join(root, 'scaffold', 'vite'), { recursive: true });

  await writeFile(
    join(root, 'scaffold', 'atr.json'),
    '{"variables":{}}',
    'utf8'
  );
  await writeFile(join(root, 'scaffold', '_gitignore'), 'dist/', 'utf8');
  await writeFile(
    join(root, 'scaffold', 'docs', 'index.md'),
    '# Hello',
    'utf8'
  );
  await writeFile(
    join(root, 'scaffold', '.github', 'workflows', 'build.yml'),
    'name: Test',
    'utf8'
  );
  await writeFile(join(root, 'scaffold', 'vite', 'package.json'), '{}', 'utf8');
  await writeFile(
    join(root, 'scaffold', 'vite', 'vite.config.ts'),
    'export default {};',
    'utf8'
  );
  await writeFile(
    join(root, 'scaffold', 'templates', 'index-timeline.html'),
    '<html></html>',
    'utf8'
  );
};

///////////////////////////////////////////////////////////////////////////////////

describe('initScaffold', () => {
  it('copies scaffold, templates, and vite files by default.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source');
    const destination = await createTempDir(fn, 'destination');

    await writeFixture(sourceRoot);

    await initScaffold({
      targetDir: destination,
      sourceRoot: sourceRoot,
      logger: silentLogger,
    });

    expect(existsSync(join(destination, 'atr.json'))).toBe(true);
    expect(existsSync(join(destination, '.gitignore'))).toBe(true);
    expect(existsSync(join(destination, 'docs', 'index.md'))).toBe(true);
    expect(
      existsSync(join(destination, '.github', 'workflows', 'build.yml'))
    ).toBe(true);
    expect(
      existsSync(join(destination, 'templates', 'index-timeline.html'))
    ).toBe(true);
    expect(existsSync(join(destination, 'package.json'))).toBe(true);
    expect(existsSync(join(destination, 'vite.config.ts'))).toBe(true);

    const genStat = await stat(join(destination, 'dist'));
    expect(genStat.isDirectory()).toBe(true);
  });

  it('skips vite files when includeVite is false.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source-no-vite');
    const destination = await createTempDir(fn, 'destination-no-vite');

    await writeFixture(sourceRoot);

    await initScaffold({
      targetDir: destination,
      includeVite: false,
      sourceRoot: sourceRoot,
      logger: silentLogger,
    });

    expect(existsSync(join(destination, 'atr.json'))).toBe(true);
    expect(
      existsSync(join(destination, 'templates', 'index-timeline.html'))
    ).toBe(true);
    expect(existsSync(join(destination, 'package.json'))).toBe(false);
    expect(existsSync(join(destination, 'vite.config.ts'))).toBe(false);
  });

  it('fails when destination has conflicts without force.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source-conflict');
    const destination = await createTempDir(fn, 'destination-conflict');

    await writeFixture(sourceRoot);
    await writeFile(join(destination, 'atr.json'), 'existing', 'utf8');

    await expect(
      initScaffold({
        targetDir: destination,
        sourceRoot: sourceRoot,
        logger: silentLogger,
      })
    ).rejects.toThrow('Use --force');
  });

  it('overwrites conflicts when force is true.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source-force');
    const destination = await createTempDir(fn, 'destination-force');

    await writeFixture(sourceRoot);
    await writeFile(join(destination, 'atr.json'), 'existing', 'utf8');

    await initScaffold({
      targetDir: destination,
      sourceRoot: sourceRoot,
      force: true,
      logger: silentLogger,
    });

    const content = await readFile(join(destination, 'atr.json'), 'utf8');
    expect(content).toBe('{"variables":{}}');
  });
});
