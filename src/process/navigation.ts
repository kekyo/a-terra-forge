// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { dirname, join, posix, sep } from 'path';

import { buildDirectoryDestinationPath, toPosixRelativePath } from '../utils';
import { toPosixPath } from './helpers';

//////////////////////////////////////////////////////////////////////////////

/**
 * Navigation item for header rendering.
 */
export interface NavItem {
  readonly label: string;
  readonly href?: string;
  readonly isActive: boolean;
  readonly children?: readonly NavItem[];
}

/**
 * Navigation subcategory metadata.
 */
export interface NavSubcategory {
  readonly label: string;
  readonly path: string;
}

/**
 * Navigation category metadata.
 */
export interface NavCategory {
  readonly category: string;
  readonly subcategories: readonly NavSubcategory[];
}

/**
 * Reserved navigation key for the timeline page.
 */
export const timelineKey = 'timeline';

export const resolveTimelineOutputDir = (
  outDir: string,
  frontPage: string
): string => (frontPage === timelineKey ? outDir : join(outDir, timelineKey));

export const resolveTimelineDestinationPath = (
  outDir: string,
  frontPage: string
): string =>
  frontPage === timelineKey
    ? buildDirectoryDestinationPath(outDir, '')
    : buildDirectoryDestinationPath(outDir, timelineKey);

export const resolveCategoryDestinationPath = (
  outDir: string,
  directory: string,
  frontPage: string
): string => {
  if (frontPage !== timelineKey && directory === frontPage) {
    return buildDirectoryDestinationPath(outDir, '');
  }
  return buildDirectoryDestinationPath(outDir, directory);
};

/**
 * Split a directory path into segments.
 */
export const splitDirectory = (directory: string): string[] => {
  if (directory === '' || directory === '.') {
    return [];
  }
  return directory.split(sep).filter((segment) => segment.length > 0);
};

/**
 * Resolve the label for a directory (last segment).
 */
export const getDirectoryLabel = (directory: string): string => {
  const segments = splitDirectory(directory);
  return segments.length > 0 ? segments[segments.length - 1]! : '';
};

/**
 * Build an ordered name list based on preferred ordering.
 */
export const buildOrderedNames = (
  names: readonly string[],
  orderedNames: readonly string[]
): string[] => {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const nameSet = new Set(sorted);
  const ordered: string[] = [];
  const used = new Set<string>();

  for (const name of orderedNames) {
    if (nameSet.has(name) && !used.has(name)) {
      ordered.push(name);
      used.add(name);
    }
  }

  for (const name of sorted) {
    if (!used.has(name)) {
      ordered.push(name);
    }
  }

  return ordered;
};

/**
 * Build navigation order for items that appear before the "after" list.
 */
export const buildNavOrderBefore = (
  categoryNames: readonly string[],
  orderedNames: readonly string[],
  includeTimeline: boolean
): string[] => {
  const orderedCategories = buildOrderedNames(categoryNames, orderedNames);
  const categorySet = new Set(orderedCategories);
  const ordered: string[] = [];
  const used = new Set<string>();

  const push = (name: string) => {
    if (!used.has(name)) {
      ordered.push(name);
      used.add(name);
    }
  };

  if (includeTimeline && !orderedNames.includes(timelineKey)) {
    push(timelineKey);
  }

  for (const name of orderedNames) {
    if (name === timelineKey) {
      if (includeTimeline) {
        push(timelineKey);
      }
      continue;
    }
    if (categorySet.has(name)) {
      push(name);
    }
  }

  for (const name of orderedCategories) {
    push(name);
  }

  return ordered;
};

/**
 * Build navigation order for items that appear after the "before" list.
 */
export const buildNavOrderAfter = (
  categoryNames: readonly string[],
  orderedNames: readonly string[],
  includeTimeline: boolean
): string[] => {
  const categorySet = new Set(categoryNames);
  const ordered: string[] = [];
  const used = new Set<string>();

  const push = (name: string) => {
    if (!used.has(name)) {
      ordered.push(name);
      used.add(name);
    }
  };

  for (const name of orderedNames) {
    if (name === timelineKey) {
      if (includeTimeline) {
        push(timelineKey);
      }
      continue;
    }
    if (categorySet.has(name)) {
      push(name);
    }
  }

  return ordered;
};

/**
 * Build navigation items for a specific page.
 */
export const buildNavItems = (
  destinationPath: string,
  outDir: string,
  currentDir: string,
  navOrder: readonly string[],
  navCategories: ReadonlyMap<string, NavCategory>,
  frontPage: string,
  includeTimeline: boolean
): readonly NavItem[] => {
  const destinationDir = dirname(destinationPath);
  const navItems: NavItem[] = [];
  const currentSegments = splitDirectory(currentDir);
  const currentCategory = currentSegments[0];

  for (const navKey of navOrder) {
    if (navKey === timelineKey) {
      if (!includeTimeline) {
        continue;
      }
      const timelinePath = resolveTimelineDestinationPath(outDir, frontPage);
      navItems.push({
        label: timelineKey,
        href: toPosixRelativePath(destinationDir, timelinePath),
        isActive: currentDir === timelineKey,
      });
      continue;
    }

    const navCategory = navCategories.get(navKey);
    if (!navCategory) {
      continue;
    }

    if (navCategory.subcategories.length > 0) {
      const children = navCategory.subcategories.map((subcategory) => {
        const targetPath = buildDirectoryDestinationPath(
          outDir,
          subcategory.path
        );
        const href = toPosixRelativePath(destinationDir, targetPath);
        return {
          label: subcategory.label,
          href,
          isActive: subcategory.path === currentDir,
        };
      });
      const isActive =
        navCategory.category === currentCategory ||
        children.some((child) => child.isActive);
      navItems.push({
        label: navCategory.category,
        isActive,
        children,
      });
      continue;
    }

    const resolvedTargetPath = resolveCategoryDestinationPath(
      outDir,
      navCategory.category,
      frontPage
    );
    const href = toPosixRelativePath(destinationDir, resolvedTargetPath);
    const isActive = navCategory.category === currentDir;
    navItems.push({
      label: navCategory.category,
      href,
      isActive,
    });
  }

  return navItems;
};

/**
 * Resolve frontmatter.order to a numeric sort value.
 */
export const resolveOrderValue = (
  frontmatter: Record<string, unknown>
): number | undefined => {
  const rawValue = frontmatter.order;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === 'string') {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

/**
 * Detect whether a markdown file is an index entry.
 */
export const isIndexMarkdown = (relativePath: string): boolean =>
  posix.basename(toPosixPath(relativePath)).toLowerCase() === 'index.md';
