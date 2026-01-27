// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

const assertThemeScriptInHead = (html: string) => {
  const headStart = html.indexOf('<head');
  const headEnd = html.indexOf('</head>');

  expect(headStart).not.toBe(-1);
  expect(headEnd).not.toBe(-1);

  const head = html.slice(headStart, headEnd);

  expect(head).toContain('preferred-theme');
  expect(head).toContain('data-bs-theme');
  expect(head).toContain('prefers-color-scheme');

  const themeIndex = head.indexOf('preferred-theme');
  const styleIndex = head.indexOf('{{stylePath}}');

  expect(styleIndex).toBeGreaterThan(-1);
  expect(themeIndex).toBeGreaterThan(-1);
  expect(themeIndex).toBeLessThan(styleIndex);
};

describe('template theme', () => {
  it('applies theme before styles are loaded', async () => {
    const indexTemplate = await readFile(
      'scaffold/templates/index-timeline.html',
      'utf8'
    );
    const categoryTemplate = await readFile(
      'scaffold/templates/index-category.html',
      'utf8'
    );

    assertThemeScriptInHead(indexTemplate);
    assertThemeScriptInHead(categoryTemplate);
  });
});
