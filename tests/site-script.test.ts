// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

describe('site script', () => {
  it('configures mermaid with theme variables', async () => {
    const script = await readFile('scaffold/templates/site-script.js', 'utf8');

    expect(script).toMatch(/themeVariables/);
    expect(script).toMatch(/lineColor/);
    expect(script).toMatch(/arrowheadColor/);
    expect(script).toMatch(/primaryTextColor/);
    expect(script).toContain('color\\(srgb');
  });

  it('stores mermaid sources and resets processed nodes', async () => {
    const script = await readFile('scaffold/templates/site-script.js', 'utf8');

    expect(script).toMatch(/dataset\.mermaidSource/);
    expect(script).toMatch(/removeAttribute\(['"]data-processed['"]\)/);
  });

  it('re-renders mermaid diagrams on theme changes', async () => {
    const script = await readFile('scaffold/templates/site-script.js', 'utf8');

    expect(script).toMatch(/renderMermaid\(document\)/);
    expect(script).toMatch(/mediaQuery\.addEventListener\('change'/);
  });

  it('opens image modal for unlinked article images', async () => {
    const script = await readFile('scaffold/templates/site-script.js', 'utf8');

    expect(script).toContain('imageModal');
    expect(script).toMatch(/article-image-outer/);
    expect(script).toMatch(/bootstrap.*Modal/);
    expect(script).toMatch(/elementsFromPoint/);
  });
});
