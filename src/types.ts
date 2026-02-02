// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import type { FunCityVariables } from 'funcity';
import type {
  BeautifulMermaidPluginOptions,
  CodeHighlightOptions,
} from 'mark-deco';

///////////////////////////////////////////////////////////////////////////////////

/**
 * Logger interface for customizable logging
 */
export interface Logger {
  /** Logs debug messages. */
  readonly debug: (message: string) => void;
  /** Logs informational messages. */
  readonly info: (message: string) => void;
  /** Logs warning messages. */
  readonly warn: (message: string) => void;
  /** Logs error messages. */
  readonly error: (message: string) => void;
}

///////////////////////////////////////////////////////////////////////////////////

/**
 * Mermaid renderer selection.
 */
export type MermaidRenderer = 'beautiful' | 'mermaid';

/**
 * a-terra-forge processing options.
 */
export interface ATerraForgeProcessingOptions {
  /** Markdown document directory (defaults to "docs" when omitted). */
  docsDir?: string;
  /** Template directory (defaults to ".templates" when omitted). */
  templatesDir?: string;
  /** Asset directory (defaults to ".assets" when omitted). */
  assetsDir?: string;
  /** Output directory (defaults to "dist" when omitted). */
  outDir?: string;
  /** Temporary working directory base (defaults to the system temp directory when omitted). */
  tmpDir?: string;
  /** Cache directory (defaults to "$HOME/.cache/a-terra-forge" when omitted). */
  cacheDir?: string;
  /** User agent string for fetchers (defaults to the built-in UA when omitted). */
  userAgent?: string;
  /** Path to atr config (defaults to atr.json5/atr.jsonc/atr.json in the current working directory when omitted). */
  configPath?: string;
  /** Logger implementation (defaults to the trimming console logger when omitted). */
  logger?: Logger;
}

///////////////////////////////////////////////////////////////////////////////////

/**
 * a-terra-forge config variables input.
 */
export interface ATerraForgeVariablesInput {
  /** Markdown document directory. */
  docsDir?: string;
  /** Template directory. */
  templatesDir?: string;
  /** Asset directory. */
  assetsDir?: string;
  /** Output directory. */
  outDir?: string;
  /** Temporary working directory base. */
  tmpDir?: string;
  /** Mermaid renderer selection. */
  mermaidRenderer?: MermaidRenderer;
  /** Cache directory. */
  cacheDir?: string;
  /** User agent string for fetchers. */
  userAgent?: string;
  /** Site template asset names rendered from templates directory. */
  siteTemplates?: readonly string[];
  /** Glob patterns for static content files to copy. */
  contentFiles?: readonly string[];
  /** Menu ordering for primary navigation. */
  menuOrder?: readonly string[];
  /** Menu ordering for secondary navigation. */
  afterMenuOrder?: readonly string[];
  /** Categories rendered with blog-style ordering and templates. */
  blogCategories?: readonly string[];
  /** Code highlighting configuration values. */
  codeHighlight?: Record<string, unknown>;
  /** Additional variable entries. */
  [key: string]: unknown;
}

/**
 * Raw configuration input compatible with atr.json (also used by Vite plugin options).
 */
export interface ATerraForgeConfigInput {
  /** Template variables to parse and merge into config. */
  variables?: ATerraForgeVariablesInput;
  /** Message dictionaries keyed by locale. */
  messages?: Record<string, unknown>;
  /** Code highlighting configuration values (legacy top-level). */
  codeHighlight?: Record<string, unknown>;
  /** Beautiful Mermaid configuration values. */
  'beautiful-mermaid'?: Record<string, unknown>;
}

///////////////////////////////////////////////////////////////////////////////////

export type ATerraForgeMessageList = ReadonlyMap<string, string>;
export type ATerraForgeMessageListByLocale = ReadonlyMap<
  string,
  ATerraForgeMessageList
>;

/**
 * Parsed configuration derived from atr.json with defaults applied.
 */
export interface ATerraForgeConfig {
  /** Template variables available to FunCity rendering. */
  variables: FunCityVariables;
  /** Localized message dictionaries. */
  messages: ATerraForgeMessageListByLocale;
  /** Code highlighting configuration. */
  codeHighlight: CodeHighlightOptions;
  /** Beautiful Mermaid configuration. */
  beautifulMermaid?: BeautifulMermaidPluginOptions;
  /** Glob patterns for static content files to copy. */
  contentFiles: readonly string[];
  /** Menu ordering for primary navigation. */
  menuOrder: readonly string[];
  /** Menu ordering for secondary navigation. */
  afterMenuOrder: readonly string[];
  /** Categories rendered with blog-style ordering and templates. */
  blogCategories: readonly string[];
}

/**
 * Parsed configuration overrides applied on top of a base config.
 */
export interface ATerraForgeConfigOverrides {
  /** Variables to merge with base config variables. */
  variables?: FunCityVariables;
  /** Message dictionaries to replace base config messages. */
  messages?: ATerraForgeMessageListByLocale;
  /** Code highlighting configuration to replace base config values. */
  codeHighlight?: CodeHighlightOptions;
  /** Beautiful Mermaid configuration to replace base config values. */
  beautifulMermaid?: BeautifulMermaidPluginOptions;
}

///////////////////////////////////////////////////////////////////////////////////

export interface GitUserMetadata {
  name: string;
  email: string;
  date?: string;
}

export interface GitFileMetadata {
  path: string;
  repoPath: string;
  directory: string;
  name: string;
  stem: string;
  extension: string;
}

export interface GitStatusMetadata {
  head: number;
  workdir: number;
  stage: number;
}

export interface GitCommitMetadata {
  oid: string;
  shortOid: string;
  message: string;
  summary: string;
  body: string;
  parents: readonly string[];
  tree: string;
  author: GitUserMetadata;
  committer: GitUserMetadata;
  file: GitFileMetadata;
  status?: GitStatusMetadata;
  dirty?: boolean;
}
