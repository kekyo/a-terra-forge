// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

const extractMediaBlocks = (css: string, mediaQuery: string) => {
  const blocks: string[] = [];
  let searchIndex = 0;

  while (searchIndex < css.length) {
    const queryIndex = css.indexOf(mediaQuery, searchIndex);
    if (queryIndex === -1) {
      break;
    }

    const braceStart = css.indexOf('{', queryIndex);
    if (braceStart === -1) {
      break;
    }

    let depth = 0;
    for (let i = braceStart; i < css.length; i += 1) {
      const char = css[i];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(css.slice(braceStart + 1, i));
          searchIndex = i + 1;
          break;
        }
      }
    }
  }

  return blocks;
};

const extractMediaBlock = (css: string, mediaQuery: string) =>
  extractMediaBlocks(css, mediaQuery)[0] ?? null;

describe('template style', () => {
  it('sets smaller docs padding for the smartphone breakpoint', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const mediaBlocks = extractMediaBlocks(css, '@media (max-width: 575.98px)');

    expect(mediaBlocks.length).toBeGreaterThan(0);
    expect(
      mediaBlocks.some((block) =>
        /\.docs\s*\{[^}]*padding:\s*0\.5em\s+1em\s+0\s+1em;/.test(block)
      )
    ).toBe(true);
  });

  it('truncates navbar labels for the expanded navbar breakpoint', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const mediaBlock = extractMediaBlock(css, '@media (min-width: 576px)');

    expect(mediaBlock).not.toBeNull();
    expect(mediaBlock).toMatch(
      /\.navbar\s+\.navbar-nav\s*\{[^}]*flex-wrap:\s*nowrap;/
    );
    expect(mediaBlock).toMatch(
      /\.navbar\s+\.navbar-nav\s*>\s*\.nav-item\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*0\s+1\s+auto;/
    );
    expect(mediaBlock).toMatch(
      /\.navbar\s+\.navbar-nav\s*>\s*\.nav-item\s*>\s*\.nav-link\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/
    );
    expect(mediaBlock).toMatch(
      /\.navbar\s+\.navbar-nav\s*>\s*\.nav-item\s*>\s*\.nav-link\s+\.nav-link-label\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/
    );
  });

  it('darkens the light theme navbar background', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const navMatch = css.match(
      /\[data-bs-theme="light"\]\s+\.navbar\.bg-body-tertiary\s*\{([^}]*)\}/
    );
    expect(navMatch).not.toBeNull();
    expect(navMatch?.[1]).toMatch(
      /background-color:\s*color-mix\([\s\S]*var\(--bs-body-bg\)\s+92%[\s\S]*black[\s\S]*\)\s*!important;/
    );
  });

  it('sizes the image modal to the viewport width minus spacing', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const dialogMatch = css.match(
      /\.image-modal\s+\.image-modal-dialog\s*\{([^}]*)\}/
    );
    expect(dialogMatch).not.toBeNull();
    expect(dialogMatch?.[1]).toMatch(/max-width:\s*calc\(100vw\s*-\s*2rem\);/);
    expect(dialogMatch?.[1]).toMatch(/width:\s*calc\(100vw\s*-\s*2rem\);/);
  });

  it('renders blockquotes with the bootstrap quote icon', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const blockquoteMatch = css.match(/\.entry-body blockquote\s*\{([^}]*)\}/);

    expect(blockquoteMatch).not.toBeNull();
    expect(blockquoteMatch?.[1]).toMatch(
      /padding:\s*0\.8rem\s+1\.5rem\s+0\.8rem\s+0\.7rem;/
    );
    expect(blockquoteMatch?.[1]).toMatch(
      /border-left:\s*0\.34rem\s+solid\s+var\(--secondary-alpha-50\);/
    );

    const iconMatch = css.match(
      /\.entry-body blockquote::before\s*\{([^}]*)\}/
    );

    expect(iconMatch).not.toBeNull();
    expect(iconMatch?.[1]).toMatch(/font-family:\s*"bootstrap-icons";/);
    expect(iconMatch?.[1]).toMatch(/font-size:\s*2\.1em;/);
    expect(iconMatch?.[1]).toMatch(/color:\s*var\(--secondary-alpha-50\);/);
    expect(iconMatch?.[1]).toMatch(/content:\s*"\\f6b0";/);
  });

  it('raises responsive oEmbed embeds above the external link overlay', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const wrapperMatch = css.match(/\.oembed-responsive-wrapper\s*\{([^}]*)\}/);

    expect(wrapperMatch).not.toBeNull();
    expect(wrapperMatch?.[1]).toMatch(/position:\s*relative;/);
    expect(wrapperMatch?.[1]).toMatch(/z-index:\s*3;/);
  });

  it('defines primary and secondary palette variables', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    expect(css).toMatch(
      /--primary-rgb:\s*\{\{cond\s+primaryColorRgb\?\s+primaryColorRgb\s+'13,\s*110,\s*253'\}\};/
    );
    expect(css).toContain(
      `--header-icon-default: '{{cond headerIconCode? headerIconCode '\\\\F66B'}}';`
    );
    expect(css).toMatch(/--primary:\s*rgb\(var\(--primary-rgb\)\);/);
    expect(css).toMatch(
      /--primary-alpha-50:\s*color-mix\(in\s+srgb,\s*var\(--primary\)\s+50%,\s*transparent\);/
    );
    expect(css).toMatch(
      /--secondary-rgb:\s*\{\{cond\s+secondaryColorRgb\?\s+secondaryColorRgb\s+'108,\s*117,\s*125'\}\};/
    );
    expect(css).toMatch(/--secondary:\s*rgb\(var\(--secondary-rgb\)\);/);
    expect(css).toMatch(
      /--secondary-alpha-50:\s*color-mix\(in\s+srgb,\s*var\(--secondary\)\s+50%,\s*transparent\);/
    );
  });

  it('defines inline code palette variables for each theme', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    expect(css).toMatch(
      /:root\[data-bs-theme="light"\][\s\S]*--inline-code-color:\s*color-mix\(in\s+srgb,\s*var\(--inline-code\)\s+65%,\s*#303030c0\);/
    );
    expect(css).toMatch(
      /:root\[data-bs-theme="light"\][\s\S]*--inline-code-bg:\s*color-mix\(in\s+srgb,\s*var\(--inline-code\)\s+8%,\s*#ffffffc0\);/
    );
    expect(css).toMatch(
      /:root\[data-bs-theme="dark"\][\s\S]*--inline-code-color:\s*color-mix\(in\s+srgb,\s*var\(--inline-code\)\s+50%,\s*#ffffffe0\);/
    );
    expect(css).toMatch(
      /:root\[data-bs-theme="dark"\][\s\S]*--inline-code-bg:\s*color-mix\(in\s+srgb,\s*var\(--inline-code\)\s+5%,\s*#50505060\);/
    );
  });

  it('overrides primary tint and shade values with OKLCH adjustments', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const oklchMatch = css.match(
      /@supports\s+\(color:\s*oklch\(from\s+black\s+l\s+c\s+h\)\)[\s\S]*?\{([\s\S]*?)\}/
    );

    expect(oklchMatch).not.toBeNull();
    expect(oklchMatch?.[0]).toMatch(
      /--primary-tint-12:\s*oklch\(from\s+var\(--primary\)\s+calc\(l\s*\+\s*0\.35\)\s+calc\(c\s*\*\s*0\.12\)\s+h\);/
    );
    expect(oklchMatch?.[0]).toMatch(
      /--primary-tint-30:\s*oklch\(from\s+var\(--primary\)\s+calc\(l\s*\+\s*0\.27\)\s+calc\(c\s*\*\s*0\.30\)\s+h\);/
    );
    expect(oklchMatch?.[0]).toMatch(
      /--primary-tint-38:\s*oklch\(from\s+var\(--primary\)\s+calc\(l\s*\+\s*0\.24\)\s+calc\(c\s*\*\s*0\.40\)\s+h\);/
    );
    expect(oklchMatch?.[0]).toMatch(
      /--primary-tint-69:\s*oklch\(from\s+var\(--primary\)\s+calc\(l\s*\+\s*0\.11\)\s+calc\(c\s*\*\s*0\.72\)\s+h\);/
    );
    expect(oklchMatch?.[0]).toMatch(
      /--primary-shade-69:\s*oklch\(from\s+var\(--primary\)\s+calc\(l\s*-\s*0\.14\)\s+calc\(c\s*\*\s*0\.74\)\s+h\);/
    );
  });

  it('styles inline code with the inline palette', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    expect(css).toMatch(
      /\.entry-body\s+:not\(pre\)\s*>\s*code\s*\{[^}]*color:\s*var\(--inline-code-color\);[^}]*background-color:\s*var\(--inline-code-bg\);/
    );
  });

  it('maps the bootstrap theme palette to the primary colors', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    expect(css).toMatch(/--bs-primary:\s*rgb\(var\(--bs-primary-rgb\)\);/);
    expect(css).toMatch(/--bs-secondary:\s*rgb\(var\(--bs-secondary-rgb\)\);/);
    expect(css).toMatch(/--bs-primary-rgb:\s*var\(--primary-rgb\);/);
    expect(css).toMatch(/--bs-secondary-rgb:\s*var\(--secondary-rgb\);/);
    expect(css).toMatch(/--bs-primary-text-emphasis:\s*var\(--primary-/);
    expect(css).toMatch(/--bs-primary-bg-subtle:/);
    expect(css).toMatch(/--bs-primary-border-subtle:/);
    expect(css).toMatch(/--bs-secondary-text-emphasis:/);
    expect(css).toMatch(/--bs-secondary-bg-subtle:/);
    expect(css).toMatch(/--bs-secondary-border-subtle:/);
  });

  it('overrides bootstrap primary colors for hard-coded components', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    expect(css).toMatch(
      /\.form-check-input:checked[^}]*\{[^}]*background-color:\s*var\(--bs-primary\);/
    );
    expect(css).toMatch(
      /\.btn-primary[^}]*\{[^}]*--bs-btn-bg:\s*var\(--bs-primary\);/
    );
    expect(css).toMatch(
      /\.nav-pills[^}]*\{[^}]*--bs-nav-pills-link-active-bg:\s*var\(--bs-primary\);/
    );
  });

  it('styles badges with the primary-derived palette', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    expect(css).toMatch(/--badge-bg:\s*var\(--primary-alpha-50\);/);
    expect(css).toMatch(/--badge-color:\s*var\(--primary-tint-69\);/);
    expect(css).toMatch(
      /\.badge\s*\{[^}]*--bs-badge-color:\s*var\(--badge-color\);[^}]*background-color:\s*var\(--badge-bg\);[^}]*color:\s*var\(--badge-color\);/
    );
  });

  it('applies primary palette to headings and timeline accents', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const h1Match = css.match(/h1\s*\{([^}]*)\}/);
    const h1IconMatch = css.match(/h1::before\s*\{([^}]*)\}/);
    const h2Match = css.match(/h2\s*\{[^}]*border-left:[^}]*\}/);
    const timelineMatch = css.match(/\.timeline-entry\s*\{([^}]*)\}/);

    expect(h1Match).not.toBeNull();
    expect(h1Match?.[1]).toMatch(
      /border-bottom:\s*0\.15rem\s+solid\s+var\(--primary-alpha-50\);/
    );
    expect(h1IconMatch).not.toBeNull();
    expect(h1IconMatch?.[1]).toMatch(/color:\s*var\(--primary\);/);
    expect(h1IconMatch?.[1]).toMatch(
      /content:\s*var\(--header-icon,\s*var\(--header-icon-default\)\);/
    );
    expect(h2Match).not.toBeNull();
    expect(h2Match?.[0]).toMatch(
      /border-left:\s*0\.7rem\s+solid\s+var\(--primary-alpha-75\);/
    );
    expect(timelineMatch).not.toBeNull();
    expect(timelineMatch?.[1]).toMatch(
      /border-bottom:\s*2px\s+solid\s+var\(--primary-alpha-75\);/
    );
  });

  it('defines panel palette variables', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    expect(css).toMatch(
      /--panel-surface:\s*\{\{cond\s+panelSurface\?\s+panelSurface\s+'var\(--panel-surface-base\)'\}\};/
    );
    expect(css).toMatch(
      /--panel-ink:\s*\{\{cond\s+panelInk\?\s+panelInk\s+'var\(--panel-ink-base\)'\}\};/
    );
    expect(css).toMatch(
      /--panel-link:\s*\{\{cond\s+panelLink\?\s+panelLink\s+'var\(--panel-link-base\)'\}\};/
    );
    expect(css).toMatch(
      /--panel-muted:\s*color-mix\(in\s+srgb,\s*var\(--panel-ink\)\s+70%,\s*transparent\);/
    );
  });

  it('derives panel base palette from the primary color', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const darkMatch = css.match(
      /:root\[data-bs-theme="dark"\]\s*\{[^}]*--panel-surface-base:[^}]*\}/
    );
    const lightMatch = css.match(
      /:root\[data-bs-theme="light"\]\s*\{[^}]*--panel-surface-base:[^}]*\}/
    );

    expect(darkMatch).not.toBeNull();
    expect(darkMatch?.[0]).toMatch(/--panel-surface-base:\s*color-mix/);
    expect(darkMatch?.[0]).toMatch(
      /--panel-link-base:\s*var\(--primary-tint-30\);/
    );

    expect(lightMatch).not.toBeNull();
    expect(lightMatch?.[0]).toMatch(
      /--panel-surface-base:\s*var\(--primary-tint-12\);/
    );
    expect(lightMatch?.[0]).toMatch(
      /--panel-link-base:\s*var\(--primary-shade-69\);/
    );
  });

  it('clears floats on entry body headings', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const headingClearMatch = css.match(/\.entry-body h1[\s\S]*?\{([^}]*)\}/);

    expect(headingClearMatch).not.toBeNull();
    expect(headingClearMatch?.[1]).toMatch(/clear:\s*both;/);
  });

  it('scales the h1 icon with the heading size', async () => {
    const css = await readFile('scaffold/templates/style.css', 'utf8');
    const h1IconMatch = css.match(/h1::before\s*\{([^}]*)\}/);

    expect(h1IconMatch).not.toBeNull();
    expect(h1IconMatch?.[1]).toMatch(/font-size:\s*1em;/);
  });
});
