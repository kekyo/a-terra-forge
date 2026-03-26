// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  outputErrors,
  type FunCityLogEntry,
  type FunCityVariables,
} from 'funcity';
import { Resvg } from '@resvg/resvg-js';

import type { Logger } from '../types';
import {
  resolveBuiltLogPath,
  toPosixRelativePath,
  writeBinaryFile,
} from '../utils';
import { readFileIfExists, renderTemplateWithImportHandler } from './templates';

//////////////////////////////////////////////////////////////////////////////

export type OgImageEntryMode = 'category' | 'blog' | 'blog-single' | 'timeline';

/**
 * Theme used to select OGP image SVG templates.
 */
export type OgImageTheme = 'light' | 'dark';

export interface OgImageTemplateInfo {
  readonly script: string;
  readonly path: string;
}

export interface OgImageTemplateSet {
  readonly defaultTemplates: ReadonlyMap<OgImageTheme, OgImageTemplateInfo>;
  readonly templatesByModeAndTheme: ReadonlyMap<string, OgImageTemplateInfo>;
}

const ogImageEntryModes: readonly OgImageEntryMode[] = [
  'category',
  'blog',
  'blog-single',
  'timeline',
];

const ogImageThemes: readonly OgImageTheme[] = ['light', 'dark'];

const isAbsoluteUrl = (value: string): boolean =>
  value.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);

const isDataUrl = (value: string): boolean => value.startsWith('data:');

const imageHrefPattern =
  /(<(?:image|feImage)\b[^>]*?\s(?:href|xlink:href)=)(["'])([^"']+)\2/giu;

const stripQueryAndFragment = (value: string): string =>
  value.split(/[?#]/u)[0] ?? value;

const resolveImageMimeType = (
  href: string,
  buffer: Buffer
): string | undefined => {
  const normalized = stripQueryAndFragment(href).toLowerCase();
  switch (extname(normalized)) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    case '.ico':
      return 'image/x-icon';
    case '.avif':
      return 'image/avif';
  }

  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif';
    }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return 'image/x-icon';
  }
  if (buffer.subarray(0, 256).toString('utf8').includes('<svg')) {
    return 'image/svg+xml';
  }
  return undefined;
};

const toImageDataUrl = (buffer: Buffer, mimeType: string): string =>
  `data:${mimeType};base64,${buffer.toString('base64')}`;

const resolveFileHref = (href: string, outputPath: string): string => {
  if (href.startsWith('file:')) {
    return fileURLToPath(href);
  }
  return resolve(dirname(outputPath), href);
};

const readSvgResource = async (
  href: string,
  outputPath: string,
  logger: Logger
): Promise<Buffer | undefined> => {
  if (!href || isDataUrl(href)) {
    return undefined;
  }
  if (isAbsoluteUrl(href) && !href.startsWith('file:')) {
    logger.warn(`Skipping external OGP image resource: ${href}`);
    return undefined;
  }

  const resourcePath = resolveFileHref(href, outputPath);
  try {
    return await readFile(resourcePath);
  } catch {
    logger.warn(`Failed to resolve OGP image resource: ${href}`);
    return undefined;
  }
};

const embedLocalSvgImages = async (
  svg: string,
  outputPath: string,
  logger: Logger
): Promise<string> => {
  const hrefs = new Set<string>();
  for (const match of svg.matchAll(imageHrefPattern)) {
    const href = match[3];
    if (
      !href ||
      isDataUrl(href) ||
      href.startsWith('#') ||
      (isAbsoluteUrl(href) && !href.startsWith('file:'))
    ) {
      continue;
    }
    hrefs.add(href);
  }

  if (hrefs.size === 0) {
    return svg;
  }

  const embedded = new Map<string, string>();
  await Promise.all(
    Array.from(hrefs.values()).map(async (href) => {
      const buffer = await readSvgResource(href, outputPath, logger);
      if (!buffer) {
        return;
      }
      const mimeType = resolveImageMimeType(href, buffer);
      if (!mimeType) {
        logger.warn(`Failed to determine OGP image resource type: ${href}`);
        return;
      }
      embedded.set(href, toImageDataUrl(buffer, mimeType));
    })
  );

  if (embedded.size === 0) {
    return svg;
  }

  return svg.replace(imageHrefPattern, (full, prefix, quote, href) => {
    const replacement = embedded.get(href);
    return replacement ? `${prefix}${quote}${replacement}${quote}` : full;
  });
};

const toTemplateKey = (mode: OgImageEntryMode, theme: OgImageTheme): string =>
  `${mode}:${theme}`;

const resolveTemplateTheme = (variables: FunCityVariables): OgImageTheme => {
  const rawTheme = variables.get('ogpImageTheme');
  return typeof rawTheme === 'string' && rawTheme.trim() === 'dark'
    ? 'dark'
    : 'light';
};

const resolveTemplate = (
  templates: OgImageTemplateSet,
  mode: OgImageEntryMode,
  theme: OgImageTheme
): OgImageTemplateInfo | undefined =>
  templates.templatesByModeAndTheme.get(toTemplateKey(mode, theme)) ??
  templates.defaultTemplates.get(theme);

/**
 * Resolve available OGP image templates from the templates directory.
 */
export const loadOgImageTemplates = async (
  templatesDir: string
): Promise<OgImageTemplateSet> => {
  const defaultEntries = await Promise.all(
    ogImageThemes.map(async (theme) => {
      const themedPath = resolve(templatesDir, `og-image-${theme}.svg`);
      const themedScript = await readFileIfExists(themedPath);
      if (themedScript !== undefined) {
        return [theme, { script: themedScript, path: themedPath }] as const;
      }
      return undefined;
    })
  );

  const modeEntries = await Promise.all(
    ogImageEntryModes.flatMap((mode) =>
      ogImageThemes.map(async (theme) => {
        const themedPath = resolve(
          templatesDir,
          `og-image-${mode}-${theme}.svg`
        );
        const themedScript = await readFileIfExists(themedPath);
        if (themedScript !== undefined) {
          return [
            toTemplateKey(mode, theme),
            { script: themedScript, path: themedPath },
          ] as const;
        }
        return undefined;
      })
    )
  );

  return {
    defaultTemplates: new Map(
      defaultEntries.filter(
        (entry): entry is readonly [OgImageTheme, OgImageTemplateInfo] =>
          !!entry
      )
    ),
    templatesByModeAndTheme: new Map(
      modeEntries.filter(
        (entry): entry is readonly [string, OgImageTemplateInfo] => !!entry
      )
    ),
  };
};

/**
 * Resolve the PNG output path for a page-level OGP image.
 */
export const resolveOgImageOutputPath = (documentPath: string): string => {
  const documentName = basename(documentPath);
  if (documentName === 'index.html') {
    return join(dirname(documentPath), 'og-image.png');
  }
  const baseName = documentName.replace(/\.html$/i, '');
  return join(dirname(documentPath), `${baseName}.og-image.png`);
};

/**
 * Render an OGP image PNG when a matching template is available.
 */
export const renderOgImage = async ({
  templates,
  mode,
  variables,
  outputPath,
  configDir,
  outDir,
  finalOutDir,
  logger,
  signal,
}: {
  templates: OgImageTemplateSet;
  mode: OgImageEntryMode;
  variables: FunCityVariables;
  outputPath: string;
  configDir: string;
  outDir: string;
  finalOutDir: string;
  logger: Logger;
  signal: AbortSignal;
}): Promise<string | undefined> => {
  const templateTheme = resolveTemplateTheme(variables);
  const template = resolveTemplate(templates, mode, templateTheme);
  if (!template) {
    return undefined;
  }

  const logs: FunCityLogEntry[] = [];
  const svg = await renderTemplateWithImportHandler(
    template.path,
    template.script,
    variables,
    logs,
    [template.path],
    signal
  );

  const hasErrors = outputErrors(logs);
  if (hasErrors) {
    return undefined;
  }

  const svgWithEmbeddedImages = await embedLocalSvgImages(
    svg,
    outputPath,
    logger
  );

  const renderer = new Resvg(svgWithEmbeddedImages, {
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'sans-serif',
      sansSerifFamily: 'sans-serif',
    },
  });

  const resources = renderer.imagesToResolve();
  for (const href of resources) {
    const buffer = await readSvgResource(href, outputPath, logger);
    if (buffer) {
      renderer.resolveImage(href, buffer);
    }
  }

  const rendered = renderer.render();
  await writeBinaryFile(outputPath, rendered.asPng());

  const builtPath = resolveBuiltLogPath(
    configDir,
    outputPath,
    outDir,
    finalOutDir
  );
  logger.info(`built: ${builtPath}`);

  return toPosixRelativePath(outDir, outputPath);
};
