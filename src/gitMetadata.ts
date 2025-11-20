// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import fs from 'fs/promises';
import { posix } from 'path';
import * as git from 'isomorphic-git';

import type {
  GitCommitMetadata,
  GitFileMetadata,
  GitStatusMetadata,
  GitUserMetadata,
  Logger,
} from './types';
import type { ArticleFileInfo } from './utils';
import { toPosixRelativePath } from './utils';

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
        const entries = await git.log({
          fs,
          dir: gitRoot,
          filepath: repoPath,
          depth: 1,
          follow: false,
          force: true,
        });
        const latest = entries[0];
        if (!latest) {
          metadata.set(articleFile.relativePath, undefined);
          return;
        }

        const commit = latest.commit;
        const message = commit.message ?? '';
        const { summary, body } = splitMessage(message);
        const docsPath = toPosixRelativePath(docsDir, articleFile.absolutePath);
        const file = buildFileMetadata(docsPath, repoPath);
        const author = buildUserMetadata(commit.author);
        const committer = buildUserMetadata(commit.committer);
        const oid = latest.oid ?? '';
        const shortOid = oid.length >= 7 ? oid.slice(0, 7) : oid;

        metadata.set(articleFile.relativePath, {
          oid,
          shortOid,
          message,
          summary,
          body,
          parents: commit.parent ?? [],
          tree: commit.tree ?? '',
          author,
          committer,
          file,
          ...(status ? { status } : {}),
          ...(dirty !== undefined ? { dirty } : {}),
        });
      } catch {
        metadata.set(articleFile.relativePath, undefined);
      }
    })
  );

  return metadata;
};
