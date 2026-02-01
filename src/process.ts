// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdtemp, mkdir, readFile, rename, rm, stat } from 'fs/promises';
import { basename, dirname, join, relative, resolve } from 'path';
import {
  buildCandidateVariables,
  combineVariables,
  outputErrors,
  type FunCityVariables,
  type FunCityLogEntry,
} from 'funcity';

import { git_commit_hash, version } from './generated/packageMetadata';
import type {
  GitCommitMetadata,
  ATerraForgeConfigOverrides,
  ATerraForgeProcessingOptions,
  MermaidRenderer,
} from './types';
import { collectGitMetadata } from './gitMetadata';
import {
  assertDirectoryExists,
  collectArticleFiles,
  copyTargetContentFiles,
  defaultAssetDir,
  defaultCacheDir,
  defaultDocsDir,
  defaultOutDir,
  defaultTemplatesDir,
  defaultTmpDir,
  getTrimmingConsoleLogger,
  groupArticleFilesByDirectory,
  loadATerraForgeConfig,
  mergeATerraForgeConfig,
  resolveATerraForgeConfigPathFromDir,
  resolveATerraForgeProcessingOptionsFromVariables,
  resolveBuiltLogPath,
  writeContentFile,
  type ArticleFileInfo,
} from './utils';
import {
  applyHeaderIconCode,
  createPathFunctions,
  scriptVariables,
} from './process/helpers';
import { defaultUserAgent, parseFrontmatterInfo } from './process/frontmatter';
import {
  readFileIfExists,
  renderTemplateWithImportHandler,
} from './process/templates';
import {
  buildNavOrderAfter,
  buildNavOrderBefore,
  buildOrderedNames,
  getDirectoryLabel,
  resolveCategoryDestinationPath,
  resolveTimelineDestinationPath,
  splitDirectory,
  timelineKey,
  type NavCategory,
} from './process/navigation';
import {
  generateDirectoryDocument,
  type PageTemplateInfo,
  type RenderedArticleInfo,
} from './process/directory';
import { generateBlogDocument } from './process/blog';
import { generateTimelineDocument } from './process/timeline';
import { buildSitemapUrls } from './process/sitemap';
import { buildFeedTemplateData } from './process/feed';
import { createWorkDir } from './worker/workdir';
import {
  buildRenderPlan,
  loadRenderedSnapshots,
  runRenderWorkers,
} from './worker/renderPlan';

///////////////////////////////////////////////////////////////////////////////////

const filterGroupedArticleFiles = (
  groupedArticleFiles: ReadonlyMap<string, ArticleFileInfo[]>,
  categoriesWithSubcategories: ReadonlySet<string>,
  reservedDirectories: ReadonlySet<string>,
  logger: ATerraForgeProcessingOptions['logger'],
  logWarnings: boolean
): Map<string, ArticleFileInfo[]> => {
  const filteredGroupedArticleFiles = new Map<string, ArticleFileInfo[]>();
  for (const [directory, files] of groupedArticleFiles.entries()) {
    if (reservedDirectories.has(directory)) {
      continue;
    }
    const segments = splitDirectory(directory);
    if (segments.length === 0) {
      filteredGroupedArticleFiles.set(directory, files);
      continue;
    }
    if (segments.length === 1) {
      if (categoriesWithSubcategories.has(segments[0]!)) {
        if (logWarnings) {
          logger?.warn(
            `warning: Articles in "${directory}" were ignored because subcategories are present.`
          );
        }
        continue;
      }
      filteredGroupedArticleFiles.set(directory, files);
      continue;
    }
    if (segments.length === 2) {
      filteredGroupedArticleFiles.set(directory, files);
      continue;
    }
    if (logWarnings) {
      logger?.warn(
        `warning: Articles in "${directory}" were ignored because nested categories are not supported.`
      );
    }
  }
  return filteredGroupedArticleFiles;
};

const defaultSiteTemplates = [
  'site-style.css',
  'site-script.js',
  'feed.xml',
  'atom.xml',
  'sitemap.xml',
];

const normalizeSiteTemplates = (raw: unknown): string[] => {
  const list: string[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      list.push(trimmed);
    }
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) {
      list.push(trimmed);
    }
  }
  const seen = new Set<string>();
  return list.filter((entry) => {
    if (seen.has(entry)) {
      return false;
    }
    seen.add(entry);
    return true;
  });
};

const defaultMermaidRenderer: MermaidRenderer = 'beautiful';
const resolveMermaidRenderer = (
  value: unknown,
  configPath: string
): MermaidRenderer => {
  if (value === undefined || value === null) {
    return defaultMermaidRenderer;
  }
  if (typeof value !== 'string') {
    throw new Error(
      `"mermaidRenderer" in variables must be a string: ${configPath}`
    );
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return defaultMermaidRenderer;
  }
  if (normalized === 'mermaid') {
    return 'mermaid';
  }
  if (
    normalized === 'beautiful' ||
    normalized === 'beautiful-mermaid' ||
    normalized === 'beautifulmermaid'
  ) {
    return 'beautiful';
  }
  throw new Error(
    `"mermaidRenderer" in variables must be "beautiful" or "mermaid": ${configPath}`
  );
};

type SiteTemplateEntry = {
  name: string;
  templatePath: string;
  outputPath: string;
  script: string;
};

const resolveSiteTemplateEntries = async (
  templatesDir: string,
  outDir: string,
  siteTemplates: readonly string[]
): Promise<SiteTemplateEntry[]> => {
  const entries = await Promise.all(
    siteTemplates.map(async (name) => {
      const templatePath = resolve(templatesDir, name);
      const script = await readFileIfExists(templatePath);
      if (script === undefined) {
        return undefined;
      }
      return {
        name,
        templatePath,
        outputPath: resolve(outDir, name),
        script,
      } satisfies SiteTemplateEntry;
    })
  );
  return entries.filter((entry): entry is SiteTemplateEntry => !!entry);
};

const renderSiteTemplates = async (
  entries: readonly SiteTemplateEntry[],
  configVariables: FunCityVariables,
  siteTemplateData: Record<string, unknown>,
  baseUrl: URL,
  configDir: string,
  outDir: string,
  finalOutDir: string,
  logger: NonNullable<ATerraForgeProcessingOptions['logger']>,
  signal: AbortSignal
): Promise<void> => {
  await Promise.all(
    entries.map(async (entry) => {
      const pathFunctions = createPathFunctions({
        outDir,
        documentPath: entry.outputPath,
        baseUrl,
      });
      const variables = applyHeaderIconCode(
        buildCandidateVariables(
          scriptVariables,
          configVariables,
          siteTemplateData,
          pathFunctions
        ),
        configVariables
      );
      const logs: FunCityLogEntry[] = [];
      const rendered = await renderTemplateWithImportHandler(
        entry.templatePath,
        entry.script,
        variables,
        logs,
        [entry.templatePath],
        signal
      );
      const isError = outputErrors(entry.templatePath, logs);
      if (!isError) {
        await writeContentFile(entry.outputPath, rendered);
        const builtPath = resolveBuiltLogPath(
          configDir,
          entry.outputPath,
          outDir,
          finalOutDir
        );
        logger.info(`built: ${builtPath}`);
      }
    })
  );
};

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

const copyAssetFiles = async (
  assetsDir: string,
  outDir: string,
  configPath: string
): Promise<void> => {
  try {
    const result = await stat(assetsDir);
    if (!result.isDirectory()) {
      throw new Error(
        `"assetsDir" in variables must be a directory: ${configPath}`
      );
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  await copyTargetContentFiles(assetsDir, ['**/*'], outDir);
};

/**
 * Build documentation site output from markdown sources.
 */
export const generateDocs = async (
  options: Readonly<ATerraForgeProcessingOptions>,
  signal: AbortSignal,
  configOverrides?: ATerraForgeConfigOverrides
): Promise<void> => {
  const configPath = options.configPath
    ? resolve(options.configPath)
    : resolveATerraForgeConfigPathFromDir(process.cwd());
  const configDir = dirname(configPath);
  const logger = options.logger ?? getTrimmingConsoleLogger();
  const config = mergeATerraForgeConfig(
    await loadATerraForgeConfig(configPath),
    configOverrides,
    configPath
  );
  const variableOptions = resolveATerraForgeProcessingOptionsFromVariables(
    config.variables,
    configDir
  );
  const docsDir = resolve(
    options.docsDir ??
      variableOptions.docsDir ??
      resolve(configDir, defaultDocsDir)
  );
  const templatesDir = resolve(
    options.templatesDir ??
      variableOptions.templatesDir ??
      resolve(configDir, defaultTemplatesDir)
  );
  const assetsDir = resolve(
    options.assetsDir ??
      variableOptions.assetsDir ??
      resolve(configDir, defaultAssetDir)
  );
  const finalOutDir = resolve(
    options.outDir ??
      variableOptions.outDir ??
      resolve(configDir, defaultOutDir)
  );
  const tmpDir = resolve(
    options.tmpDir ?? variableOptions.tmpDir ?? defaultTmpDir
  );
  const cacheDir = resolve(
    options.cacheDir ?? variableOptions.cacheDir ?? defaultCacheDir
  );

  logger.info(`Preparing...`);

  const configVariablesRaw = new Map(config.variables);

  const mermaidRenderer = resolveMermaidRenderer(
    configVariablesRaw.get('mermaidRenderer'),
    configPath
  );
  configVariablesRaw.set('mermaidRenderer', mermaidRenderer);

  const siteTemplatesRaw = configVariablesRaw.get('siteTemplates');
  const hasSiteTemplates = configVariablesRaw.has('siteTemplates');
  const normalizedSiteTemplates = normalizeSiteTemplates(siteTemplatesRaw);
  const siteTemplates = hasSiteTemplates
    ? normalizedSiteTemplates
    : defaultSiteTemplates;
  configVariablesRaw.set('siteTemplates', siteTemplates);

  await assertDirectoryExists(templatesDir, 'templates');
  await assertDirectoryExists(docsDir, 'docs');
  const linkTarget = '_blank';
  const userAgent = options.userAgent ?? defaultUserAgent;

  const articleFiles = await collectArticleFiles(docsDir, '.md');
  if (articleFiles.length === 0) {
    logger.warn(`warning: Any markdown files are not found (${docsDir})`);
  }

  articleFiles.sort();

  const activeArticleFiles = (
    await Promise.all(
      articleFiles.map(async (articleFilePath) => {
        const content = await readFile(articleFilePath, 'utf8');
        const relativePath = relative(docsDir, articleFilePath);
        const info = parseFrontmatterInfo(content, relativePath);
        return info.draft ? undefined : articleFilePath;
      })
    )
  ).filter((articleFilePath): articleFilePath is string =>
    Boolean(articleFilePath)
  );

  const groupedArticleFiles = groupArticleFilesByDirectory(
    activeArticleFiles,
    docsDir
  );
  const allGroupedArticleFiles = groupArticleFilesByDirectory(
    articleFiles,
    docsDir
  );
  const subcategoryLookup = new Map<string, Map<string, string>>();
  const categoriesWithSubcategories = new Set<string>();
  const reservedDirectories = new Set<string>();
  const isReservedTimelineDirectory = (directory: string): boolean =>
    splitDirectory(directory).some((segment) => segment === timelineKey);

  for (const directory of groupedArticleFiles.keys()) {
    if (isReservedTimelineDirectory(directory)) {
      reservedDirectories.add(directory);
      logger.warn(
        `warning: Articles in "${directory}" were ignored because "${timelineKey}" is reserved.`
      );
      continue;
    }
    const segments = splitDirectory(directory);
    if (segments.length === 2) {
      const category = segments[0]!;
      const subcategory = segments[1]!;
      const subcategories = subcategoryLookup.get(category) ?? new Map();
      subcategories.set(subcategory, directory);
      subcategoryLookup.set(category, subcategories);
      categoriesWithSubcategories.add(category);
    }
  }

  const filteredGroupedArticleFiles = filterGroupedArticleFiles(
    groupedArticleFiles,
    categoriesWithSubcategories,
    reservedDirectories,
    logger,
    true
  );
  const filteredAllGroupedArticleFiles = filterGroupedArticleFiles(
    allGroupedArticleFiles,
    categoriesWithSubcategories,
    reservedDirectories,
    logger,
    false
  );

  const variableFrontPage = configVariablesRaw.get('frontPage');
  if (
    variableFrontPage !== undefined &&
    typeof variableFrontPage !== 'string'
  ) {
    throw new Error(`"frontPage" in variables must be a string: ${configPath}`);
  }
  const frontPageRaw =
    typeof variableFrontPage === 'string' ? variableFrontPage : undefined;
  const frontPage =
    typeof frontPageRaw === 'string' && frontPageRaw.trim().length > 0
      ? frontPageRaw.trim()
      : timelineKey;
  if (frontPage !== timelineKey) {
    if (frontPage === '.' || /[\\/]/.test(frontPage)) {
      throw new Error(`Front page category "${frontPage}" does not exist.`);
    }
    if (!filteredGroupedArticleFiles.has(frontPage)) {
      throw new Error(`Front page category "${frontPage}" does not exist.`);
    }
  }

  const outDir = await createOutputStagingDir(finalOutDir);
  const siteTemplateEntries = await resolveSiteTemplateEntries(
    templatesDir,
    outDir,
    siteTemplates
  );
  const baseUrlRaw = configVariablesRaw.get('baseUrl');
  const trimmedBaseUrl =
    typeof baseUrlRaw === 'string' ? baseUrlRaw.trim() : '';
  const fallbackBaseUrl = 'http://localhost/';
  let resolvedBaseUrl: URL;
  if (trimmedBaseUrl.length > 0) {
    const normalizedBaseUrl = ensureTrailingSlash(trimmedBaseUrl);
    try {
      resolvedBaseUrl = new URL(normalizedBaseUrl);
      configVariablesRaw.set('baseUrl', normalizedBaseUrl);
    } catch {
      logger.warn(
        `warning: Invalid baseUrl "${baseUrlRaw}", using default "${fallbackBaseUrl}".`
      );
      resolvedBaseUrl = new URL(fallbackBaseUrl);
      configVariablesRaw.set('baseUrl', fallbackBaseUrl);
    }
  } else {
    logger.warn(
      `warning: baseUrl is not configured, using default "${fallbackBaseUrl}".`
    );
    resolvedBaseUrl = new URL(fallbackBaseUrl);
    configVariablesRaw.set('baseUrl', fallbackBaseUrl);
  }
  const siteTemplateOutputMap = new Map(
    siteTemplateEntries.map((entry) => [entry.name, entry.outputPath])
  );
  let outputSwapped = false;
  try {
    const articleDirs = [...filteredGroupedArticleFiles.keys()].sort();
    const navMenuNames = new Set<string>();
    for (const category of categoriesWithSubcategories) {
      navMenuNames.add(category);
    }
    for (const directory of filteredGroupedArticleFiles.keys()) {
      const segments = splitDirectory(directory);
      if (segments.length === 1) {
        navMenuNames.add(segments[0]!);
      }
    }
    const menuOrder = config.menuOrder;
    const afterMenuOrder = config.afterMenuOrder;
    const combinedOrder = [...menuOrder, ...afterMenuOrder];
    const includeTimeline =
      frontPage === timelineKey ||
      menuOrder.includes(timelineKey) ||
      afterMenuOrder.includes(timelineKey);
    const timelineInBefore = menuOrder.includes(timelineKey);
    const timelineInAfter = afterMenuOrder.includes(timelineKey);
    const includeTimelineInAfter =
      includeTimeline && !timelineInBefore && timelineInAfter;
    const includeTimelineInBefore = includeTimeline && !includeTimelineInAfter;
    const afterMenuSet = new Set(afterMenuOrder);
    const leftMenuNames = [...navMenuNames].filter(
      (navMenuName) => !afterMenuSet.has(navMenuName)
    );
    const rightCategoryNames = [...navMenuNames].filter((navMenuName) =>
      afterMenuSet.has(navMenuName)
    );

    const navCategoryList: NavCategory[] = [...navMenuNames]
      .sort((a, b) => a.localeCompare(b))
      .map((navMenuName) => {
        const subcategories = subcategoryLookup.get(navMenuName);
        if (!subcategories) {
          return {
            category: navMenuName,
            subcategories: [],
          };
        }
        const orderedSubcategories = buildOrderedNames(
          [...subcategories.keys()],
          combinedOrder
        ).map((label) => ({
          label,
          path: subcategories.get(label)!,
        }));
        return {
          category: navMenuName,
          subcategories: orderedSubcategories,
        };
      });
    const navCategoryMap = new Map(
      navCategoryList.map((navCategory) => [navCategory.category, navCategory])
    );
    const navOrderBefore = buildNavOrderBefore(
      leftMenuNames,
      menuOrder,
      includeTimelineInBefore
    );
    const navOrderAfter = buildNavOrderAfter(
      rightCategoryNames,
      afterMenuOrder,
      includeTimelineInAfter
    );
    const blogCategoryNames = new Set(config.blogCategories);
    const hasBlogCategories = blogCategoryNames.size > 0;

    const categoryIndexTemplatePath = join(templatesDir, 'index-category.html');
    const categoryEntryTemplatePath = join(templatesDir, 'category-entry.html');
    const timelineIndexTemplatePath = join(templatesDir, 'index-timeline.html');
    const timelineEntryTemplatePath = join(templatesDir, 'timeline-entry.html');
    const blogIndexTemplatePath = join(templatesDir, 'index-blog.html');
    const blogEntryTemplatePath = join(templatesDir, 'blog-entry.html');
    const blogSingleTemplatePath = join(templatesDir, 'index-blog-single.html');

    const frontPagePrefix =
      frontPage !== timelineKey ? `${frontPage.replaceAll('\\', '/')}/` : '';
    const rewriteContentPath =
      frontPage !== timelineKey
        ? (relativePath: string) => {
            const normalized = relativePath.replaceAll('\\', '/');
            return normalized.startsWith(frontPagePrefix)
              ? normalized.slice(frontPagePrefix.length)
              : normalized;
          }
        : undefined;

    const [
      pageTemplateScript,
      timelineIndexTemplateScript,
      timelineEntryTemplateScript,
      categoryEntryTemplateScript,
      blogIndexTemplateScript,
      blogEntryTemplateScript,
      blogSingleTemplateScript,
    ] = await Promise.all([
      readFile(categoryIndexTemplatePath, { encoding: 'utf-8' }),
      includeTimeline
        ? readFile(timelineIndexTemplatePath, { encoding: 'utf-8' })
        : Promise.resolve(undefined),
      includeTimeline
        ? readFile(timelineEntryTemplatePath, { encoding: 'utf-8' })
        : Promise.resolve(undefined),
      readFileIfExists(categoryEntryTemplatePath),
      hasBlogCategories
        ? readFile(blogIndexTemplatePath, { encoding: 'utf-8' })
        : Promise.resolve(undefined),
      hasBlogCategories
        ? readFile(blogEntryTemplatePath, { encoding: 'utf-8' })
        : Promise.resolve(undefined),
      hasBlogCategories
        ? readFile(blogSingleTemplatePath, { encoding: 'utf-8' })
        : Promise.resolve(undefined),
      copyTargetContentFiles(docsDir, config.contentFiles, outDir, {
        rewritePath: rewriteContentPath,
        detectDuplicates: frontPage !== timelineKey,
      }),
      copyAssetFiles(assetsDir, outDir, configPath),
    ]);

    const pageTemplate: PageTemplateInfo = {
      script: pageTemplateScript,
      path: categoryIndexTemplatePath,
    };

    const timelineIndexTemplate: PageTemplateInfo | undefined =
      timelineIndexTemplateScript
        ? {
            script: timelineIndexTemplateScript,
            path: timelineIndexTemplatePath,
          }
        : undefined;
    const timelineEntryTemplate: PageTemplateInfo | undefined =
      timelineEntryTemplateScript
        ? {
            script: timelineEntryTemplateScript,
            path: timelineEntryTemplatePath,
          }
        : undefined;
    const categoryEntryTemplate: PageTemplateInfo | undefined =
      categoryEntryTemplateScript
        ? {
            script: categoryEntryTemplateScript,
            path: categoryEntryTemplatePath,
          }
        : undefined;
    const blogIndexTemplate: PageTemplateInfo | undefined =
      blogIndexTemplateScript
        ? {
            script: blogIndexTemplateScript,
            path: blogIndexTemplatePath,
          }
        : undefined;
    const blogEntryTemplate: PageTemplateInfo | undefined =
      blogEntryTemplateScript
        ? {
            script: blogEntryTemplateScript,
            path: blogEntryTemplatePath,
          }
        : undefined;
    const blogSingleTemplate: PageTemplateInfo | undefined =
      blogSingleTemplateScript
        ? {
            script: blogSingleTemplateScript,
            path: blogSingleTemplatePath,
          }
        : undefined;

    const articleFileInfos = Array.from(
      filteredGroupedArticleFiles.values()
    ).flat();
    const codeHighlight = config.codeHighlight;
    const beautifulMermaid = config.beautifulMermaid;
    let renderedResults: RenderedArticleInfo[] = [];

    if (articleFileInfos.length > 0) {
      logger.info(`Render each articles [${articleFileInfos.length}]...`);

      const gitMetadataPromise: Promise<
        ReadonlyMap<string, GitCommitMetadata | undefined>
      > = collectGitMetadata(docsDir, articleFileInfos, logger);

      const workDir = await createWorkDir(tmpDir);
      let cleanup = true;
      try {
        const plan = await buildRenderPlan(
          Array.from(filteredAllGroupedArticleFiles.values()).flat(),
          docsDir
        );
        await writeContentFile(
          join(workDir, 'plan.json'),
          JSON.stringify(plan)
        );

        await runRenderWorkers({
          logger,
          plan,
          workDir,
          cacheDir,
          userAgent,
          codeHighlight,
          beautifulMermaid,
          mermaidRenderer,
          linkTarget,
          signal,
        });

        const snapshots = await loadRenderedSnapshots(plan, workDir);
        const gitMetadataByPath = await gitMetadataPromise;

        const articleMap = new Map(
          articleFileInfos.map((info) => [info.relativePath, info])
        );

        renderedResults = snapshots.map((snapshot) => {
          const articleFile = articleMap.get(snapshot.relativePath);
          if (!articleFile) {
            throw new Error(
              `Rendered output does not match article list: ${snapshot.relativePath}`
            );
          }
          return {
            articleFile,
            result: {
              html: snapshot.html,
              frontmatter: snapshot.frontmatter,
              uniqueIdPrefix: snapshot.uniqueIdPrefix,
            },
            timelineHtml: snapshot.timelineHtml,
            git: gitMetadataByPath.get(snapshot.relativePath),
          };
        });
      } catch (error) {
        cleanup = false;
        throw error;
      } finally {
        if (cleanup) {
          await rm(workDir, { recursive: true, force: true });
        } else {
          logger.warn(`Render work directory retained: ${workDir}`);
        }
      }
    }

    logger.info('Finalizing now...');

    const renderedByDir = new Map<string, RenderedArticleInfo[]>();
    for (const rendered of renderedResults) {
      const list = renderedByDir.get(rendered.articleFile.directory) ?? [];
      list.push(rendered);
      renderedByDir.set(rendered.articleFile.directory, list);
    }

    const documentPaths = new Set<string>();
    if (includeTimeline) {
      documentPaths.add(resolveTimelineDestinationPath(outDir, frontPage));
    }

    const configVariables = combineVariables(
      {
        $$messages$$: config.messages,
        version,
        git_commit_hash,
      },
      configVariablesRaw
    );

    const blogSinglePages = (
      await Promise.all(
        articleDirs.map(async (articleDir) => {
          if ((articleDir === '.' || articleDir === '') && includeTimeline) {
            return Promise.resolve([]);
          }

          const renderedArticles = renderedByDir.get(articleDir) ?? [];
          if (renderedArticles.length === 0) {
            return Promise.resolve([]);
          }

          documentPaths.add(
            resolveCategoryDestinationPath(outDir, articleDir, frontPage)
          );
          const isBlogCategory = blogCategoryNames.has(
            getDirectoryLabel(articleDir)
          );
          if (isBlogCategory) {
            if (
              !blogIndexTemplate ||
              !blogEntryTemplate ||
              !blogSingleTemplate
            ) {
              throw new Error(
                'Blog templates are missing: index-blog.html, blog-entry.html, or index-blog-single.html'
              );
            }
            return generateBlogDocument(
              logger,
              configDir,
              outDir,
              finalOutDir,
              articleDir,
              renderedArticles,
              blogIndexTemplate,
              blogEntryTemplate,
              blogSingleTemplate,
              configVariables,
              navOrderBefore,
              navOrderAfter,
              navCategoryMap,
              frontPage,
              includeTimeline,
              siteTemplateOutputMap,
              resolvedBaseUrl,
              signal
            );
          }
          await generateDirectoryDocument(
            logger,
            configDir,
            outDir,
            finalOutDir,
            articleDir,
            renderedArticles,
            pageTemplate,
            categoryEntryTemplate,
            configVariables,
            navOrderBefore,
            navOrderAfter,
            navCategoryMap,
            frontPage,
            includeTimeline,
            siteTemplateOutputMap,
            resolvedBaseUrl,
            signal
          );
          return [];
        })
      )
    ).flat();

    blogSinglePages.forEach((singlePath) => {
      documentPaths.add(singlePath);
    });

    if (includeTimeline) {
      if (!timelineIndexTemplate || !timelineEntryTemplate) {
        throw new Error(
          'Timeline templates are missing: index-timeline.html or timeline-entry.html'
        );
      }
      await generateTimelineDocument(
        logger,
        configDir,
        outDir,
        finalOutDir,
        renderedResults,
        timelineIndexTemplate,
        configVariables,
        navOrderBefore,
        navOrderAfter,
        navCategoryMap,
        blogCategoryNames,
        timelineEntryTemplate,
        frontPage,
        siteTemplateOutputMap,
        resolvedBaseUrl,
        signal
      );
    }

    const siteTemplateData: Record<string, unknown> = {};
    const hasFeedTemplates = siteTemplateEntries.some(
      (entry) => entry.name === 'feed.xml' || entry.name === 'atom.xml'
    );
    const hasSitemapTemplate = siteTemplateEntries.some(
      (entry) => entry.name === 'sitemap.xml'
    );
    if (hasFeedTemplates) {
      const feedData = await buildFeedTemplateData({
        logger,
        outDir,
        baseUrl: resolvedBaseUrl,
        renderedResults,
        variables: configVariables,
        frontPage,
        blogCategoryNames,
        siteTemplateOutputMap,
      });
      Object.assign(siteTemplateData, feedData);
    }
    if (hasSitemapTemplate) {
      siteTemplateData.sitemapUrls = buildSitemapUrls({
        outDir,
        baseUrl: resolvedBaseUrl,
        documentPaths: Array.from(documentPaths),
      });
    }

    await renderSiteTemplates(
      siteTemplateEntries,
      configVariables,
      siteTemplateData,
      resolvedBaseUrl,
      configDir,
      outDir,
      finalOutDir,
      logger,
      signal
    );
    await swapOutputDir(outDir, finalOutDir);
    outputSwapped = true;
  } finally {
    if (!outputSwapped) {
      await rm(outDir, { recursive: true, force: true });
    }
  }
};

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

const createOutputStagingDir = async (finalOutDir: string): Promise<string> => {
  const parentDir = dirname(finalOutDir);
  await mkdir(parentDir, { recursive: true });
  const baseName = basename(finalOutDir);
  const prefix = join(parentDir, `${baseName}.tmp-`);
  return mkdtemp(prefix);
};

const swapOutputDir = async (
  stagingDir: string,
  finalOutDir: string
): Promise<void> => {
  const parentDir = dirname(finalOutDir);
  const baseName = basename(finalOutDir);
  const hasOutDir = await pathExists(finalOutDir);
  const backupDir = hasOutDir
    ? join(parentDir, `${baseName}.tmp-${Date.now()}`)
    : undefined;

  if (hasOutDir && backupDir) {
    await rename(finalOutDir, backupDir);
  }

  try {
    await rename(stagingDir, finalOutDir);
  } catch (error) {
    if (backupDir) {
      try {
        await rename(backupDir, finalOutDir);
      } catch {
        // ignore restore failure
      }
    }
    throw error;
  }

  if (backupDir) {
    await rm(backupDir, { recursive: true, force: true });
  }
};
