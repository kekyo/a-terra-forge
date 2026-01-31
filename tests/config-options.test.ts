// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';

import {
  defaultAssetDir,
  defaultCacheDir,
  defaultDocsDir,
  defaultOutDir,
  defaultTemplatesDir,
  defaultTmpDir,
  mergeATerraForgeConfig,
  loadATerraForgeConfig,
  resolveATerraForgeConfigPathFromDir,
  resolveATerraForgeProcessingOptionsFromVariables,
} from '../src/utils';
import type {
  ATerraForgeConfig,
  ATerraForgeConfigOverrides,
} from '../src/types';

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = resolve('test_results', 'config-path', fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

describe('resolveATerraForgeProcessingOptionsFromVariables', () => {
  it('resolves relative paths against the config directory.', () => {
    const baseDir = resolve('test_results', 'options');
    const variables = new Map<string, unknown>([
      ['docsDir', './docs'],
      ['templatesDir', 'templates'],
      ['assetsDir', './assets'],
      ['outDir', '../out'],
      ['tmpDir', './tmp'],
      ['cacheDir', '.cache'],
      ['userAgent', 'agent'],
      ['siteName', 'Sample'],
    ]);

    const resolved = resolveATerraForgeProcessingOptionsFromVariables(
      variables,
      baseDir
    );

    expect(resolved.docsDir).toBe(resolve(baseDir, './docs'));
    expect(resolved.templatesDir).toBe(resolve(baseDir, 'templates'));
    expect(resolved.assetsDir).toBe(resolve(baseDir, './assets'));
    expect(resolved.outDir).toBe(resolve(baseDir, '../out'));
    expect(resolved.tmpDir).toBe(resolve(baseDir, './tmp'));
    expect(resolved.cacheDir).toBe(resolve(baseDir, '.cache'));
    expect(resolved.userAgent).toBe('agent');
  });

  it('ignores non-string values for option variables.', () => {
    const baseDir = resolve('test_results', 'options-non-string');
    const variables = new Map<string, unknown>([
      ['docsDir', 123],
      ['templatesDir', false],
      ['assetsDir', 456],
      ['outDir', null],
      ['tmpDir', 123],
      ['cacheDir', {}],
    ]);

    const resolved = resolveATerraForgeProcessingOptionsFromVariables(
      variables,
      baseDir
    );

    expect(resolved.docsDir).toBeUndefined();
    expect(resolved.templatesDir).toBeUndefined();
    expect(resolved.assetsDir).toBeUndefined();
    expect(resolved.outDir).toBeUndefined();
    expect(resolved.tmpDir).toBeUndefined();
    expect(resolved.cacheDir).toBeUndefined();
  });
});

describe('resolveATerraForgeConfigPathFromDir', () => {
  it('prefers atr.json5 over other config names.', async (fn) => {
    const root = await createTempDir(fn, 'prefer-json5');
    await writeFile(resolve(root, 'atr.json'), '{}', 'utf8');
    await writeFile(resolve(root, 'atr.jsonc'), '{}', 'utf8');
    await writeFile(resolve(root, 'atr.json5'), '{}', 'utf8');

    const resolved = resolveATerraForgeConfigPathFromDir(root);

    expect(resolved).toBe(resolve(root, 'atr.json5'));
  });

  it('falls back to atr.jsonc when atr.json5 is absent.', async (fn) => {
    const root = await createTempDir(fn, 'fallback-jsonc');
    await writeFile(resolve(root, 'atr.json'), '{}', 'utf8');
    await writeFile(resolve(root, 'atr.jsonc'), '{}', 'utf8');

    const resolved = resolveATerraForgeConfigPathFromDir(root);

    expect(resolved).toBe(resolve(root, 'atr.jsonc'));
  });

  it('falls back to atr.json when only atr.json exists.', async (fn) => {
    const root = await createTempDir(fn, 'fallback-json');
    await writeFile(resolve(root, 'atr.json'), '{}', 'utf8');

    const resolved = resolveATerraForgeConfigPathFromDir(root);

    expect(resolved).toBe(resolve(root, 'atr.json'));
  });

  it('defaults to atr.json when no config file exists.', async (fn) => {
    const root = await createTempDir(fn, 'fallback-none');

    const resolved = resolveATerraForgeConfigPathFromDir(root);

    expect(resolved).toBe(resolve(root, 'atr.json'));
  });
});

describe('mergeATerraForgeConfig', () => {
  it('merges variables but replaces other config blocks.', () => {
    const baseConfig: ATerraForgeConfig = {
      variables: new Map<string, unknown>([
        ['siteName', 'Base'],
        ['docsDir', 'docs'],
        ['contentFiles', ['a.txt']],
        ['menuOrder', ['alpha']],
        ['afterMenuOrder', ['omega']],
      ]),
      messages: new Map([['', new Map([['hello', 'base']])]]),
      codeHighlight: {},
      contentFiles: ['a.txt'],
      menuOrder: ['alpha'],
      afterMenuOrder: ['omega'],
      blogCategories: [],
    };

    const overrides: ATerraForgeConfigOverrides = {
      variables: new Map<string, unknown>([
        ['siteName', 'Override'],
        ['menuOrder', ['beta']],
      ]),
      messages: new Map([['', new Map([['hello', 'override']])]]),
    };

    const merged = mergeATerraForgeConfig(baseConfig, overrides, 'atr.json');

    expect(merged.variables.get('siteName')).toBe('Override');
    expect(merged.variables.get('docsDir')).toBe('docs');
    expect(merged.variables.get('menuOrder')).toEqual(['beta']);
    expect(merged.messages.get('')?.get('hello')).toBe('override');
    expect(merged.contentFiles).toEqual(['a.txt']);
    expect(merged.menuOrder).toEqual(['beta']);
    expect(merged.afterMenuOrder).toEqual(['omega']);
  });
});

describe('loadATerraForgeConfig', () => {
  it('defaults locale to en when missing.', async (fn) => {
    const root = await createTempDir(fn, 'default-locale');
    const configPath = resolve(root, 'atr.json');
    await writeFile(configPath, '{}', 'utf8');

    const config = await loadATerraForgeConfig(configPath);

    expect(config.variables.get('locale')).toBe('en');
  });

  it('fills directory variables with defaults when missing.', async (fn) => {
    const root = await createTempDir(fn, 'default-dirs');
    const configPath = resolve(root, 'atr.json');
    await writeFile(configPath, '{}', 'utf8');

    const config = await loadATerraForgeConfig(configPath);

    expect(config.variables.get('docsDir')).toBe(defaultDocsDir);
    expect(config.variables.get('templatesDir')).toBe(defaultTemplatesDir);
    expect(config.variables.get('assetsDir')).toBe(defaultAssetDir);
    expect(config.variables.get('outDir')).toBe(defaultOutDir);
    expect(config.variables.get('tmpDir')).toBe(defaultTmpDir);
    expect(config.variables.get('cacheDir')).toBe(defaultCacheDir);
  });

  it('reads codeHighlight from variables when top-level is missing.', async (fn) => {
    const root = await createTempDir(fn, 'code-highlight-variables');
    const configPath = resolve(root, 'atr.json');
    await writeFile(
      configPath,
      JSON.stringify({
        variables: {
          codeHighlight: {
            lineNumbers: true,
          },
        },
      }),
      'utf8'
    );

    const config = await loadATerraForgeConfig(configPath);

    expect(config.codeHighlight.lineNumbers).toBe(true);
    expect(config.variables.get('codeHighlight')).toEqual({
      lineNumbers: true,
    });
  });

  it('prefers top-level codeHighlight over variables.', async (fn) => {
    const root = await createTempDir(fn, 'code-highlight-precedence');
    const configPath = resolve(root, 'atr.json');
    await writeFile(
      configPath,
      JSON.stringify({
        codeHighlight: {
          lineNumbers: false,
        },
        variables: {
          codeHighlight: {
            lineNumbers: true,
          },
        },
      }),
      'utf8'
    );

    const config = await loadATerraForgeConfig(configPath);

    expect(config.codeHighlight.lineNumbers).toBe(false);
  });
});
