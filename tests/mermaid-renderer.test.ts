// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import dayjs from 'dayjs';

import { generateDocs } from '../src/process';

///////////////////////////////////////////////////////////////////////////////////

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

const writeCategoryTemplate = async (templatesDir: string) => {
  await writeFile(
    join(templatesDir, 'index-category.html'),
    "<html><body>{{if (eq mermaidRenderer 'mermaid')}}mermaid-runtime{{end}}{{for article articles}}{{article.entryHtml}}{{end}}</body></html>",
    'utf8'
  );
};

const writeMermaidMarkdown = async (docsDir: string) => {
  const markdownDir = join(docsDir, 'guide');
  await mkdir(markdownDir, { recursive: true });
  await writeFile(
    join(markdownDir, 'index.md'),
    `---
---

# Diagram

\`\`\`mermaid
graph TD
  A-->B
\`\`\`
`,
    'utf8'
  );
};

const writeConfig = async (
  configDir: string,
  variables: Record<string, unknown>,
  extraConfig: Record<string, unknown> = {}
) => {
  const configPath = join(configDir, 'atr.json');
  await writeFile(
    configPath,
    JSON.stringify(
      {
        variables,
        ...extraConfig,
      },
      null,
      2
    ),
    'utf8'
  );
  return configPath;
};

///////////////////////////////////////////////////////////////////////////////////

describe('mermaid renderer', () => {
  it('uses beautiful-mermaid by default', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');
    const configDir = await createTempDir(fn, 'config');

    await writeCategoryTemplate(templatesDir);
    await writeMermaidMarkdown(docsDir);

    const configPath = await writeConfig(configDir, {
      frontPage: 'guide',
    });

    const abortController = new AbortController();
    await generateDocs(
      {
        docsDir: resolve(docsDir),
        templatesDir: resolve(templatesDir),
        outDir: resolve(outDir),
        configPath: resolve(configPath),
      },
      abortController.signal
    );

    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(html).toContain('beautiful-mermaid-wrapper');
    expect(html).not.toContain('class="mermaid-wrapper"');
    expect(html).not.toContain('mermaid-runtime');
  });

  it('renders with mermaid.js when configured', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');
    const configDir = await createTempDir(fn, 'config');

    await writeCategoryTemplate(templatesDir);
    await writeMermaidMarkdown(docsDir);

    const configPath = await writeConfig(configDir, {
      frontPage: 'guide',
      mermaidRenderer: 'mermaid',
    });

    const abortController = new AbortController();
    await generateDocs(
      {
        docsDir: resolve(docsDir),
        templatesDir: resolve(templatesDir),
        outDir: resolve(outDir),
        configPath: resolve(configPath),
      },
      abortController.signal
    );

    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(html).toContain('class="mermaid-wrapper"');
    expect(html).not.toContain('beautiful-mermaid-wrapper');
    expect(html).toContain('mermaid-runtime');
  });

  it('forces css-vars for beautiful-mermaid', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');
    const configDir = await createTempDir(fn, 'config');

    await writeCategoryTemplate(templatesDir);
    await writeMermaidMarkdown(docsDir);

    const configPath = await writeConfig(
      configDir,
      {
        frontPage: 'guide',
      },
      {
        'beautiful-mermaid': {
          theme: {
            light: 'github-light',
            dark: 'github-dark',
          },
          themeMode: 'light',
          themeStrategy: 'inline',
        },
      }
    );

    const abortController = new AbortController();
    await generateDocs(
      {
        docsDir: resolve(docsDir),
        templatesDir: resolve(templatesDir),
        outDir: resolve(outDir),
        configPath: resolve(configPath),
      },
      abortController.signal
    );

    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(html).toContain('beautiful-mermaid-wrapper');
    expect(html).toContain('--mdc-bm-bg:');
    expect(html).toContain('--mdc-bm-fg:');
  });
});
