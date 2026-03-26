// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import fs from 'fs/promises';
import { posix } from 'path';
import * as git from 'isomorphic-git';
import type { ReadCommitResult, TreeEntry } from 'isomorphic-git';

import type {
  GitCommitMetadata,
  GitFileMetadata,
  GitRevisionMetadata,
  GitStatusMetadata,
  GitUserMetadata,
  Logger,
} from './types';
import type { ArticleFileInfo } from './utils';
import { toPosixRelativePath } from './utils';
import { parseFrontmatterId } from './process/frontmatter';

///////////////////////////////////////////////////////////////////////////////////

const buildUserMetadata = (
  user:
    | {
        name?: string;
        email?: string;
        timestamp?: number;
      }
    | undefined
): GitUserMetadata => {
  const name = user?.name ?? '';
  const email = user?.email ?? '';
  const date =
    typeof user?.timestamp === 'number' && Number.isFinite(user.timestamp)
      ? new Date(user.timestamp * 1000).toISOString()
      : undefined;
  return date ? { name, email, date } : { name, email };
};

const buildFileMetadata = (
  docsRelativePath: string,
  repoRelativePath: string
): GitFileMetadata => {
  const normalizedPath = docsRelativePath.split('\\').join('/');
  const directory = posix.dirname(normalizedPath);
  const name = posix.basename(normalizedPath);
  const extension = posix.extname(name);
  const stem = extension ? name.slice(0, -extension.length) : name;
  return {
    path: normalizedPath,
    repoPath: repoRelativePath,
    directory: directory === '.' ? '' : directory,
    name,
    stem,
    extension,
  };
};

const splitMessage = (message: string): { summary: string; body: string } => {
  if (!message) {
    return { summary: '', body: '' };
  }
  const lines = message.split(/\r?\n/);
  const summary = lines[0]?.trim() ?? '';
  const body = lines.slice(1).join('\n').trim();
  return { summary, body };
};

const buildRevisionMetadata = (
  commitEntry: ReadCommitResult
): GitRevisionMetadata => {
  const commit = commitEntry.commit;
  const message = commit.message ?? '';
  const { summary, body } = splitMessage(message);
  const author = buildUserMetadata(commit.author);
  const committer = buildUserMetadata(commit.committer);
  const oid = commitEntry.oid ?? '';
  const shortOid = oid.length >= 7 ? oid.slice(0, 7) : oid;

  return {
    oid,
    shortOid,
    message,
    summary,
    body,
    parents: commit.parent ?? [],
    tree: commit.tree ?? '',
    author,
    committer,
  };
};

type HistoryContinuation =
  | {
      ref: string;
      filepath: string;
    }
  | undefined;

const isMarkdownTreeEntry = (entry: TreeEntry): boolean =>
  entry.type === 'blob' && entry.path.toLowerCase().endsWith('.md');

const parseFrontmatterIdSafe = (
  content: string,
  relativePath: string,
  logger: Logger | undefined
): number | undefined => {
  try {
    return parseFrontmatterId(content, relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger?.debug?.(
      `Git history frontmatter scan skipped for "${relativePath}": ${message}`
    );
    return undefined;
  }
};

const scanTreeForArticleId = async (
  gitRoot: string,
  treeOid: string,
  currentPath: string,
  articleId: number,
  logger: Logger | undefined
): Promise<readonly string[]> => {
  const { tree } = await git.readTree({
    fs,
    dir: gitRoot,
    oid: treeOid,
  });

  const pathLists = await Promise.all(
    tree.map(async (entry) => {
      const entryPath = currentPath
        ? posix.join(currentPath, entry.path)
        : entry.path;
      if (entry.type === 'tree') {
        return scanTreeForArticleId(
          gitRoot,
          entry.oid,
          entryPath,
          articleId,
          logger
        );
      }
      if (!isMarkdownTreeEntry(entry)) {
        return [];
      }

      const { blob } = await git.readBlob({
        fs,
        dir: gitRoot,
        oid: entry.oid,
      });
      const content = Buffer.from(blob).toString('utf8');
      const scannedId = parseFrontmatterIdSafe(content, entryPath, logger);
      return scannedId === articleId ? [entryPath] : [];
    })
  );

  return pathLists.flat();
};

const findHistoryContinuationById = async (
  gitRoot: string,
  docsRepoPath: string,
  articleId: number,
  parentOids: readonly string[],
  articleRelativePath: string,
  logger: Logger | undefined
): Promise<HistoryContinuation> => {
  const candidates = new Map<string, { ref: string; filepath: string }>();

  for (const parentOid of parentOids) {
    try {
      const parentCommit = await git.readCommit({
        fs,
        dir: gitRoot,
        oid: parentOid,
      });
      const parentTreeOid = parentCommit.commit.tree;
      const searchTreeOid = docsRepoPath
        ? (
            await git.readTree({
              fs,
              dir: gitRoot,
              oid: parentTreeOid,
              filepath: docsRepoPath,
            })
          ).oid
        : parentTreeOid;
      const matchedPaths = await scanTreeForArticleId(
        gitRoot,
        searchTreeOid,
        docsRepoPath,
        articleId,
        logger
      );
      for (const filepath of matchedPaths) {
        candidates.set(`${parentOid}:${filepath}`, {
          ref: parentOid,
          filepath,
        });
      }
    } catch {
      continue;
    }
  }

  if (candidates.size === 1) {
    const [candidate] = candidates.values();
    return candidate;
  }

  if (candidates.size > 1) {
    logger?.warn?.(
      `warning: Git history tracking for "${articleRelativePath}" was stopped because multiple parent documents share the same id ${articleId}.`
    );
  }

  return undefined;
};

const traceCommitHistory = async (
  gitRoot: string,
  docsRepoPath: string,
  articleFile: ArticleFileInfo,
  repoPath: string,
  articleId: number | undefined,
  logger: Logger | undefined
): Promise<readonly ReadCommitResult[]> => {
  const commitEntries: ReadCommitResult[] = [];
  const seenOids = new Set<string>();
  const seenContinuations = new Set<string>();
  let currentRef: string | undefined = 'HEAD';
  let currentPath = repoPath;

  while (currentRef) {
    const entries = await git.log({
      fs,
      dir: gitRoot,
      filepath: currentPath,
      ref: currentRef,
      follow: true,
      force: true,
    });
    if (entries.length === 0) {
      break;
    }

    for (const entry of entries) {
      if (!seenOids.has(entry.oid)) {
        seenOids.add(entry.oid);
        commitEntries.push(entry);
      }
    }

    const oldestEntry = entries[entries.length - 1];
    const parentOids = oldestEntry?.commit.parent ?? [];
    if (parentOids.length === 0 || articleId === undefined) {
      break;
    }

    const continuation = await findHistoryContinuationById(
      gitRoot,
      docsRepoPath,
      articleId,
      parentOids,
      articleFile.relativePath,
      logger
    );
    if (!continuation) {
      break;
    }

    const continuationKey = `${continuation.ref}:${continuation.filepath}`;
    if (seenContinuations.has(continuationKey)) {
      logger?.warn?.(
        `warning: Git history tracking for "${articleFile.relativePath}" was stopped because the continuation path repeated.`
      );
      break;
    }

    seenContinuations.add(continuationKey);
    currentRef = continuation.ref;
    currentPath = continuation.filepath;
  }

  return commitEntries;
};

export const collectGitMetadata = async (
  docsDir: string,
  articleFiles: readonly ArticleFileInfo[],
  logger?: Logger
): Promise<ReadonlyMap<string, GitCommitMetadata | undefined>> => {
  const metadata = new Map<string, GitCommitMetadata | undefined>();
  if (articleFiles.length === 0) {
    return metadata;
  }

  let gitRoot: string;
  try {
    gitRoot = await git.findRoot({ fs, filepath: docsDir });
  } catch {
    logger?.debug?.(`Git repository was not found under: ${docsDir}`);
    return metadata;
  }

  const docsRepoPath = toPosixRelativePath(gitRoot, docsDir);
  const repoPaths: string[] = [];
  const repoPathByArticle = new Map<string, string>();
  for (const articleFile of articleFiles) {
    const repoPath = toPosixRelativePath(gitRoot, articleFile.absolutePath);
    if (repoPath.startsWith('..')) {
      metadata.set(articleFile.relativePath, undefined);
      continue;
    }
    repoPaths.push(repoPath);
    repoPathByArticle.set(articleFile.relativePath, repoPath);
  }

  const statusByPath = new Map<string, GitStatusMetadata>();
  if (repoPaths.length > 0) {
    try {
      const statusEntries = await git.statusMatrix({
        fs,
        dir: gitRoot,
        filepaths: repoPaths,
      });
      for (const [filepath, head, workdir, stage] of statusEntries) {
        statusByPath.set(filepath, { head, workdir, stage });
      }
    } catch {
      logger?.debug?.('Git statusMatrix failed to collect status entries.');
    }
  }

  await Promise.all(
    articleFiles.map(async (articleFile) => {
      const repoPath = repoPathByArticle.get(articleFile.relativePath);
      if (!repoPath) {
        metadata.set(articleFile.relativePath, undefined);
        return;
      }

      const status = statusByPath.get(repoPath);
      const dirty =
        status !== undefined &&
        !(status.head === status.workdir && status.workdir === status.stage);

      try {
        const articleContent = await fs.readFile(
          articleFile.absolutePath,
          'utf8'
        );
        const articleId = parseFrontmatterIdSafe(
          articleContent,
          articleFile.relativePath,
          logger
        );
        const entries = await traceCommitHistory(
          gitRoot,
          docsRepoPath,
          articleFile,
          repoPath,
          articleId,
          logger
        );
        const latest = entries[0];
        if (!latest) {
          metadata.set(articleFile.relativePath, undefined);
          return;
        }

        const createdEntry = entries[entries.length - 1] ?? latest;
        const updated = buildRevisionMetadata(latest);
        const created = buildRevisionMetadata(createdEntry);

        const docsPath = toPosixRelativePath(docsDir, articleFile.absolutePath);
        const file = buildFileMetadata(docsPath, repoPath);

        metadata.set(articleFile.relativePath, {
          ...updated,
          file,
          ...(status ? { status } : {}),
          ...(dirty !== undefined ? { dirty } : {}),
          created,
          updated,
        });
      } catch {
        metadata.set(articleFile.relativePath, undefined);
      }
    })
  );

  return metadata;
};
