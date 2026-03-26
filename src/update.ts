// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import JSON5 from 'json5';

import { version as packageVersion } from './generated/packageMetadata';
import {
  buildCopyPlanFromSources,
  executeCopyPlan,
  resolvePackageRoot,
} from './scaffold';
import type { Logger } from './types';
import {
  defaultTemplatesDir,
  getTrimmingConsoleLogger,
  loadATerraForgeConfig,
  resolveATerraForgeProcessingOptionsFromVariables,
  writeContentFile,
} from './utils';

///////////////////////////////////////////////////////////////////////////////////

/**
 * Options for updating scaffold-managed files in an existing workspace.
 */
export interface ATerraForgeUpdateOptions {
  /** Path to the target atr config file. */
  configPath: string;
  /** Ignore stored version checks and allow destructive type replacements. */
  force?: boolean;
  /** Logger implementation (defaults to the trimming console logger when omitted). */
  logger?: Logger;
  /** Override package root path (used for testing). */
  sourceRoot?: string;
}

interface ComparableVersion {
  release: readonly (number | string)[];
  prerelease: readonly (number | string)[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseVersionIdentifier = (value: string): number | string | undefined => {
  if (!/^[0-9A-Za-z-]+$/.test(value)) {
    return undefined;
  }
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return value;
};

const parseComparableVersion = (
  value: string
): ComparableVersion | undefined => {
  const trimmed = value.trim().replace(/^[vV]/, '');
  if (trimmed.length === 0) {
    return undefined;
  }

  const withoutBuild = trimmed.split('+', 1)[0] ?? '';
  const [releaseCandidate, prereleasePart] = withoutBuild.split('-', 2);
  const releasePart = releaseCandidate ?? '';
  if (releasePart.length === 0) {
    return undefined;
  }

  const release = releasePart
    .split('.')
    .map((segment) => parseVersionIdentifier(segment));
  if (release.some((segment) => segment === undefined)) {
    return undefined;
  }

  const prerelease =
    prereleasePart === undefined || prereleasePart.length === 0
      ? []
      : prereleasePart
          .split('.')
          .map((segment) => parseVersionIdentifier(segment));
  if (prerelease.some((segment) => segment === undefined)) {
    return undefined;
  }

  return {
    release: release as readonly (number | string)[],
    prerelease: prerelease as readonly (number | string)[],
  };
};

const compareVersionIdentifier = (
  left: number | string | undefined,
  right: number | string | undefined
): number => {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return -1;
  }
  if (right === undefined) {
    return 1;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  if (typeof left === 'number') {
    return -1;
  }
  if (typeof right === 'number') {
    return 1;
  }
  return left.localeCompare(right);
};

const compareComparableVersions = (
  left: ComparableVersion,
  right: ComparableVersion
): number => {
  const releaseLength = Math.max(left.release.length, right.release.length);
  for (let index = 0; index < releaseLength; index += 1) {
    const compared = compareVersionIdentifier(
      left.release[index] ?? 0,
      right.release[index] ?? 0
    );
    if (compared !== 0) {
      return compared;
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }
  if (left.prerelease.length === 0) {
    return 1;
  }
  if (right.prerelease.length === 0) {
    return -1;
  }

  const prereleaseLength = Math.max(
    left.prerelease.length,
    right.prerelease.length
  );
  for (let index = 0; index < prereleaseLength; index += 1) {
    const compared = compareVersionIdentifier(
      left.prerelease[index],
      right.prerelease[index]
    );
    if (compared !== 0) {
      return compared;
    }
  }
  return 0;
};

const readConfigObject = async (
  configPath: string
): Promise<Record<string, unknown>> => {
  if (!existsSync(configPath)) {
    throw new Error(`atr.json is not found: ${configPath}`);
  }

  const content = await readFile(configPath, 'utf8');
  const parsed = JSON5.parse<Record<string, unknown>>(content);
  if (!isRecord(parsed)) {
    throw new Error(`atr.json must be an object: ${configPath}`);
  }
  return parsed;
};

const readStoredVersion = (
  configObject: Record<string, unknown>,
  configPath: string
): string | undefined => {
  const rawVersion = configObject.version;
  if (rawVersion === undefined) {
    return undefined;
  }
  if (typeof rawVersion !== 'string') {
    throw new Error(`"version" in atr.json must be a string: ${configPath}`);
  }
  const trimmed = rawVersion.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const assertVersionCanUpdate = (
  storedVersion: string | undefined,
  configPath: string
): void => {
  if (storedVersion === undefined) {
    throw new Error(
      `atr.json does not contain a top-level "version": ${configPath}. Use --force to overwrite anyway.`
    );
  }

  const parsedStoredVersion = parseComparableVersion(storedVersion);
  if (!parsedStoredVersion) {
    throw new Error(
      `Invalid atr.json version "${storedVersion}": ${configPath}. Use --force to overwrite anyway.`
    );
  }

  const parsedPackageVersion = parseComparableVersion(packageVersion);
  if (!parsedPackageVersion) {
    throw new Error(`Invalid atr CLI version "${packageVersion}".`);
  }

  const compared = compareComparableVersions(
    parsedStoredVersion,
    parsedPackageVersion
  );
  if (compared > 0) {
    throw new Error(
      `Project scaffold version ${storedVersion} is newer than atr ${packageVersion}. Use --force to overwrite anyway.`
    );
  }
};

const writeUpdatedConfig = async (
  configPath: string,
  configObject: Record<string, unknown>
): Promise<void> => {
  const rest = { ...configObject };
  delete rest.version;
  await writeContentFile(
    configPath,
    `${JSON.stringify({ version: packageVersion, ...rest }, null, 2)}\n`
  );
};

/**
 * Overwrite scaffold-managed templates for an existing workspace.
 */
export const updateScaffold = async (
  options: Readonly<ATerraForgeUpdateOptions>
): Promise<void> => {
  const configPath = resolve(options.configPath);
  const force = options.force ?? false;
  const logger = options.logger ?? getTrimmingConsoleLogger();
  const sourceRoot = resolvePackageRoot(options.sourceRoot);

  const configObject = await readConfigObject(configPath);
  const storedVersion = readStoredVersion(configObject, configPath);
  if (!force) {
    assertVersionCanUpdate(storedVersion, configPath);
  }

  const config = await loadATerraForgeConfig(configPath);
  const configDir = dirname(configPath);
  const resolvedOptions = resolveATerraForgeProcessingOptionsFromVariables(
    config.variables,
    configDir
  );
  const templatesDir =
    resolvedOptions.templatesDir ?? resolve(configDir, defaultTemplatesDir);

  const scaffoldDir = resolve(sourceRoot, 'scaffold');
  const entries = await buildCopyPlanFromSources([
    {
      sourceDir: resolve(scaffoldDir, '.templates'),
      targetDir: templatesDir,
      label: '.templates',
    },
  ]);

  await executeCopyPlan(entries, force);
  await writeUpdatedConfig(configPath, configObject);

  logger.info(
    `Scaffold updated at ${configDir} (${storedVersion ?? 'unknown'} -> ${packageVersion})`
  );
};
