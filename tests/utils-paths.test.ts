// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { adjustPath } from '../src/utils';

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
