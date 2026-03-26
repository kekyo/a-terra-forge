// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import dayjs from 'dayjs';

import { version as packageVersion } from '../src/generated/packageMetadata';
import type { Logger } from '../src/types';
import { updateScaffold } from '../src/update';

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

const writePackageFixture = async (root: string) => {
  await mkdir(join(root, 'scaffold', '.templates', 'default'), {
    recursive: true,
  });
  await mkdir(join(root, 'scaffold', '.templates', 'default', '.assets'), {
    recursive: true,
  });
  await mkdir(join(root, 'scaffold', 'docs'), { recursive: true });

  await writeFile(
    join(root, 'scaffold', '.templates', 'default', '.assets', 'icon.png'),
    'new-icon'
  );
  await writeFile(
    join(root, 'scaffold', '.templates', 'default', 'site-style.css'),
    'new-style',
    'utf8'
  );
  await writeFile(
    join(root, 'scaffold', 'docs', 'index.md'),
    'new-doc',
    'utf8'
  );
};

const writeConfig = async (
  configPath: string,
  content: Record<string, unknown>
) => {
  await writeFile(configPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
};

///////////////////////////////////////////////////////////////////////////////////

describe('updateScaffold', () => {
  it('overwrites scaffold-managed files and updates atr.json version.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source-default');
    const destination = await createTempDir(fn, 'destination-default');

    await writePackageFixture(sourceRoot);
    await mkdir(join(destination, '.templates', 'default'), {
      recursive: true,
    });
    await mkdir(join(destination, '.templates', 'default', '.assets'), {
      recursive: true,
    });
    await mkdir(join(destination, 'docs'), { recursive: true });
    await writeConfig(join(destination, 'atr.json'), {
      version: '0.1.2',
      variables: {},
    });
    await writeFile(
      join(destination, '.templates', 'default', '.assets', 'icon.png'),
      'old-icon'
    );
    await writeFile(
      join(destination, '.templates', 'default', 'site-style.css'),
      'old-style',
      'utf8'
    );
    await writeFile(join(destination, 'docs', 'index.md'), 'keep-doc', 'utf8');

    await updateScaffold({
      configPath: join(destination, 'atr.json'),
      sourceRoot,
      logger: silentLogger,
    });

    expect(
      await readFile(
        join(destination, '.templates', 'default', '.assets', 'icon.png'),
        'utf8'
      )
    ).toBe('new-icon');
    expect(
      await readFile(
        join(destination, '.templates', 'default', 'site-style.css'),
        'utf8'
      )
    ).toBe('new-style');
    expect(await readFile(join(destination, 'docs', 'index.md'), 'utf8')).toBe(
      'keep-doc'
    );

    const updatedConfig = JSON.parse(
      await readFile(join(destination, 'atr.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(updatedConfig.version).toBe(packageVersion);
    expect(updatedConfig.variables).toEqual({});
  });

  it('respects a custom templates directory from atr.json.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source-custom');
    const destination = await createTempDir(fn, 'destination-custom');

    await writePackageFixture(sourceRoot);
    await mkdir(join(destination, 'custom-templates', 'default'), {
      recursive: true,
    });
    await mkdir(join(destination, 'custom-templates', 'default', '.assets'), {
      recursive: true,
    });
    await writeConfig(join(destination, 'atr.json'), {
      version: '0.1.2',
      variables: {
        templatesDir: 'custom-templates',
      },
    });
    await writeFile(
      join(destination, 'custom-templates', 'default', '.assets', 'icon.png'),
      'old-icon'
    );
    await writeFile(
      join(destination, 'custom-templates', 'default', 'site-style.css'),
      'old-style',
      'utf8'
    );

    await updateScaffold({
      configPath: join(destination, 'atr.json'),
      sourceRoot,
      logger: silentLogger,
    });

    expect(
      await readFile(
        join(destination, 'custom-templates', 'default', '.assets', 'icon.png'),
        'utf8'
      )
    ).toBe('new-icon');
    expect(
      await readFile(
        join(destination, 'custom-templates', 'default', 'site-style.css'),
        'utf8'
      )
    ).toBe('new-style');
  });

  it('fails when the stored version is newer than the CLI version.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source-newer-version');
    const destination = await createTempDir(fn, 'destination-newer-version');

    await writePackageFixture(sourceRoot);
    await writeConfig(join(destination, 'atr.json'), {
      version: '999.0.0',
      variables: {},
    });

    await expect(
      updateScaffold({
        configPath: join(destination, 'atr.json'),
        sourceRoot,
        logger: silentLogger,
      })
    ).rejects.toThrow('newer than atr');
  });

  it('updates even when the stored version is newer if force is enabled.', async (fn) => {
    const sourceRoot = await createTempDir(fn, 'source-force');
    const destination = await createTempDir(fn, 'destination-force');

    await writePackageFixture(sourceRoot);
    await mkdir(join(destination, '.templates', 'default', '.assets'), {
      recursive: true,
    });
    await writeConfig(join(destination, 'atr.json'), {
      version: '999.0.0',
      variables: {},
    });
    await writeFile(
      join(destination, '.templates', 'default', '.assets', 'icon.png'),
      'old-icon'
    );

    await updateScaffold({
      configPath: join(destination, 'atr.json'),
      sourceRoot,
      force: true,
      logger: silentLogger,
    });

    expect(
      await readFile(
        join(destination, '.templates', 'default', '.assets', 'icon.png'),
        'utf8'
      )
    ).toBe('new-icon');

    const updatedConfig = JSON.parse(
      await readFile(join(destination, 'atr.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(updatedConfig.version).toBe(packageVersion);
  });
});
