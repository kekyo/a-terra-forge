// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

const assertThemeScriptBeforeStyles = (template: string) => {
  expect(template).toContain('preferred-theme');
  expect(template).toContain('data-bs-theme');
  expect(template).toContain('prefers-color-scheme');

  const themeIndex = template.indexOf('preferred-theme');
  const styleIndex = template.indexOf('{{stylePath}}');

  expect(styleIndex).toBeGreaterThan(-1);
  expect(themeIndex).toBeGreaterThan(-1);
  expect(themeIndex).toBeLessThan(styleIndex);
};

const assertCommonHeaderImportInHead = (html: string) => {
  const headStart = html.indexOf('<head');
  const headEnd = html.indexOf('</head>');

  expect(headStart).not.toBe(-1);
  expect(headEnd).not.toBe(-1);

  const head = html.slice(headStart, headEnd);
  expect(head).toContain("{{import 'common-header.html'}}");
};

describe('template theme', () => {
  it('applies theme before styles are loaded', async () => {
    const commonHeader = await readFile(
      'scaffold/.templates/common-header.html',
      'utf8'
    );
    const indexTemplate = await readFile(
      'scaffold/.templates/index-timeline.html',
      'utf8'
    );
    const categoryTemplate = await readFile(
      'scaffold/.templates/index-category.html',
      'utf8'
    );
    const blogTemplate = await readFile(
      'scaffold/.templates/index-blog.html',
      'utf8'
    );
    const blogSingleTemplate = await readFile(
      'scaffold/.templates/index-blog-single.html',
      'utf8'
    );

    assertThemeScriptBeforeStyles(commonHeader);
    assertCommonHeaderImportInHead(indexTemplate);
    assertCommonHeaderImportInHead(categoryTemplate);
    assertCommonHeaderImportInHead(blogTemplate);
    assertCommonHeaderImportInHead(blogSingleTemplate);
  });
});
