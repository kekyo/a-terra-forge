// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { outputErrors, type FunCityLogEntry } from 'funcity';

import {
  createTemplateResolver,
  renderTemplateWithImportHandler,
} from '../src/process/templates';

const createTempDir = async (name: string): Promise<string> =>
  await mkdtemp(join(tmpdir(), `atr-template-imports-${name}-`));

const writeTemplate = async (
  templatesDir: string,
  templateName: string,
  logicalPath: string,
  content: string
) => {
  const filePath = join(templatesDir, templateName, logicalPath);
  await mkdir(join(templatesDir, templateName), { recursive: true });
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
};

const collectErrorLines = (logs: readonly FunCityLogEntry[]): string[] => {
  const lines: string[] = [];
  outputErrors(logs, {
    warn: (message: string) => lines.push(`warn:${message}`),
    error: (message: string) => lines.push(`error:${message}`),
  });
  return lines;
};

const renderTemplate = async (
  templatesDir: string,
  logicalPath: string,
  templateNames: readonly string[] = ['default']
): Promise<{
  readonly logs: FunCityLogEntry[];
  readonly lines: string[];
}> => {
  const resolver = createTemplateResolver(templatesDir, templateNames);
  const template = await resolver.resolveTemplate(logicalPath);
  if (!template) {
    throw new Error(`Template not found for test: ${logicalPath}`);
  }
  const logs: FunCityLogEntry[] = [];
  await renderTemplateWithImportHandler(
    template,
    new Map<string, unknown>(),
    logs,
    [template.path],
    new AbortController().signal
  );
  return {
    logs,
    lines: collectErrorLines(logs),
  };
};

describe('template include rendering', () => {
  it('keeps parse error source ids isolated for cached templates.', async () => {
    const dir = await createTempDir('isolated');
    await writeTemplate(dir, 'default', 'first.html', '{{if true}}');
    await writeTemplate(dir, 'default', 'second.html', '{{if true}}');

    const firstPath = join(dir, 'default', 'first.html');
    const secondPath = join(dir, 'default', 'second.html');
    const firstResult = await renderTemplate(dir, 'first.html');
    const secondResult = await renderTemplate(dir, 'second.html');

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

  it('reports parse errors from included templates using the included path.', async () => {
    const dir = await createTempDir('parse');
    const partialPath = join(dir, 'default', 'partial.html');
    await writeTemplate(
      dir,
      'default',
      'parent.html',
      "{{include 'partial.html'}}"
    );
    await writeTemplate(dir, 'default', 'partial.html', '{{if true}}');

    const result = await renderTemplate(dir, 'parent.html');

    expect(result.lines.some((line) => line.includes(`${partialPath}:`))).toBe(
      true
    );
  });

  it('reports reducer errors from included templates using the included path.', async () => {
    const dir = await createTempDir('reducer');
    const partialPath = join(dir, 'default', 'partial.html');
    await writeTemplate(
      dir,
      'default',
      'parent.html',
      "{{include 'partial.html'}}"
    );
    await writeTemplate(dir, 'default', 'partial.html', '{{missingVar}}');

    const result = await renderTemplate(dir, 'parent.html');

    expect(result.lines.some((line) => line.includes(`${partialPath}:`))).toBe(
      true
    );
    expect(result.lines.some((line) => line.includes('missingVar'))).toBe(true);
  });

  it('reports missing included templates using the importer path.', async () => {
    const dir = await createTempDir('missing');
    const parentPath = join(dir, 'default', 'parent.html');
    const missingPath = join(dir, 'default', 'missing.html');
    await writeTemplate(
      dir,
      'default',
      'parent.html',
      "{{include 'missing.html'}}"
    );

    const result = await renderTemplate(dir, 'parent.html');

    expect(result.lines.some((line) => line.includes(`${parentPath}:`))).toBe(
      true
    );
    expect(
      result.lines.some((line) =>
        line.includes('Include source not found: missing.html')
      )
    ).toBe(true);
    expect(result.lines.some((line) => line.includes(missingPath))).toBe(false);
  });

  it('reports circular includes using the importer node path.', async () => {
    const dir = await createTempDir('circular');
    const partialPath = join(dir, 'default', 'partial.html');
    await writeTemplate(
      dir,
      'default',
      'parent.html',
      "{{include 'partial.html'}}"
    );
    await writeTemplate(
      dir,
      'default',
      'partial.html',
      "{{include 'parent.html'}}"
    );

    const result = await renderTemplate(dir, 'parent.html');

    expect(result.lines.some((line) => line.includes(`${partialPath}:`))).toBe(
      true
    );
    expect(
      result.lines.some((line) => line.includes('circular include detected'))
    ).toBe(true);
  });

  it('keeps import aliases working inside nested includes.', async () => {
    const dir = await createTempDir('alias');
    const partialPath = join(dir, 'default', 'partial.html');
    await writeTemplate(
      dir,
      'default',
      'parent.html',
      "{{include 'partial.html'}}"
    );
    await writeTemplate(
      dir,
      'default',
      'partial.html',
      "{{import 'parent.html'}}"
    );

    const result = await renderTemplate(dir, 'parent.html');

    expect(result.lines.some((line) => line.includes(`${partialPath}:`))).toBe(
      true
    );
    expect(
      result.lines.some((line) => line.includes('circular include detected'))
    ).toBe(true);
  });

  it('falls back to later template directories for missing included templates.', async () => {
    const dir = await createTempDir('fallback');
    await writeTemplate(
      dir,
      'default',
      'parent.html',
      "{{include 'partial.html'}}"
    );
    await writeTemplate(dir, 'default', 'partial.html', '{{if true}}');

    const result = await renderTemplate(dir, 'parent.html', [
      'great',
      'default',
    ]);

    expect(result.lines.length).toBeGreaterThan(0);
    expect(
      result.lines.some((line) =>
        line.includes(join(dir, 'default', 'partial.html'))
      )
    ).toBe(true);
  });

  it('prefers higher-priority template directories for included templates.', async () => {
    const dir = await createTempDir('override');
    await writeTemplate(
      dir,
      'default',
      'parent.html',
      "{{include 'partial.html'}}"
    );
    await writeTemplate(dir, 'default', 'partial.html', '{{missingDefault}}');
    await writeTemplate(dir, 'great', 'partial.html', '{{missingGreat}}');

    const result = await renderTemplate(dir, 'parent.html', [
      'great',
      'default',
    ]);

    expect(
      result.lines.some((line) =>
        line.includes(join(dir, 'great', 'partial.html'))
      )
    ).toBe(true);
    expect(
      result.lines.some((line) =>
        line.includes(join(dir, 'default', 'partial.html'))
      )
    ).toBe(false);
  });
});
