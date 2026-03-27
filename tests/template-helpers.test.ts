// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { describe, expect, it } from 'vitest';

import { scriptVariables } from '../src/process/helpers';

const measureTextUnits = (value: string): number =>
  Array.from(value).reduce((total, char) => {
    if (/\s/u.test(char)) {
      return total + 0.5;
    }
    const codePoint = char.codePointAt(0) ?? 0;
    return total + (codePoint <= 0x7f ? 1 : 2);
  }, 0);

const extractTextSpans = (value: string): string[] =>
  Array.from(value.matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/gu), (match) => {
    return match[1] ?? '';
  });

describe('template helpers', () => {
  it('prefers the latest Unicode break opportunity that still fits the first line', () => {
    const svgTextSpans = scriptVariables.get('svgTextSpans');
    expect(typeof svgTextSpans).toBe('function');

    const rendered = (svgTextSpans as (...args: readonly unknown[]) => string)(
      'C/C++でWASMをサクッとやりたい',
      26,
      2,
      72,
      86
    );
    const lines = extractTextSpans(rendered);

    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toBe('C/');
    expect(lines[0]).toContain('WASM');
    expect(measureTextUnits(lines[0] ?? '')).toBeLessThanOrEqual(26);
    expect(measureTextUnits(lines[0] ?? '')).toBeGreaterThanOrEqual(20);
  });

  it('falls back to a hard wrap when no Unicode break opportunity fits', () => {
    const svgTextSpans = scriptVariables.get('svgTextSpans');
    expect(typeof svgTextSpans).toBe('function');

    const rendered = (svgTextSpans as (...args: readonly unknown[]) => string)(
      'Supercalifragilisticexpialidocious',
      10,
      2,
      72,
      86
    );
    const lines = extractTextSpans(rendered);

    expect(lines).toEqual(['Supercalif', 'ragilis...']);
  });
});
