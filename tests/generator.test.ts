// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import dayjs from 'dayjs';
import simpleGit from 'simple-git';
import { defaultProviderList } from 'mark-deco/misc';

import { generateDocs } from '../src/process';
import { copyTargetContentFiles, resolveBuiltLogPath } from '../src/utils';
import type { ATerraForgeProcessingOptions } from '../src/types';

///////////////////////////////////////////////////////////////////////////////////

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

const writeRequiredTemplates = async (
  templatesDir: string,
  options: { indexTemplate?: string; entryTemplate?: string } = {}
) => {
  const indexTemplate =
    options.indexTemplate ?? '<html><body>{{timelineIndexPath}}</body></html>';
  const entryTemplate =
    options.entryTemplate ??
    '<article><header>{{title}}</header><section>{{body}}</section></article>';
  await writeFile(
    join(templatesDir, 'index-timeline.html'),
    indexTemplate,
    'utf8'
  );
  await writeFile(
    join(templatesDir, 'timeline-entry.html'),
    entryTemplate,
    'utf8'
  );
  await writeFile(
    join(templatesDir, 'index-blog.html'),
    '<html><body>{{blogIndexPath}}</body></html>',
    'utf8'
  );
  await writeFile(
    join(templatesDir, 'blog-entry.html'),
    '<article><header>{{title}}</header><section>{{body}}</section></article>',
    'utf8'
  );
};

type OEmbedEndpoint = { url: string; schemes?: string[] };
type OEmbedProvider = { endpoints?: OEmbedEndpoint[] };

const pickOEmbedSample = () => {
  for (const provider of defaultProviderList as OEmbedProvider[]) {
    const endpoints = provider.endpoints ?? [];
    for (const endpoint of endpoints) {
      const schemes = endpoint.schemes ?? [];
      for (const scheme of schemes) {
        const candidate = scheme
          .replace(/\*/g, 'example')
          .replace('{format}', 'json');
        if (!candidate.startsWith('http')) {
          continue;
        }
        try {
          new URL(candidate);
        } catch {
          continue;
        }
        return {
          sampleUrl: candidate,
          endpointUrl: endpoint.url,
        };
      }
    }
  }
  throw new Error('No suitable oEmbed provider found for tests.');
};

describe('generateDocs', () => {
  it('Converts each directory into a single HTML using the fallback template.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(
      join(markdownDir, 'intro.md'),
      `---
---

# Hello

Docs body`,
      'utf8'
    );
    await writeFile(
      join(markdownDir, 'usage.md'),
      `---
---

# Usage

Details here`,
      'utf8'
    );

    const fallbackTemplate =
      '<html><head><link rel="stylesheet" href="{{getSiteTemplatePath \'site-style.css\'}}" /></head><body>Fallback {{for article articles}}{{article.entryHtml}}{{end}}</body></html>';
    await writeFile(
      join(templatesDir, 'index-category.html'),
      fallbackTemplate,
      'utf8'
    );
    const cssContent = 'body { color: red; }';
    await writeFile(join(templatesDir, 'site-style.css'), cssContent, 'utf8');
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const generatedPath = join(outDir, 'guide', 'index.html');
    const html = await readFile(generatedPath, 'utf8');

    expect(html).toContain('Fallback');
    expect(html).toContain('<p>Docs body</p>');
    expect(html).toMatch(/<h2[^>]*>Usage<\/h2>/);
    expect(html).toContain('<p>Details here</p>');
    expect(html).toContain('href="../site-style.css"');

    const copiedCss = await readFile(join(outDir, 'site-style.css'), 'utf8');
    expect(copiedCss).toBe(cssContent);
  });

  it('logs built paths relative to the config directory.', async (fn) => {
    const projectDir = await createTempDir(fn, 'built-log-paths');
    const docsDir = join(projectDir, 'docs');
    const templatesDir = join(projectDir, 'templates');
    const outDir = join(projectDir, 'dist');

    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(
      join(markdownDir, 'index.md'),
      `---
---

# Guide`,
      'utf8'
    );

    await mkdir(templatesDir, { recursive: true });
    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html>{{for article articles}}{{article.entryHtml}}{{end}}</html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const configPath = join(projectDir, 'atr.json');
    await writeFile(configPath, '{}', 'utf8');

    const infoMessages: string[] = [];
    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: resolve(configPath),
      logger: {
        debug: () => undefined,
        info: (message: string) => infoMessages.push(message),
        warn: () => undefined,
        error: () => undefined,
      },
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    expect(infoMessages).toContain('built: dist/index.html');
    expect(infoMessages).toContain('built: dist/guide/index.html');
  });

  it('Renders assets even when no markdown files exist.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');
    const configDir = await createTempDir(fn, 'config');

    const fallbackTemplate =
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>';
    await writeFile(
      join(templatesDir, 'index-category.html'),
      fallbackTemplate,
      'utf8'
    );
    const cssContent = `body { color: {{themeColor}}; }
/* {{formatDate 'YYYY' '2024-02-03'}} */`;
    await writeFile(join(templatesDir, 'site-style.css'), cssContent, 'utf8');
    const scriptContent = `console.log('{{siteName}} {{formatDate 'YYYY-MM-DD' '2024-02-03'}}');`;
    await writeFile(
      join(templatesDir, 'site-script.js'),
      scriptContent,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const config = {
      variables: {
        themeColor: 'tomato',
        siteName: 'Sample Site',
      },
    };
    await writeFile(
      join(configDir, 'atr.json'),
      JSON.stringify(config),
      'utf8'
    );

    const infoMessages: string[] = [];
    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(configDir, 'atr.json'),
      logger: {
        debug: () => undefined,
        info: (message: string) => infoMessages.push(message),
        warn: () => undefined,
        error: () => undefined,
      },
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const copiedCss = await readFile(join(outDir, 'site-style.css'), 'utf8');
    expect(copiedCss).toContain('body { color: tomato; }');
    expect(copiedCss).toContain('/* 2024 */');

    const copiedScript = await readFile(join(outDir, 'site-script.js'), 'utf8');
    expect(copiedScript).toContain('Sample Site 2024-02-03');

    const generatedFiles = await readdir(outDir);
    const htmlFiles = generatedFiles.filter((f) => f.endsWith('.html'));
    expect(htmlFiles).toEqual(['index.html']);

    const expectedCssPath = resolveBuiltLogPath(
      configDir,
      resolve(outDir, 'site-style.css'),
      outDir,
      outDir
    );
    const expectedScriptPath = resolveBuiltLogPath(
      configDir,
      resolve(outDir, 'site-script.js'),
      outDir,
      outDir
    );
    expect(infoMessages).toContain(`built: ${expectedCssPath}`);
    expect(infoMessages).toContain(`built: ${expectedScriptPath}`);
  });

  it('Copies target contents based on glob patterns.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-contents');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    const markdownDir = join(docsDir, 'develop');
    const imageDir = join(markdownDir, 'images');
    await mkdir(imageDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    await writeFile(join(markdownDir, 'index.md'), '# Entry', 'utf8');

    const pngContent = 'png-data';
    await writeFile(join(imageDir, 'logo.png'), pngContent, 'utf8');
    const textContent = 'notes';
    await writeFile(join(markdownDir, 'notes.txt'), textContent, 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'site-style.css'),
      ":root { --primary-rgb: {{toCssRgb primaryColor? '0, 0, 0'}}; --secondary-rgb: {{toCssRgb secondaryColor? '0, 0, 0'}}; }",
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const config = {
      variables: {
        contentFiles: ['develop/**/*.png', 'develop/**/*.txt'],
      },
    };
    await writeFile(join(siteRoot, 'atr.json'), JSON.stringify(config), 'utf8');

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const copiedPng = await readFile(
      join(outDir, 'develop', 'images', 'logo.png'),
      'utf8'
    );
    expect(copiedPng).toBe(pngContent);

    const copiedTxt = await readFile(
      join(outDir, 'develop', 'notes.txt'),
      'utf8'
    );
    expect(copiedTxt).toBe(textContent);
  });

  it('Skips directories when glob patterns include them.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'content-assets');
    const fromDir = join(siteRoot, 'from');
    const toDir = join(siteRoot, 'to');

    const assetsDir = join(fromDir, 'assets');
    const imagesDir = join(assetsDir, 'images');
    await mkdir(imagesDir, { recursive: true });

    const pngContent = 'png-data';
    const textContent = 'notes';
    await writeFile(join(imagesDir, 'logo.png'), pngContent, 'utf8');
    await writeFile(join(assetsDir, 'notes.txt'), textContent, 'utf8');

    const results = await copyTargetContentFiles(fromDir, ['assets/**'], toDir);

    expect(results).toHaveLength(2);
    expect(results.every((result) => result)).toBe(true);

    const copiedPng = await readFile(
      join(toDir, 'assets', 'images', 'logo.png'),
      'utf8'
    );
    expect(copiedPng).toBe(pngContent);

    const copiedTxt = await readFile(
      join(toDir, 'assets', 'notes.txt'),
      'utf8'
    );
    expect(copiedTxt).toBe(textContent);
  });

  it('Copies assetsDir contents into the output root.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');
    const configDir = await createTempDir(fn, 'config');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });
    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const assetsDir = join(configDir, 'assets');
    const imagesDir = join(assetsDir, 'images');
    await mkdir(imagesDir, { recursive: true });
    await writeFile(join(assetsDir, 'favicon.ico'), 'icon', 'utf8');
    await writeFile(join(imagesDir, 'logo.png'), 'logo', 'utf8');

    await writeFile(
      join(configDir, 'atr.json'),
      JSON.stringify({ variables: { siteName: 'Asset test' } }),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(configDir, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const copiedIcon = await readFile(join(outDir, 'favicon.ico'), 'utf8');
    expect(copiedIcon).toBe('icon');

    const copiedLogo = await readFile(
      join(outDir, 'images', 'logo.png'),
      'utf8'
    );
    expect(copiedLogo).toBe('logo');

    await expect(
      readFile(join(outDir, 'assets', 'favicon.ico'), 'utf8')
    ).rejects.toThrow();
  });

  it('Moves a category front page to root and relocates timeline assets.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'front-page-category');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const guideDir = join(docsDir, 'guide');
    const referenceDir = join(docsDir, 'reference');
    await mkdir(guideDir, { recursive: true });
    await mkdir(referenceDir, { recursive: true });

    await writeFile(join(guideDir, 'index.md'), '# Guide', 'utf8');
    await writeFile(join(referenceDir, 'index.md'), '# Reference', 'utf8');

    const guideImagesDir = join(guideDir, 'images');
    const referenceAssetsDir = join(referenceDir, 'assets');
    await mkdir(guideImagesDir, { recursive: true });
    await mkdir(referenceAssetsDir, { recursive: true });
    await writeFile(join(guideImagesDir, 'logo.png'), 'guide-logo', 'utf8');
    await writeFile(join(referenceAssetsDir, 'ref.png'), 'ref-logo', 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>CAT:{{title}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify({
        variables: {
          frontPage: 'guide',
          contentFiles: ['**/*.png'],
          menuOrder: ['timeline'],
        },
      }),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const rootHtml = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(rootHtml).toContain('CAT:Guide');

    await expect(
      readFile(join(outDir, 'guide', 'index.html'), 'utf8')
    ).rejects.toThrow();

    const timelineHtml = await readFile(
      join(outDir, 'timeline', 'index.html'),
      'utf8'
    );
    expect(timelineHtml).toContain('timeline.json');

    const timelineIndex = JSON.parse(
      await readFile(join(outDir, 'timeline', 'timeline.json'), 'utf8')
    );
    const guideEntry = timelineIndex.find(
      (entry: { title: string }) => entry.title === 'Guide'
    );
    const referenceEntry = timelineIndex.find(
      (entry: { title: string }) => entry.title === 'Reference'
    );
    expect(guideEntry?.categoryPath).toBe('../index.html');
    expect(referenceEntry?.categoryPath).toBe('../reference/index.html');

    const guideAsset = await readFile(
      join(outDir, 'images', 'logo.png'),
      'utf8'
    );
    expect(guideAsset).toBe('guide-logo');
    await expect(
      readFile(join(outDir, 'guide', 'images', 'logo.png'), 'utf8')
    ).rejects.toThrow();
    const referenceAsset = await readFile(
      join(outDir, 'reference', 'assets', 'ref.png'),
      'utf8'
    );
    expect(referenceAsset).toBe('ref-logo');
  });

  it('Skips timeline output when timeline is not selected.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'front-page-no-timeline');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const guideDir = join(docsDir, 'guide');
    await mkdir(guideDir, { recursive: true });
    await writeFile(join(guideDir, 'index.md'), '# Guide', 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{title}}</body></html>',
      'utf8'
    );

    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify({ variables: { frontPage: 'guide' } }),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const rootHtml = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(rootHtml).toContain('Guide');

    await expect(
      readFile(join(outDir, 'timeline.json'), 'utf8')
    ).rejects.toThrow();
    await expect(
      readFile(join(outDir, 'timeline', 'index.html'), 'utf8')
    ).rejects.toThrow();
  });

  it('Throws when front page category has subcategories.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'front-page-subcategory');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    const apiDir = join(docsDir, 'guide', 'api');
    await mkdir(apiDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    await writeFile(join(apiDir, 'index.md'), '# API', 'utf8');
    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>CAT</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify({ variables: { frontPage: 'guide' } }),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await expect(generateDocs(options, abortController.signal)).rejects.toThrow(
      'Front page category "guide" does not exist.'
    );
  });

  it('Throws when front page category does not exist.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'front-page-missing');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });
    await writeFile(join(docsDir, 'index.md'), '# Root', 'utf8');
    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>CAT</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify({ variables: { frontPage: 'missing' } }),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await expect(generateDocs(options, abortController.signal)).rejects.toThrow(
      'Front page category "missing" does not exist.'
    );
  });

  it('Keeps previous output when generation fails.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'output-rollback');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'sentinel.txt'), 'keep', 'utf8');

    await writeFile(join(docsDir, 'index.md'), '# Root', 'utf8');
    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>CAT</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify({ variables: { frontPage: 'missing' } }),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await expect(generateDocs(options, abortController.signal)).rejects.toThrow(
      'Front page category "missing" does not exist.'
    );

    const sentinel = await readFile(join(outDir, 'sentinel.txt'), 'utf8');
    expect(sentinel).toBe('keep');
  });

  it('Throws on content file collisions after front page relocation.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'front-page-collision');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const guideImagesDir = join(docsDir, 'guide', 'images');
    const rootImagesDir = join(docsDir, 'images');
    await mkdir(guideImagesDir, { recursive: true });
    await mkdir(rootImagesDir, { recursive: true });
    await writeFile(join(guideImagesDir, 'logo.png'), 'guide', 'utf8');
    await writeFile(join(rootImagesDir, 'logo.png'), 'root', 'utf8');
    await writeFile(join(docsDir, 'guide', 'index.md'), '# Guide', 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>CAT</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify({
        variables: { frontPage: 'guide', contentFiles: ['**/*.png'] },
      }),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await expect(generateDocs(options, abortController.signal)).rejects.toThrow(
      'Content file collision'
    );
  });

  it('Uses the first markdown frontmatter for placeholders while concatenating directory markdown.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdown = `---
id: 1
title: Frontmatter Title
description: Summary here
---

# Article

Main content
`;
    const secondMarkdown = `---
id: 2
title: Second Title
---

# Second

More text
`;
    const markdownDir = join(docsDir, 'article');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, '01-first.md'), markdown, 'utf8');
    await writeFile(join(markdownDir, '02-second.md'), secondMarkdown, 'utf8');

    const template = `
  <html>
  <head>
    <title>{{ title }}</title>
    <link rel="stylesheet" href="{{getSiteTemplatePath 'site-style.css'}}" />
  </head>
  <body>
    <header>{{description}}</header>
    <main class="article">{{for article articles}}{{article.entryHtml}}{{end}}</main>
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    const cssContent = 'body { color: green; }';
    await writeFile(join(templatesDir, 'site-style.css'), cssContent, 'utf8');
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'article', 'index.html'), 'utf8');

    expect(html).toContain('<title>Frontmatter Title</title>');
    expect(html).toContain('<header>Summary here</header>');
    expect(html).toContain('href="../site-style.css"');

    const mainMatch = html.match(/<main class="article">([\s\S]*?)<\/main>/);
    expect(mainMatch).not.toBeNull();
    expect(mainMatch?.[1]).toContain('<p>Main content</p>');
    expect(mainMatch?.[1]).toContain('<p>More text</p>');

    const copiedCss = await readFile(join(outDir, 'site-style.css'), 'utf8');
    expect(copiedCss).toBe(cssContent);
  });

  it('Applies atr.json variables as template placeholders but allows frontmatter to override them.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const markdown = `---
title: Frontmatter Title
---

# Body
`;
    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');

    const template = `
<html>
  <body>
    <header>{{siteName}}</header>
    <h1>{{title}}</h1>
    <p class="tagline">{{tagline}}</p>
    <main>{{for article articles}}{{article.entryHtml}}{{end}}</main>
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const variables = {
      variables: {
        siteName: 'My Site',
        title: 'Defined Title',
        tagline: 'From config',
      },
    };
    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify(variables),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
    };

    const previousCwd = process.cwd();
    process.chdir(siteRoot);
    try {
      const abortController = new AbortController();
      await generateDocs(options, abortController.signal);
    } finally {
      process.chdir(previousCwd);
    }

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');

    expect(html).toContain('<header>My Site</header>');
    expect(html).toContain('<h1>Frontmatter Title</h1>');
    expect(html).toContain('<p class="tagline">From config</p>');
  });

  it('Exposes frontmatter values on articles while protecting internal keys.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdown = `---
id: 42
tags:
  - alpha
  - beta
index: 99
filePath: fake/path.md
fileName: fake-name.md
directory: fake-dir
anchorId: fake-anchor
git: fake-git
entryHtml: fake-entry
---

# Title

Body text
`;
    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');

    const template = `
<html>
  <body>
    {{for article articles}}
      <div
        data-index="{{article.index}}"
        data-file-path="{{article.filePath}}"
        data-file-name="{{article.fileName}}"
        data-directory="{{article.directory}}"
        data-anchor="{{article.anchorId}}"
        data-git="{{article.git}}"
        data-tags="{{for tag article.tags}}{{tag}},{{end}}"
      >{{article.entryHtml}}</div>
    {{end}}
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');

    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-file-path="guide/index.md"');
    expect(html).toContain('data-file-name="fake-name.md"');
    expect(html).toContain('data-directory="guide"');
    expect(html).toContain('data-anchor="article-42"');
    expect(html).toContain('data-tags="alpha,beta,"');
    expect(html).not.toContain('fake/path.md');
    expect(html).not.toContain('fake-dir');
    expect(html).not.toContain('fake-anchor');
    expect(html).not.toContain('fake-git');
    expect(html).not.toContain('fake-entry');
  });

  it('Renders conditional template blocks for optional config variables.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-conditional');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const markdown = `---
title: Entry
---

# Body
`;
    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');

    const template = `
<html>
  <body>
    {{if siteName?}}
    <header>{{siteName}}</header>
    {{else}}
    <header>Missing</header>
    {{end}}
    <main>{{for article articles}}{{article.entryHtml}}{{end}}</main>
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const variables = {
      variables: {
        siteName: 'My Site',
      },
    };
    await writeFile(
      join(siteRoot, 'atr.json'),
      JSON.stringify(variables),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');

    expect(html).toContain('<header>My Site</header>');
    expect(html).not.toContain('<header>Missing</header>');
  });

  it('Assigns new article IDs in relative path order when frontmatter id is missing.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const articleDir = join(docsDir, 'article');
    await mkdir(articleDir, { recursive: true });

    const gamma = `---
title: Gamma
---

# Gamma
`;
    const alpha = `---
title: Alpha
---

# Alpha
`;
    const beta = `---
title: Beta
---

# Beta
`;

    // Intentionally write files in an order that doesn't match path order.
    await writeFile(join(articleDir, 'c-gamma.md'), gamma, 'utf8');
    await writeFile(join(articleDir, 'a-alpha.md'), alpha, 'utf8');
    await writeFile(join(articleDir, 'b-beta.md'), beta, 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'site-style.css'),
      ":root { --primary-rgb: {{toCssRgb primaryColor? '0, 0, 0'}}; --secondary-rgb: {{toCssRgb secondaryColor? '0, 0, 0'}}; }",
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const readId = async (fileName: string) => {
      const md = await readFile(join(articleDir, fileName), 'utf8');
      const match = md.match(/^id:\s*(\d+)/m);
      expect(match).not.toBeNull();
      return Number(match![1]);
    };

    const alphaId = await readId('a-alpha.md');
    const betaId = await readId('b-beta.md');
    const gammaId = await readId('c-gamma.md');

    expect([alphaId, betaId, gammaId]).toEqual([0, 1, 2]);
  });

  it('Skips draft articles but reserves their IDs.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const articleDir = join(docsDir, 'notes');
    await mkdir(articleDir, { recursive: true });

    await writeFile(
      join(articleDir, 'a-disabled.md'),
      `---\n` +
        `id: 0\n` +
        `title: Disabled\n` +
        `draft: true\n` +
        `---\n\n` +
        `# Disabled\n`,
      'utf8'
    );
    await writeFile(
      join(articleDir, 'b-active.md'),
      `---\n` + `title: Active\n` + `---\n\n` + `# Active\n`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.title}};{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'notes', 'index.html'), 'utf8');
    expect(html).toContain('Active');
    expect(html).not.toContain('Disabled');

    const md = await readFile(join(articleDir, 'b-active.md'), 'utf8');
    const match = md.match(/^id:\s*(\d+)/m);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(1);
  });

  it('Orders category articles by frontmatter order with index first.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const articleDir = join(docsDir, 'guide');
    await mkdir(articleDir, { recursive: true });

    await writeFile(
      join(articleDir, 'index.md'),
      `---
title: Index
order: 99
---

# Index`,
      'utf8'
    );
    await writeFile(
      join(articleDir, 'a-alpha.md'),
      `---
title: Alpha
order: 2
---

# Alpha`,
      'utf8'
    );
    await writeFile(
      join(articleDir, 'b-beta.md'),
      `---
title: Beta
order: 1
---

# Beta`,
      'utf8'
    );
    await writeFile(
      join(articleDir, 'c-gamma.md'),
      `---
title: Gamma
---

# Gamma`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.title}};{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    expect(html).toContain('Index;Beta;Alpha;Gamma;');
  });

  it('Renders category entries with index and file name metadata.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const articleDir = join(docsDir, 'guide');
    await mkdir(articleDir, { recursive: true });

    await writeFile(
      join(articleDir, 'index.md'),
      `---
title: Index
---

# Index`,
      'utf8'
    );
    await writeFile(
      join(articleDir, 'note.md'),
      `---
title: Note
---

# Note`,
      'utf8'
    );

    const categoryTemplate = `
<html>
  <body>
    {{for article articles}}<section data-idx="{{article.index}}" data-file="{{article.fileName}}">{{article.entryHtml}}</section>{{end}}
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      categoryTemplate,
      'utf8'
    );
    const entryTemplate =
      '<article data-entry="{{fileName}}">{{contentHtml}}</article>';
    await writeFile(
      join(templatesDir, 'category-entry.html'),
      entryTemplate,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    const firstIndex = html.indexOf('data-idx="0" data-file="index.md"');
    const secondIndex = html.indexOf('data-idx="1" data-file="note.md"');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(html).toContain('data-entry="index.md"');
    expect(html).toContain('data-entry="note.md"');
  });

  it('Extracts titles from headings and injects H2 for subsequent articles.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const articleDir = join(docsDir, 'article');
    await mkdir(articleDir, { recursive: true });
    const firstMarkdown = `---
id: 1
---

# First Title

First body
`;
    const secondMarkdown = `---
id: 2
---

# Second Title

Second body
`;
    await writeFile(join(articleDir, '01-first.md'), firstMarkdown, 'utf8');
    await writeFile(join(articleDir, '02-second.md'), secondMarkdown, 'utf8');

    const template = `
<html>
  <head><title>{{title}}</title></head>
  <body>
    <h1>{{title}}</h1>
    {{for article articles}}{{article.entryHtml}}{{end}}
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'article', 'index.html'), 'utf8');
    expect(html).toContain('<title>First Title</title>');
    expect(html).toContain('<h1>First Title</h1>');
    expect(html).toContain('<p>First body</p>');
    expect(html).not.toContain('<h2>First Title</h2>');
    expect(html).toContain('<h2>Second Title</h2>');
    expect(html).toContain('<p>Second body</p>');

    const firstMd = await readFile(join(articleDir, '01-first.md'), 'utf8');
    expect(firstMd).toMatch(/^title:\s*First Title$/m);
    expect(firstMd).not.toContain('# First Title');
    expect(firstMd).toContain('First body');

    const secondMd = await readFile(join(articleDir, '02-second.md'), 'utf8');
    expect(secondMd).toMatch(/^title:\s*Second Title$/m);
    expect(secondMd).not.toContain('# Second Title');
    expect(secondMd).toContain('Second body');
  });

  it('If a template matching the first markdown exists, it takes precedence.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'intro.md'), '# Title', 'utf8');
    await writeFile(join(markdownDir, 'overview.md'), '# Overview', 'utf8');

    const fallbackTemplate =
      '<body><link rel="stylesheet" href="{{getSiteTemplatePath \'site-style.css\'}}" />Fallback {{for article articles}}{{article.entryHtml}}{{end}}</body>';
    await writeFile(
      join(templatesDir, 'index-category.html'),
      fallbackTemplate,
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'site-style.css'),
      'body { color: red; }',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const specificTemplateDir = join(templatesDir, 'guide');
    await mkdir(specificTemplateDir, { recursive: true });
    const specificTemplate =
      '<body><link rel="stylesheet" href="{{getSiteTemplatePath \'site-style.css\'}}" />Specific template {{for article articles}}{{article.entryHtml}}{{end}} End</body>';
    await writeFile(
      join(specificTemplateDir, 'intro.html'),
      specificTemplate,
      'utf8'
    );
    const specificStyle = 'body { color: blue; }';
    await writeFile(
      join(specificTemplateDir, 'site-style.css'),
      specificStyle,
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');

    expect(html).not.toContain('Specific template');
    expect(html).toContain('Fallback');
    expect(html).toContain('href="../site-style.css"');

    const copiedCss = await readFile(join(outDir, 'site-style.css'), 'utf8');
    expect(copiedCss).toBe('body { color: red; }');
  });

  it('Templates without placeholders will result in an error.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'sample.md'), '# Heading', 'utf8');
    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<body>No placeholder here</body>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    expect(html).toContain('No placeholder here');
    expect(html).not.toContain('Heading');
  });

  it('Provides formatDate helper in template scripts.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdown = `
# Body

Details here
`;
    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');

    const template = `
<html>
  <body>
    <div class="date">{{formatDate 'YYYY/MM/DD' '2024-03-05'}}</div>
    <main>{{for article articles}}{{article.entryHtml}}{{end}}</main>
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    const htmlMatch = html.match(/<div class="date">([^<]+)<\/div>/);
    expect(htmlMatch).not.toBeNull();
    expect(htmlMatch?.[1]).toBe('2024/03/05');
  });

  it('Imports templates and executes scripts in them.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdown = `
# Body

Details here
`;
    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');

    const partial = `<section class="partial">{{formatDate 'YYYY/MM/DD' '2024-03-05'}}</section>`;
    await writeFile(join(templatesDir, 'partial.html'), partial, 'utf8');

    const template = `
<html>
  <body>
    {{import 'partial.html'}}
    <main>{{for article articles}}{{article.entryHtml}}{{end}}</main>
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    const htmlMatch = html.match(/<section class="partial">([^<]+)<\/section>/);
    expect(htmlMatch).not.toBeNull();

    expect(htmlMatch?.[1]).toBe('2024/03/05');
  });

  it('Renders timeline entry templates at build time.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdown = `---
title: Entry
---

# Body

Details here
`;
    await writeFile(join(docsDir, 'index.md'), markdown, 'utf8');

    const pageTemplate =
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>';
    await writeFile(
      join(templatesDir, 'index-category.html'),
      pageTemplate,
      'utf8'
    );

    const indexTemplate = '<html><body>{{timelineIndexPath}}</body></html>';
    await writeFile(
      join(templatesDir, 'index-timeline.html'),
      indexTemplate,
      'utf8'
    );

    const entryTemplate = `
<article>
  <header>{{title}}</header>
  <section>{{body}}</section>
</article>
`;
    await writeFile(
      join(templatesDir, 'timeline-entry.html'),
      entryTemplate,
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const timelineIndex = JSON.parse(
      await readFile(join(outDir, 'timeline.json'), 'utf8')
    );
    expect(timelineIndex).toHaveLength(1);
    expect(timelineIndex[0].entryPath).toBeDefined();

    const entryPath = timelineIndex[0].entryPath as string;
    const entryHtml = await readFile(join(outDir, entryPath), 'utf8');
    expect(entryHtml).toContain('Entry');
    expect(entryHtml).toContain('<p>Details here</p>');
    expect(timelineIndex[0].bodyPath).toBeUndefined();

    const articleBodies = await readdir(join(outDir, 'article-bodies'));
    expect(articleBodies.some((fileName) => fileName.endsWith('.txt'))).toBe(
      false
    );
    expect(articleBodies.some((fileName) => fileName.endsWith('.html'))).toBe(
      true
    );
  });

  it('Prerenders timeline entries when prerenderCount is set.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-timeline-prerender');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    await writeFile(
      join(docsDir, 'first.md'),
      `---\nid: 1\ntitle: First\n---\n\n# First\n\nAlpha\n`,
      'utf8'
    );
    await writeFile(
      join(docsDir, 'second.md'),
      `---\nid: 2\ntitle: Second\n---\n\n# Second\n\nBeta\n`,
      'utf8'
    );

    const categoryTemplate =
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>';
    await writeFile(
      join(templatesDir, 'index-category.html'),
      categoryTemplate,
      'utf8'
    );
    const indexTemplate =
      '<html><body><div id="timeline-list" class="stream-list"{{if prerenderCount?}} data-timeline-prerender="{{prerenderCount}}"{{end}}>{{if prerenderCount?}}{{for entry (slice 0 prerenderCount timelineEntries)}}{{getTimelineEntry entry.entryPath}}{{end}}{{end}}</div></body></html>';
    await writeRequiredTemplates(templatesDir, { indexTemplate });

    const config = {
      variables: {
        prerenderCount: 1,
      },
    };
    await writeFile(join(siteRoot, 'atr.json'), JSON.stringify(config), 'utf8');

    const options: ATerraForgeProcessingOptions = {
      docsDir,
      templatesDir,
      outDir,
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(html).toContain('data-timeline-prerender="1"');
    expect(html).toContain('<p>Beta</p>');
    expect(html).not.toContain('<p>Alpha</p>');
  });

  it('Orders timeline entries by committer date.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-timeline-committer');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const firstPath = join(docsDir, 'first.md');
    const secondPath = join(docsDir, 'second.md');

    await writeFile(
      firstPath,
      `---
title: First
---

# First`,
      'utf8'
    );
    await writeFile(
      secondPath,
      `---
title: Second
---

# Second`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'site-style.css'),
      ":root { --primary-rgb: {{toCssRgb primaryColor? '0, 0, 0'}}; --secondary-rgb: {{toCssRgb secondaryColor? '0, 0, 0'}}; }",
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const git = simpleGit(siteRoot);
    await git.init();
    await git.addConfig('user.name', 'Committer Name');
    await git.addConfig('user.email', 'committer@example.com');

    const commitWithDate = async (filePath: string, date: string) => {
      const relPath = relative(siteRoot, filePath);
      await git.add(relPath);
      await git
        .env({
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        })
        .commit(`Commit ${relPath}`, relPath);
    };

    await commitWithDate(firstPath, '2024-01-01T00:00:00Z');
    await commitWithDate(secondPath, '2024-02-01T00:00:00Z');

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const timelineIndex = JSON.parse(
      await readFile(join(outDir, 'timeline.json'), 'utf8')
    );
    const titles = timelineIndex.map((entry: { title: string }) => entry.title);
    expect(titles[0]).toBe('Second');
    expect(titles[1]).toBe('First');
  });

  it('Places dirty entries at the top of the timeline.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-timeline-dirty');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const firstPath = join(docsDir, 'first.md');
    const secondPath = join(docsDir, 'second.md');

    await writeFile(
      firstPath,
      `---
title: First
---

# First`,
      'utf8'
    );
    await writeFile(
      secondPath,
      `---
title: Second
---

# Second`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const git = simpleGit(siteRoot);
    await git.init();
    await git.addConfig('user.name', 'Committer Name');
    await git.addConfig('user.email', 'committer@example.com');

    const commitWithDate = async (filePath: string, date: string) => {
      const relPath = relative(siteRoot, filePath);
      await git.add(relPath);
      await git
        .env({
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        })
        .commit(`Commit ${relPath}`, relPath);
    };

    await commitWithDate(firstPath, '2024-01-01T00:00:00Z');
    await commitWithDate(secondPath, '2024-02-01T00:00:00Z');

    await writeFile(
      firstPath,
      `---
title: First
---

# First

Dirty edit`,
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const timelineIndex = JSON.parse(
      await readFile(join(outDir, 'timeline.json'), 'utf8')
    );
    const titles = timelineIndex.map((entry: { title: string }) => entry.title);
    expect(titles[0]).toBe('First');
  });

  it('Places uncommitted entries at the top of the timeline.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-timeline-uncommitted');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const committedPath = join(docsDir, 'committed.md');
    const uncommittedPath = join(docsDir, 'uncommitted.md');

    await writeFile(
      committedPath,
      `---
title: Committed
---

# Committed`,
      'utf8'
    );
    await writeFile(
      uncommittedPath,
      `---
title: Uncommitted
---

# Uncommitted`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const git = simpleGit(siteRoot);
    await git.init();
    await git.addConfig('user.name', 'Committer Name');
    await git.addConfig('user.email', 'committer@example.com');

    const relCommitted = relative(siteRoot, committedPath);
    await git.add(relCommitted);
    await git
      .env({
        ...process.env,
        GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
      })
      .commit('Commit committed', relCommitted);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const timelineIndex = JSON.parse(
      await readFile(join(outDir, 'timeline.json'), 'utf8')
    );
    const titles = timelineIndex.map((entry: { title: string }) => entry.title);
    expect(titles[0]).toBe('Uncommitted');
    expect(titles[1]).toBe('Committed');
  });

  it('Renders blog categories with blog.json ordering by git date.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-blog-category');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const blogDir = join(docsDir, 'blog');
    await mkdir(blogDir, { recursive: true });

    const oldPath = join(blogDir, 'index.md');
    const newPath = join(blogDir, 'new.md');
    const draftPath = join(blogDir, 'draft.md');

    await writeFile(
      oldPath,
      `---
title: Old
---

# Old`,
      'utf8'
    );
    await writeFile(
      newPath,
      `---
title: New
---

# New`,
      'utf8'
    );
    await writeFile(
      draftPath,
      `---
title: Draft
---

# Draft`,
      'utf8'
    );

    const fallbackTemplate =
      '<html><body>Fallback {{for article articles}}{{article.entryHtml}}{{end}}</body></html>';
    await writeFile(
      join(templatesDir, 'index-category.html'),
      fallbackTemplate,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);
    const blogIndexTemplate = [
      '<html><body>',
      'BLOG_INDEX {{blogIndexPath}}',
      '<div class="docs" data-blog-index="{{blogIndexPath}}">',
      '<div id="blog-list" class="stream-list"{{if prerenderCount?}} data-blog-prerender="{{prerenderCount}}"{{end}}>',
      '{{for entry (slice 0 prerenderCount blogEntries)}}{{getBlogEntry entry.entryPath}}{{end}}',
      '</div>',
      '<div id="blog-status"></div>',
      '<div id="blog-sentinel"></div>',
      '</div>',
      '</body></html>',
    ].join('\n');
    await writeFile(
      join(templatesDir, 'index-blog.html'),
      blogIndexTemplate,
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'blog-entry.html'),
      '<article>BLOG_ENTRY:{{title}}</article>',
      'utf8'
    );

    const git = simpleGit(siteRoot);
    await git.init();
    await git.addConfig('user.name', 'Committer Name');
    await git.addConfig('user.email', 'committer@example.com');

    const commitWithDate = async (filePath: string, date: string) => {
      const relPath = relative(siteRoot, filePath);
      await git.add(relPath);
      await git
        .env({
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        })
        .commit(`Commit ${relPath}`, relPath);
    };

    await commitWithDate(oldPath, '2024-01-01T00:00:00Z');
    await commitWithDate(newPath, '2024-02-01T00:00:00Z');

    const config = {
      variables: {
        blogCategories: ['blog'],
        prerenderCount: 1,
      },
    };
    await writeFile(join(siteRoot, 'atr.json'), JSON.stringify(config), 'utf8');

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const blogIndex = JSON.parse(
      await readFile(join(outDir, 'blog', 'blog.json'), 'utf8')
    ) as { title: string; entryPath: string }[];
    const titles = blogIndex.map((entry) => entry.title);
    expect(blogIndex).toHaveLength(3);
    expect(titles[0]).toBe('Draft');
    expect(titles[1]).toBe('New');
    expect(titles[2]).toBe('Old');

    const blogHtml = await readFile(join(outDir, 'blog', 'index.html'), 'utf8');
    expect(blogHtml).toContain('BLOG_INDEX');

    const [firstEntry] = blogIndex;
    const entryHtml = await readFile(
      join(outDir, 'blog', firstEntry!.entryPath),
      'utf8'
    );
    expect(entryHtml).toContain('BLOG_ENTRY:Draft');
  });

  it('Resolves relative URLs for timeline article-bodies.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const markdownDir = join(docsDir, 'reference');
    await mkdir(markdownDir, { recursive: true });

    const markdown = `---
title: Reference
---

# Reference

![Chart](git-versioning.png)

[Spec](specs/spec.md)
`;
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');
    await writeFile(join(markdownDir, 'git-versioning.png'), 'image', 'utf8');

    const pageTemplate =
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>';
    await writeFile(
      join(templatesDir, 'index-category.html'),
      pageTemplate,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const timelineIndex = JSON.parse(
      await readFile(join(outDir, 'timeline.json'), 'utf8')
    );
    const entryPath = timelineIndex[0].entryPath as string;
    const entryHtml = await readFile(join(outDir, entryPath), 'utf8');
    expect(entryHtml).toContain('src="reference/git-versioning.png"');
    expect(entryHtml).toContain('href="reference/specs/spec.md"');

    const categoryHtml = await readFile(
      join(outDir, 'reference', 'index.html'),
      'utf8'
    );
    expect(categoryHtml).toContain('src="git-versioning.png"');
    expect(categoryHtml).toContain('href="specs/spec.md"');
  });

  it('Skips category pages when subcategories exist and ignores deeper levels.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    const guideDir = join(docsDir, 'guide');
    const apiDir = join(guideDir, 'api');
    const cliDir = join(guideDir, 'cli');
    const apiV1Dir = join(apiDir, 'v1');
    const referenceDir = join(docsDir, 'reference');
    await mkdir(apiV1Dir, { recursive: true });
    await mkdir(cliDir, { recursive: true });
    await mkdir(referenceDir, { recursive: true });

    await writeFile(
      join(guideDir, 'index.md'),
      `---
title: Guide Top
---

# Guide`,
      'utf8'
    );
    await writeFile(
      join(apiDir, 'index.md'),
      `---
title: API
---

# API`,
      'utf8'
    );
    await writeFile(
      join(cliDir, 'index.md'),
      `---
title: CLI
---

# CLI`,
      'utf8'
    );
    await writeFile(
      join(apiV1Dir, 'index.md'),
      `---
title: API v1
---

# API v1`,
      'utf8'
    );
    await writeFile(
      join(referenceDir, 'index.md'),
      `---
title: Reference
---

# Reference`,
      'utf8'
    );

    const template = [
      '<html><body>',
      '<nav>',
      '{{for navItem navItems}}',
      'NAV:{{navItem.label}}:{{if navItem.href?}}{{navItem.href}}{{else}}none{{end}}:{{navItem.isActive}}',
      '{{if navItem.children?}}',
      '{{for child navItem.children}}',
      'NAVCHILD:{{navItem.label}}:{{child.label}}:{{child.href}}:{{child.isActive}}',
      '{{end}}',
      '{{end}}',
      '{{end}}',
      '</nav>',
      '<main>{{for article articles}}{{article.entryHtml}}{{end}}</main>',
      '</body></html>',
    ].join('\n');
    await writeFile(
      join(templatesDir, 'index-category.html'),
      template,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const warnings: string[] = [];
    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: (message: string) => warnings.push(message),
        error: () => undefined,
      },
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    await expect(
      readFile(join(outDir, 'guide', 'index.html'), 'utf8')
    ).rejects.toThrow();

    const apiHtml = await readFile(
      join(outDir, 'guide', 'api', 'index.html'),
      'utf8'
    );
    expect(apiHtml).toContain('NAV:guide:none:true');
    expect(apiHtml).toContain('NAVCHILD:guide:api:index.html:true');
    expect(apiHtml).toContain('NAVCHILD:guide:cli:../cli/index.html:false');
    expect(apiHtml).toContain('NAV:reference:../../reference/index.html:false');

    const timelineIndex = JSON.parse(
      await readFile(join(outDir, 'timeline.json'), 'utf8')
    );
    const titles = timelineIndex.map((entry: { title: string }) => entry.title);
    expect(timelineIndex).toHaveLength(3);
    expect(titles).toEqual(expect.arrayContaining(['API', 'CLI', 'Reference']));
    expect(titles).not.toContain('Guide Top');
    expect(titles).not.toContain('API v1');

    expect(warnings.some((message) => message.includes(join('guide')))).toBe(
      true
    );
    expect(
      warnings.some((message) => message.includes(join('guide', 'api', 'v1')))
    ).toBe(true);
  });

  it('Orders navigation items using the menu order lists, including timeline.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-nav-order');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const writeDoc = async (directory: string, title: string) => {
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, 'index.md'),
        `---
title: ${title}
---

# ${title}`,
        'utf8'
      );
    };

    await writeDoc(join(docsDir, 'alpha'), 'Alpha');
    await writeDoc(join(docsDir, 'beta'), 'Beta');
    await writeDoc(join(docsDir, 'topics', 'one'), 'One');
    await writeDoc(join(docsDir, 'topics', 'two'), 'Two');

    const navTemplate = [
      '<html><body>',
      '<nav>',
      '{{for navItem navItems}}',
      'LEFT:{{navItem.label}}',
      '{{if navItem.children?}}',
      '{{for child navItem.children}}',
      'LEFTSUB:{{navItem.label}}:{{child.label}}',
      '{{end}}',
      '{{end}}',
      '{{end}}',
      '{{for navItem navItemsAfter}}',
      'RIGHT:{{navItem.label}}',
      '{{if navItem.children?}}',
      '{{for child navItem.children}}',
      'RIGHTSUB:{{navItem.label}}:{{child.label}}',
      '{{end}}',
      '{{end}}',
      '{{end}}',
      '</nav>',
      '</body></html>',
    ].join('\n');
    await writeFile(
      join(templatesDir, 'index-category.html'),
      navTemplate,
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const config = {
      variables: {
        menuOrder: ['beta', 'topics', 'two', 'one'],
        afterMenuOrder: ['alpha', 'timeline'],
      },
    };
    await writeFile(join(siteRoot, 'atr.json'), JSON.stringify(config), 'utf8');

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'beta', 'index.html'), 'utf8');
    const leftLines = html
      .split('\n')
      .filter((line) => line.startsWith('LEFT:'));
    expect(leftLines).toEqual(['LEFT:beta', 'LEFT:topics']);

    const rightLines = html
      .split('\n')
      .filter((line) => line.startsWith('RIGHT:'));
    expect(rightLines).toEqual(['RIGHT:alpha', 'RIGHT:timeline']);

    const subLines = html
      .split('\n')
      .filter((line) => line.startsWith('LEFTSUB:topics:'));
    expect(subLines).toEqual(['LEFTSUB:topics:two', 'LEFTSUB:topics:one']);
  });

  it('Highlights code blocks with Shiki and line numbers.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-highlight');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const markdown = `---
title: Highlight
---

# Highlight

\`\`\`ts {2} /value/#v
const value = 1;
console.log(value);
\`\`\`
`;
    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const config = {
      codeHighlight: {
        languages: ['ts'],
        lineNumbers: true,
      },
    };
    await writeFile(join(siteRoot, 'atr.json'), JSON.stringify(config), 'utf8');

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    expect(html).toContain('data-rehype-pretty-code-figure');
    expect(html).toContain('data-line-numbers');
    expect(html).toContain('data-highlighted-line');
  });

  it('Embeds git metadata into templates when enabled.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-git-metadata');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const markdownDir = join(docsDir, 'notes');
    await mkdir(markdownDir, { recursive: true });

    const firstPath = join(markdownDir, '01-first.md');
    const secondPath = join(markdownDir, '02-second.md');

    await writeFile(
      firstPath,
      `---
id: 1
title: First
---

# First

Body 1`,
      'utf8'
    );
    await writeFile(
      secondPath,
      `---
id: 2
title: Second
---

# Second

Body 2`,
      'utf8'
    );

    const git = simpleGit(siteRoot);
    await git.init();
    await git.addConfig('user.name', 'Committer Name');
    await git.addConfig('user.email', 'committer@example.com');

    const relFirst = relative(siteRoot, firstPath);
    const relSecond = relative(siteRoot, secondPath);

    await git.add(relFirst);
    await git.commit('First commit\n\nDetails line', relFirst, {
      '--author': 'Author One <author1@example.com>',
    });

    await git.add(relSecond);
    await git.commit('Second commit', relSecond, {
      '--author': 'Author Two <author2@example.com>',
    });

    await writeFile(
      firstPath,
      `---
id: 1
title: First
---

# First

Body 1
Dirty edit`,
      'utf8'
    );

    const categoryTemplate = `
<html>
  <body>
    <div id="git-list">
      {{for article articles}}{{article.title}}|{{article.git.shortOid}}|{{article.git.summary}}|{{article.git.committer.email}}|{{article.git.file.path}}|{{article.git.dirty}}|{{article.git.status.head}}|{{article.git.status.workdir}}|{{article.git.status.stage}};{{end}}
    </div>
    <div id="commit-key">COMMITKEY:{{categoryCommitKeyWithDirty}}</div>
    <main>{{for article articles}}{{article.entryHtml}}{{end}}</main>
  </body>
</html>
`;
    await writeFile(
      join(templatesDir, 'index-category.html'),
      categoryTemplate,
      'utf8'
    );

    await writeRequiredTemplates(templatesDir, {
      indexTemplate: '<html><body>{{timelineIndexPath}}</body></html>',
      entryTemplate:
        '<article><header>{{title}}</header><section>{{git.summary}}|{{git.body}}|{{git.author.email}}|{{git.committer.date}}|{{git.committer.email}}|{{git.file.path}}</section></article>',
    });

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      enableGitMetadata: true,
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const categoryHtml = await readFile(
      join(outDir, 'notes', 'index.html'),
      'utf8'
    );
    const firstIndex = categoryHtml.indexOf('First|');
    const secondIndex = categoryHtml.indexOf('Second|');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(categoryHtml).toMatch(
      /First\|[0-9a-f]{7}\|First commit\|committer@example\.com\|notes\/01-first\.md\|true\|\d+\|\d+\|\d+;/
    );
    expect(categoryHtml).toMatch(
      /Second\|[0-9a-f]{7}\|Second commit\|committer@example\.com\|notes\/02-second\.md\|false\|\d+\|\d+\|\d+;/
    );

    const shortOids = Array.from(
      categoryHtml.matchAll(/(First|Second)\|([0-9a-f]{7})\|/g),
      (match) => ({
        title: match[1],
        oid: match[2],
      })
    );
    expect(shortOids).toHaveLength(2);
    const commitKeyMatch = categoryHtml.match(/COMMITKEY:([^<]+)/);
    expect(commitKeyMatch).not.toBeNull();
    const commitKey = commitKeyMatch?.[1];
    expect(commitKey).toBe(`${shortOids[0]!.oid},${shortOids[1]!.oid}:dirty`);

    const entry1 = await readFile(
      join(outDir, 'article-bodies', '1.html'),
      'utf8'
    );
    const entry1Match = entry1.match(
      /First commit\|Details line\|author1@example.com\|([^|]+)\|committer@example.com\|notes\/01-first\.md/
    );
    expect(entry1Match).not.toBeNull();
    const entry1Date = dayjs(entry1Match?.[1]);
    expect(entry1Date.isValid()).toBe(true);

    const entry2 = await readFile(
      join(outDir, 'article-bodies', '2.html'),
      'utf8'
    );
    const entry2Match = entry2.match(
      /Second commit\|\|author2@example.com\|([^|]+)\|committer@example.com\|notes\/02-second\.md/
    );
    expect(entry2Match).not.toBeNull();
    const entry2Date = dayjs(entry2Match?.[1]);
    expect(entry2Date.isValid()).toBe(true);
  });

  it('Generates sitemap.xml with all HTML files when baseUrl is configured.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-sitemap');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const markdown = `---
id: 7
title: Entry
---

# Entry

Body
`;
    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), markdown, 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    await writeFile(
      join(templatesDir, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{{for url sitemapUrls}}
  <url><loc>{{escapeXml url}}</loc></url>
{{end}}
</urlset>
`,
      'utf8'
    );

    const config = {
      variables: {
        baseUrl: 'https://example.com/docs',
      },
    };
    await writeFile(join(siteRoot, 'atr.json'), JSON.stringify(config), 'utf8');

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const sitemap = await readFile(join(outDir, 'sitemap.xml'), 'utf8');
    const locs = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) =>
      match[1]!.trim()
    ).sort();

    const expected = [
      new URL('index.html', 'https://example.com/docs/').toString(),
      new URL('guide/index.html', 'https://example.com/docs/').toString(),
    ].sort();

    expect(locs).toEqual(expected);
  });

  it('Generates RSS/Atom feeds with markdown summaries and excludes uncommitted entries.', async (fn) => {
    const siteRoot = await createTempDir(fn, 'site-feeds');
    const docsDir = join(siteRoot, 'docs');
    const templatesDir = join(siteRoot, 'templates');
    const outDir = join(siteRoot, 'out');

    await mkdir(docsDir, { recursive: true });
    await mkdir(templatesDir, { recursive: true });

    const committedDir = join(docsDir, 'guide');
    await mkdir(committedDir, { recursive: true });
    const committedPath = join(committedDir, 'index.md');
    const draftPath = join(committedDir, 'draft.md');

    await writeFile(
      committedPath,
      `---
id: 7
title: Committed
---

# Committed

![Chart](chart.png)

This is **bold** and [link](https://example.com) text.
`,
      'utf8'
    );
    await writeFile(
      draftPath,
      `---
id: 8
title: Draft
---

# Draft

Draft body
`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    await writeFile(
      join(templatesDir, 'feed.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{{escapeXml feedTitle}}</title>
    <link>{{escapeXml siteLink}}</link>
    <description>{{escapeXml feedDescription}}</description>
    <atom:link href="{{escapeXml rssLink}}" rel="self" type="application/rss+xml" />
    <lastBuildDate>{{escapeXml feedUpdatedRfc1123}}</lastBuildDate>
    {{for entry feedEntries}}
    <item>
      <title>{{escapeXml entry.title}}</title>
      <link>{{escapeXml entry.link}}</link>
      <guid isPermaLink="true">{{escapeXml entry.link}}</guid>
      <pubDate>{{escapeXml entry.dateRfc1123}}</pubDate>
      <description>{{escapeXml entry.summary}}</description>
    </item>
    {{end}}
  </channel>
</rss>
`,
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'atom.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{{escapeXml feedTitle}}</title>
  <id>{{escapeXml siteLink}}</id>
  <link href="{{escapeXml siteLink}}" />
  <link rel="self" href="{{escapeXml atomLink}}" />
  <updated>{{escapeXml feedUpdatedIso}}</updated>
  {{for entry feedEntries}}
  <entry>
    <title>{{escapeXml entry.title}}</title>
    <id>{{escapeXml entry.link}}</id>
    <link rel="alternate" href="{{escapeXml entry.link}}" />
    <updated>{{escapeXml entry.date}}</updated>
    <summary>{{escapeXml entry.summary}}</summary>
  </entry>
  {{end}}
</feed>
`,
      'utf8'
    );

    const config = {
      variables: {
        baseUrl: 'https://example.com/docs',
        feedSummaryLength: 80,
      },
    };
    await writeFile(join(siteRoot, 'atr.json'), JSON.stringify(config), 'utf8');

    const git = simpleGit(siteRoot);
    await git.init();
    await git.addConfig('user.name', 'Committer Name');
    await git.addConfig('user.email', 'committer@example.com');

    const relCommitted = relative(siteRoot, committedPath);
    await git.add(relCommitted);
    await git
      .env({
        ...process.env,
        GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
      })
      .commit('Commit committed', relCommitted);

    const options: ATerraForgeProcessingOptions = {
      docsDir: docsDir,
      templatesDir: templatesDir,
      outDir: outDir,
      cacheDir: '.cache',
      configPath: join(siteRoot, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const rss = await readFile(join(outDir, 'feed.xml'), 'utf8');
    const atom = await readFile(join(outDir, 'atom.xml'), 'utf8');

    expect(rss).toContain('<title>Committed</title>');
    expect(rss).not.toContain('<title>Draft</title>');
    expect(rss).toContain('guide/index.html#article-7');

    const rssSummaryMatch = rss.match(
      /<item>[\s\S]*?<description>([^<]*)<\/description>/
    );
    expect(rssSummaryMatch).not.toBeNull();
    const rssSummary = rssSummaryMatch?.[1] ?? '';
    expect(rssSummary).toContain('Chart');
    expect(rssSummary).not.toContain('![');
    expect(rssSummary).not.toContain('**');
    expect(rssSummary.length).toBeLessThanOrEqual(80);

    expect(atom).toContain('<title>Committed</title>');
    expect(atom).not.toContain('<title>Draft</title>');
    expect(atom).toContain('guide/index.html#article-7');

    const atomSummaryMatch = atom.match(
      /<entry>[\s\S]*?<summary>([^<]*)<\/summary>/
    );
    expect(atomSummaryMatch).not.toBeNull();
    const atomSummary = atomSummaryMatch?.[1] ?? '';
    expect(atomSummary).toContain('Chart');
    expect(atomSummary).not.toContain('![');
    expect(atomSummary).not.toContain('**');
    expect(atomSummary.length).toBeLessThanOrEqual(80);
  });

  it('Sets target _blank for markdown links.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs-links');
    const templatesDir = await createTempDir(fn, 'templates-links');
    const outDir = await createTempDir(fn, 'out-links');

    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(
      join(markdownDir, 'index.md'),
      `---
---

[Link](https://example.com)
`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    expect(html).toContain('target="_blank"');
  });

  it('Uses oEmbed fallback when rendering card blocks.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs-card-oembed');
    const templatesDir = await createTempDir(fn, 'templates-card-oembed');
    const outDir = await createTempDir(fn, 'out-card-oembed');
    const cacheDir = await createTempDir(fn, 'cache-card-oembed');

    const { sampleUrl, endpointUrl } = pickOEmbedSample();
    const endpointCandidates = Array.from(
      new Set([
        endpointUrl,
        endpointUrl.replace('{format}', 'json'),
        endpointUrl.replace('{format}', 'xml'),
      ])
    );

    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(
      join(markdownDir, 'index.md'),
      `---
---

\`\`\`card
${sampleUrl}
\`\`\`
`,
      'utf8'
    );

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    const oembedPayload = {
      type: 'photo',
      version: '1.0',
      title: 'OEmbed Title',
      author_name: 'Tester',
      url: 'https://example.com/image.png',
      width: 640,
      height: 480,
      provider_name: 'Test Provider',
      provider_url: 'https://example.com',
    };

    globalThis.fetch = (async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      fetchCalls.push(url);
      if (endpointCandidates.some((candidate) => url.startsWith(candidate))) {
        return new Response(JSON.stringify(oembedPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === sampleUrl) {
        return new Response(
          '<html><head><meta property="og:title" content="Fallback Title" /></head></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;

    try {
      const options: ATerraForgeProcessingOptions = {
        docsDir: resolve(docsDir),
        templatesDir: resolve(templatesDir),
        outDir: resolve(outDir),
        cacheDir,
      };

      const abortController = new AbortController();
      await generateDocs(options, abortController.signal);
    } finally {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      } else {
        globalThis.fetch = undefined as unknown as typeof fetch;
      }
    }

    const html = await readFile(join(outDir, 'guide', 'index.html'), 'utf8');
    expect(html).toContain('OEmbed Title');
    expect(
      fetchCalls.some((url) =>
        endpointCandidates.some((candidate) => url.startsWith(candidate))
      )
    ).toBe(true);
  });

  it('Computes rgb variables from theme colors for bootstrap mapping.', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs-theme-rgb');
    const templatesDir = await createTempDir(fn, 'templates-theme-rgb');
    const outDir = await createTempDir(fn, 'out-theme-rgb');
    const configDir = await createTempDir(fn, 'config-theme-rgb');

    const markdownDir = join(docsDir, 'guide');
    await mkdir(markdownDir, { recursive: true });
    await writeFile(join(markdownDir, 'index.md'), '# Theme', 'utf8');

    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'site-style.css'),
      ":root { --primary-rgb: {{toCssRgb primaryColor? '0, 0, 0'}}; --secondary-rgb: {{toCssRgb secondaryColor? '0, 0, 0'}}; }",
      'utf8'
    );
    await writeRequiredTemplates(templatesDir);

    const config = {
      variables: {
        primaryColor: '#ff2020',
        secondaryColor: 'rgb(10, 20, 30)',
      },
    };
    await writeFile(
      join(configDir, 'atr.json'),
      JSON.stringify(config),
      'utf8'
    );

    const options: ATerraForgeProcessingOptions = {
      docsDir: resolve(docsDir),
      templatesDir: resolve(templatesDir),
      outDir: resolve(outDir),
      cacheDir: '.cache',
      configPath: join(configDir, 'atr.json'),
    };

    const abortController = new AbortController();
    await generateDocs(options, abortController.signal);

    const css = await readFile(join(outDir, 'site-style.css'), 'utf8');
    expect(css).toContain('--primary-rgb: 255, 32, 32;');
    expect(css).toContain('--secondary-rgb: 10, 20, 30;');
  });
});
