// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { outputErrors, type FunCityLogEntry } from 'funcity';

import { renderTemplateWithImportHandler } from '../src/process/templates';

const createTempDir = async (name: string): Promise<string> =>
  await mkdtemp(join(tmpdir(), `atr-template-imports-${name}-`));

const collectErrorLines = (logs: readonly FunCityLogEntry[]): string[] => {
  const lines: string[] = [];
  outputErrors(logs, {
    warn: (message: string) => lines.push(`warn:${message}`),
    error: (message: string) => lines.push(`error:${message}`),
  });
  return lines;
};

const renderTemplate = async (
  templatePath: string,
  templateScript: string
): Promise<{
  readonly logs: FunCityLogEntry[];
  readonly lines: string[];
}> => {
  const logs: FunCityLogEntry[] = [];
  await renderTemplateWithImportHandler(
    templatePath,
    templateScript,
    new Map<string, unknown>(),
    logs,
    [templatePath],
    new AbortController().signal
  );
  return {
    logs,
    lines: collectErrorLines(logs),
  };
};

describe('template import rendering', () => {
  it('keeps parse error source ids isolated for cached templates.', async () => {
    const templateScript = '{{if true}}';
    const firstPath = '/virtual/templates/first.html';
    const secondPath = '/virtual/templates/second.html';

    const firstResult = await renderTemplate(firstPath, templateScript);
    const secondResult = await renderTemplate(secondPath, templateScript);

    expect(firstResult.logs.length).toBeGreaterThan(0);
    expect(secondResult.logs.length).toBeGreaterThan(0);
    expect(
      firstResult.logs.every((log) => log.range.sourceId === firstPath)
    ).toBe(true);
    expect(
      secondResult.logs.every((log) => log.range.sourceId === secondPath)
    ).toBe(true);
    expect(
      firstResult.lines.some((line) => line.includes(`${firstPath}:`))
    ).toBe(true);
    expect(
      secondResult.lines.some((line) => line.includes(`${secondPath}:`))
    ).toBe(true);
  });

  it('reports parse errors from imported templates using the imported path.', async () => {
    const dir = await createTempDir('parse');
    const parentPath = join(dir, 'parent.html');
    const partialPath = join(dir, 'partial.html');
    const parentScript = "{{import 'partial.html'}}";

    await writeFile(partialPath, '{{if true}}', 'utf8');

    const result = await renderTemplate(parentPath, parentScript);

    expect(result.lines.some((line) => line.includes(`${partialPath}:`))).toBe(
      true
    );
  });

  it('reports reducer errors from imported templates using the imported path.', async () => {
    const dir = await createTempDir('reducer');
    const parentPath = join(dir, 'parent.html');
    const partialPath = join(dir, 'partial.html');
    const parentScript = "{{import 'partial.html'}}";

    await writeFile(partialPath, '{{missingVar}}', 'utf8');

    const result = await renderTemplate(parentPath, parentScript);

    expect(result.lines.some((line) => line.includes(`${partialPath}:`))).toBe(
      true
    );
    expect(result.lines.some((line) => line.includes('missingVar'))).toBe(true);
  });

  it('reports missing imported templates using the importer path.', async () => {
    const dir = await createTempDir('missing');
    const parentPath = join(dir, 'parent.html');
    const missingPath = join(dir, 'missing.html');
    const parentScript = "{{import 'missing.html'}}";

    const result = await renderTemplate(parentPath, parentScript);

    expect(result.lines.some((line) => line.includes(`${parentPath}:`))).toBe(
      true
    );
    expect(
      result.lines.some((line) =>
        line.includes('failed to read imported template')
      )
    ).toBe(true);
    expect(result.lines.some((line) => line.includes(missingPath))).toBe(true);
  });

  it('reports circular imports using the importer node path.', async () => {
    const dir = await createTempDir('circular');
    const parentPath = join(dir, 'parent.html');
    const partialPath = join(dir, 'partial.html');
    const parentScript = "{{import 'partial.html'}}";

    await writeFile(parentPath, parentScript, 'utf8');
    await writeFile(partialPath, "{{import 'parent.html'}}", 'utf8');

    const result = await renderTemplate(parentPath, parentScript);

    expect(result.lines.some((line) => line.includes(`${partialPath}:`))).toBe(
      true
    );
    expect(
      result.lines.some((line) => line.includes('circular import detected'))
    ).toBe(true);
  });
});
