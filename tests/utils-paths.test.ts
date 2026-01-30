// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { adjustPath, resolveBuiltLogPath } from '../src/utils';

describe('adjustPath', () => {
  it('adjusts absolute paths between base directories.', () => {
    const fromBasePath = resolve('test_results', 'adjust-path', 'from');
    const toBasePath = resolve('test_results', 'adjust-path', 'to');
    const sourcePath = join(fromBasePath, 'guide', 'index.html');

    const adjusted = adjustPath(sourcePath, fromBasePath, toBasePath);

    expect(adjusted).toBe(join(toBasePath, 'guide', 'index.html'));
  });

  it('adjusts relative paths from the base directory.', () => {
    const fromBasePath = resolve(
      'test_results',
      'adjust-path',
      'from-relative'
    );
    const toBasePath = resolve('test_results', 'adjust-path', 'to-relative');
    const relativePath = join('guide', 'index.html');

    const adjusted = adjustPath(relativePath, fromBasePath, toBasePath);

    expect(adjusted).toBe(join(toBasePath, 'guide', 'index.html'));
  });
});

describe('resolveBuiltLogPath', () => {
  it('uses the config directory as the base when output is within it.', () => {
    const configDir = resolve('test_results', 'built-log', 'site');
    const outDir = join(configDir, 'dist');
    const finalOutDir = outDir;
    const outputPath = join(outDir, 'about', 'index.html');

    const builtPath = resolveBuiltLogPath(
      configDir,
      outputPath,
      outDir,
      finalOutDir
    );

    expect(builtPath).toBe('dist/about/index.html');
  });

  it('uses the output parent as the base when output is outside config.', () => {
    const configDir = resolve('test_results', 'built-log', 'site');
    const previewRoot = resolve('test_results', 'built-log', 'preview-root');
    const outDir = join(previewRoot, 'dist');
    const finalOutDir = outDir;
    const outputPath = join(outDir, 'about', 'index.html');

    const builtPath = resolveBuiltLogPath(
      configDir,
      outputPath,
      outDir,
      finalOutDir
    );

    expect(builtPath).toBe('dist/about/index.html');
  });
});
