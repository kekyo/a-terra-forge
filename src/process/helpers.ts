// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { dirname, resolve, sep } from 'path';
import dayjs from 'dayjs';
import {
  combineVariables,
  type FunCityFunctionContext,
  type FunCityVariables,
} from 'funcity';

import { bootstrapIcons } from '../generated/bootstrapIcons';
import { toPosixRelativePath, toRgbString } from '../utils';
import type {
  ATerraForgeMessageList,
  ATerraForgeMessageListByLocale,
} from '../types';

//////////////////////////////////////////////////////////////////////////////

/**
 * Format datetime value using dayjs.
 */
const formatDate = async (arg0: unknown, arg1: unknown) => {
  const day = dayjs(arg1 as any);
  return day.format(String(arg0));
};

/**
 * Escape XML content for template output.
 */
const escapeXml = (arg0: unknown): string => {
  const value = String(arg0 ?? '');
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const normalizeTextContent = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const clampPositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const getTextUnitWeight = (value: string): number => {
  if (/\s/u.test(value)) {
    return 0.5;
  }
  const codePoint = value.codePointAt(0) ?? 0;
  return codePoint <= 0x7f ? 1 : 2;
};

const measureTextUnits = (value: string): number => {
  let total = 0;
  for (const char of value) {
    total += getTextUnitWeight(char);
  }
  return total;
};

const truncateTextValue = (value: string, maxUnits: number): string => {
  if (!value) {
    return '';
  }
  if (measureTextUnits(value) <= maxUnits) {
    return value;
  }

  const ellipsis = '...';
  const availableUnits = Math.max(0, maxUnits - measureTextUnits(ellipsis));
  let total = 0;
  let lastIndex = 0;

  for (const char of value) {
    const next = total + getTextUnitWeight(char);
    if (next > availableUnits) {
      break;
    }
    total = next;
    lastIndex += char.length;
  }

  const trimmed = value.slice(0, lastIndex).trimEnd();
  return `${trimmed}${ellipsis}`;
};

const takeTextSegmentByUnits = (
  value: string,
  maxUnits: number
): { line: string; rest: string } => {
  if (!value) {
    return { line: '', rest: '' };
  }
  if (measureTextUnits(value) <= maxUnits) {
    return { line: value, rest: '' };
  }

  let total = 0;
  let currentEnd = 0;
  let breakEnd = 0;

  for (const char of value) {
    const next = total + getTextUnitWeight(char);
    if (next > maxUnits) {
      break;
    }
    total = next;
    currentEnd += char.length;
    if (char === ' ' || char === '-' || char === '/' || char === '_') {
      breakEnd = currentEnd;
    }
  }

  let cutIndex = breakEnd > 0 ? breakEnd : currentEnd;
  if (cutIndex <= 0) {
    const firstChar = Array.from(value)[0];
    cutIndex = firstChar ? firstChar.length : value.length;
  }

  const line = value.slice(0, cutIndex).trimEnd();
  const rest = value.slice(cutIndex).trimStart();
  return { line, rest };
};

const wrapTextByUnits = (
  value: string,
  maxUnits: number,
  maxLines: number
): string[] => {
  const normalized = normalizeTextContent(value);
  if (!normalized) {
    return [];
  }

  const lines: string[] = [];
  let remaining = normalized;

  while (remaining.length > 0 && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(truncateTextValue(remaining, maxUnits));
      break;
    }

    const { line, rest } = takeTextSegmentByUnits(remaining, maxUnits);
    if (!line) {
      break;
    }
    lines.push(line);
    remaining = rest;
  }

  return lines;
};

/**
 * Truncate text for compact template rendering.
 */
const truncateText = (arg0: unknown, arg1: unknown): string => {
  const maxUnits = clampPositiveInteger(arg1, 64);
  return truncateTextValue(normalizeTextContent(arg0), maxUnits);
};

/**
 * Build SVG tspan fragments with simple line wrapping.
 */
const svgTextSpans = (
  arg0: unknown,
  arg1: unknown,
  arg2: unknown,
  arg3: unknown,
  arg4: unknown
): string => {
  const text = normalizeTextContent(arg0);
  if (!text) {
    return '';
  }

  const maxUnits = clampPositiveInteger(arg1, 32);
  const maxLines = clampPositiveInteger(arg2, 2);
  const x = escapeXml(arg3);
  const lineHeight = clampPositiveInteger(arg4, 48);
  const lines = wrapTextByUnits(text, maxUnits, maxLines);

  return lines
    .map((line, index) => {
      const dy = index === 0 ? '' : ` dy="${lineHeight}"`;
      return `<tspan x="${x}"${dy}>${escapeXml(line)}</tspan>`;
    })
    .join('');
};

/**
 * Convert a color value into a CSS RGB triple string.
 */
const toCssRgb = (arg0: unknown, arg1: unknown): string | undefined => {
  const resolved = toRgbString(arg0);
  if (resolved) {
    return resolved;
  }
  if (arg1 === undefined) {
    return undefined;
  }
  if (typeof arg1 === 'string') {
    const trimmed = arg1.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return String(arg1);
};

/**
 * Resolve message list by locale from configured messages.
 */
const resolveMessageList = (
  messagesByLocale: ATerraForgeMessageListByLocale | undefined,
  locale: unknown
): ATerraForgeMessageList | undefined => {
  if (!(messagesByLocale instanceof Map)) {
    return undefined;
  }
  if (typeof locale === 'string') {
    const list = messagesByLocale.get(locale);
    if (list instanceof Map) {
      return list;
    }
  }
  if (messagesByLocale.size === 1) {
    const list = messagesByLocale.values().next().value;
    if (list instanceof Map) {
      return list;
    }
  }
  return undefined;
};

/**
 * Resolve a localized message for template scripts.
 */
async function getMessage(
  this: FunCityFunctionContext,
  arg0: unknown,
  arg1: unknown
) {
  const message = String(arg0);
  const defaultValue = arg1 === undefined ? undefined : String(arg1);
  const messages = this.getValue('$$messages$$').value as
    | ATerraForgeMessageListByLocale
    | undefined;
  const locale = this.getValue('locale').value;
  const messageList = resolveMessageList(messages, locale);
  return messageList?.get(message) ?? defaultValue ?? message;
}

/**
 * FunCity script variables exposed to templates.
 */
export const scriptVariables = combineVariables({
  formatDate,
  getMessage,
  escapeXml,
  toCssRgb,
  truncateText,
  svgTextSpans,
});

/**
 * Normalize path separators to POSIX style.
 */
export const toPosixPath = (value: string): string =>
  value.split(sep).join('/');

const isAbsoluteUrl = (value: string): boolean =>
  value.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);

const isHashOrQuery = (value: string): boolean =>
  value.startsWith('#') || value.startsWith('?');

const normalizePathValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const stringValue = typeof value === 'string' ? value : String(value);
  const trimmed = stringValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveOutputPath = (outDir: string, target: string): string => {
  if (target.startsWith('/') || target.startsWith('\\')) {
    return resolve(outDir, target.slice(1));
  }
  return resolve(outDir, target);
};

export const createPathFunctions = ({
  outDir,
  documentPath,
  baseUrl,
}: {
  outDir: string;
  documentPath: string;
  baseUrl: URL;
}): {
  toRelativePath: (value: unknown) => string;
  toAbsolutePath: (value: unknown) => string;
} => {
  const resolvedOutDir = resolve(outDir);
  const documentDir = dirname(resolve(documentPath));
  const resolvedBaseUrl = new URL(baseUrl.toString());

  const toRelativePath = (value: unknown): string => {
    const normalized = normalizePathValue(value);
    if (!normalized) {
      return '';
    }
    if (isAbsoluteUrl(normalized) || isHashOrQuery(normalized)) {
      return normalized;
    }
    const targetPath = resolveOutputPath(resolvedOutDir, normalized);
    return toPosixRelativePath(documentDir, targetPath);
  };

  const toAbsolutePath = (value: unknown): string => {
    const normalized = normalizePathValue(value);
    if (!normalized) {
      return '';
    }
    if (isAbsoluteUrl(normalized)) {
      return normalized;
    }
    if (isHashOrQuery(normalized)) {
      return new URL(normalized, resolvedBaseUrl).toString();
    }
    const targetPath = resolveOutputPath(resolvedOutDir, normalized);
    const relativePath = toPosixRelativePath(resolvedOutDir, targetPath);
    return new URL(relativePath, resolvedBaseUrl).toString();
  };

  return {
    toRelativePath,
    toAbsolutePath,
  };
};

/**
 * Trim a string or return undefined when empty.
 */
const getTrimmedStringValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Normalize header icon name to bootstrap icon key.
 */
const resolveHeaderIconName = (value: unknown): string | undefined => {
  const trimmed = getTrimmedStringValue(value);
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.toLowerCase();
  return normalized.startsWith('bi-') ? normalized.slice(3) : normalized;
};

/**
 * Build bootstrap icon codepoint string for a given icon name.
 */
const buildHeaderIconCode = (
  iconName: string | undefined
): string | undefined => {
  if (!iconName) {
    return undefined;
  }
  const codepoint = bootstrapIcons[iconName as keyof typeof bootstrapIcons];
  if (!codepoint) {
    return undefined;
  }
  return `\\${codepoint.toUpperCase()}`;
};

/**
 * Ensure headerIconCode is available in variables, optionally falling back.
 */
export const applyHeaderIconCode = (
  variables: FunCityVariables,
  fallbackVariables?: FunCityVariables
): FunCityVariables => {
  if (variables.has('headerIconCode')) {
    return variables;
  }
  const primaryName = resolveHeaderIconName(variables.get('headerIcon'));
  let code = buildHeaderIconCode(primaryName);
  if (!code && fallbackVariables) {
    const fallbackName = resolveHeaderIconName(
      fallbackVariables.get('headerIcon')
    );
    code = buildHeaderIconCode(fallbackName);
  }
  if (!code) {
    return variables;
  }
  const updated = new Map(variables);
  updated.set('headerIconCode', code);
  return updated;
};

/**
 * Build anchor id for article sections.
 */
export const buildArticleAnchorId = (
  articleId: unknown
): string | undefined => {
  if (typeof articleId !== 'number' || !Number.isFinite(articleId)) {
    return undefined;
  }
  return `article-${articleId}`;
};
