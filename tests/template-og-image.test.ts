// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

const scaffoldOgImageTemplates = [
  'scaffold/.templates/default/og-image-light.svg',
  'scaffold/.templates/default/og-image-dark.svg',
  'scaffold/.templates/default/og-image-timeline-light.svg',
  'scaffold/.templates/default/og-image-timeline-dark.svg',
] as const;

describe('template og image', () => {
  it('uses fontList for scaffold SVG font families', async () => {
    const templates = await Promise.all(
      scaffoldOgImageTemplates.map(async (templatePath) => ({
        template: await readFile(templatePath, 'utf8'),
      }))
    );

    for (const { template } of templates) {
      expect(template).toContain(
        "set fontFamily (cond fontList? (join ', ' fontList) 'Noto Sans, sans-serif')"
      );
      expect(template).toContain('font-family="{{escapeXml fontFamily}}"');
      expect(template).not.toContain('font-family="Noto Sans, sans-serif"');
    }
  });
});
