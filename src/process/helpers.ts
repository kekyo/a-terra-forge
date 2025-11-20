// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { sep } from 'path';
import dayjs from 'dayjs';
import {
  combineVariables,
  type FunCityFunctionContext,
  type FunCityVariables,
} from 'funcity';

import { bootstrapIcons } from '../generated/bootstrapIcons';
import type { AterraMessageList, AterraMessageListByLocale } from '../types';

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

/**
 * Resolve message list by locale from configured messages.
 */
const resolveMessageList = (
  messagesByLocale: AterraMessageListByLocale | undefined,
  locale: unknown
): AterraMessageList | undefined => {
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
    | AterraMessageListByLocale
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
});

/**
 * Normalize path separators to POSIX style.
 */
export const toPosixPath = (value: string): string =>
  value.split(sep).join('/');

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
