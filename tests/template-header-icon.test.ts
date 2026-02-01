// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

describe('template header icon', () => {
  it('injects header icon styles for category headers', async () => {
    const template = await readFile(
      'scaffold/templates/index-category.html',
      'utf8'
    );
    expect(template).toContain(
      '<h1{{if headerIconCode?}} style="--header-icon: \'{{headerIconCode}}\';"{{end}}>{{articleEntry0.title}}</h1>'
    );
  });

  it('injects header icon styles for timeline headers', async () => {
    const template = await readFile(
      'scaffold/templates/timeline-entry.html',
      'utf8'
    );
    expect(template).toContain(
      '<h1{{if headerIconCode?}} style="--header-icon: \'{{headerIconCode}}\';"{{end}}>'
    );
  });

  it('renders timeline category as bootstrap pill badge', async () => {
    const template = await readFile(
      'scaffold/templates/timeline-entry.html',
      'utf8'
    );
    expect(template).toMatch(/badge rounded-pill/);
  });
});
