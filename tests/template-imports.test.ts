// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { describe, expect, it } from 'vitest';
import type { FunCityLogEntry } from 'funcity';

import { renderTemplateWithImportHandler } from '../src/process/templates';

describe('template import rendering', () => {
  it('keeps parse error source ids isolated for cached templates.', async () => {
    const templateScript = '{{if true}}';
    const firstPath = '/virtual/templates/first.html';
    const secondPath = '/virtual/templates/second.html';
    const firstLogs: FunCityLogEntry[] = [];
    const secondLogs: FunCityLogEntry[] = [];

    await renderTemplateWithImportHandler(
      firstPath,
      templateScript,
      new Map<string, unknown>(),
      firstLogs,
      [firstPath],
      new AbortController().signal
    );
    await renderTemplateWithImportHandler(
      secondPath,
      templateScript,
      new Map<string, unknown>(),
      secondLogs,
      [secondPath],
      new AbortController().signal
    );

    expect(firstLogs.length).toBeGreaterThan(0);
    expect(secondLogs.length).toBeGreaterThan(0);
    expect(firstLogs.every((log) => log.range.sourceId === firstPath)).toBe(
      true
    );
    expect(secondLogs.every((log) => log.range.sourceId === secondPath)).toBe(
      true
    );
  });
});
