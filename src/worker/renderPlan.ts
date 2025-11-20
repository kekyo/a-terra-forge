// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { readFile } from 'fs/promises';
import { cpus } from 'os';
import { Worker } from 'worker_threads';
import type { CodeHighlightOptions, Logger } from 'mark-deco';

import { createProcessorLogger } from '../logger';
import type { ArticleFileInfo } from '../utils';
import { isValidArticleId, parseFrontmatterInfo } from '../process/frontmatter';
import { toPosixPath } from '../process/helpers';
import type {
  RenderedArticleSnapshot,
  RenderPlan,
  RenderPlanEntry,
  RenderWorkerPayload,
} from './renderPipeline';
import {
  createDefaultMarkdownProcessor,
  readRenderedSnapshot,
  renderArticleSnapshot,
  writeRenderedSnapshot,
} from './renderPipeline';
import { resolveWorkerEntry } from './workdir';

//////////////////////////////////////////////////////////////////////////////

/**
 * Preserve the initial global fetch implementation.
 */
const baseFetch = globalThis.fetch;

/**
 * Build render plan by scanning frontmatter ids and assigning new ones.
 */
export const buildRenderPlan = async (
  articleFiles: readonly ArticleFileInfo[],
  docsDir: string
): Promise<RenderPlan> => {
  const rawEntries = await Promise.all(
    articleFiles.map(async (articleFile) => {
      const content = await readFile(articleFile.absolutePath, 'utf8');
      const info = parseFrontmatterInfo(content, articleFile.relativePath);
      return {
        relativePath: articleFile.relativePath,
        directory: articleFile.directory,
        orderKey: toPosixPath(articleFile.relativePath),
        originalId: info.id,
        draft: info.draft,
      };
    })
  );

  rawEntries.sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  const usedIds = new Set<number>();
  let maxId = -1;
  const assigned: Array<{
    relativePath: string;
    directory: string;
    orderKey: string;
    originalId?: number;
    isDuplicate: boolean;
    assignedId?: number;
  }> = [];

  for (const entry of rawEntries) {
    if (isValidArticleId(entry.originalId) && entry.draft) {
      usedIds.add(entry.originalId);
      maxId = Math.max(maxId, entry.originalId);
    }
  }

  for (const entry of rawEntries) {
    if (entry.draft) {
      continue;
    }
    const originalId = entry.originalId;
    const hasOriginal = isValidArticleId(originalId);
    const isDuplicate = hasOriginal ? usedIds.has(originalId) : false;
    const assignedId = hasOriginal && !isDuplicate ? originalId : undefined;

    if (hasOriginal && !isDuplicate) {
      usedIds.add(originalId);
      maxId = Math.max(maxId, originalId);
    }

    assigned.push({
      relativePath: entry.relativePath,
      directory: entry.directory,
      assignedId,
      originalId,
      isDuplicate,
      orderKey: entry.orderKey,
    });
  }

  for (const entry of assigned) {
    if (!isValidArticleId(entry.assignedId)) {
      entry.assignedId = ++maxId;
    }
  }

  const planEntries = assigned.map((entry, index) => {
    if (!isValidArticleId(entry.assignedId)) {
      throw new Error(`Failed to assign article id for ${entry.relativePath}.`);
    }
    return {
      index,
      relativePath: entry.relativePath,
      directory: entry.directory,
      assignedId: entry.assignedId,
      originalId: entry.originalId,
      isDuplicate: entry.isDuplicate,
    };
  });

  return {
    version: 1,
    docsDir,
    files: planEntries,
  };
};

/**
 * Split render entries into worker chunks.
 */
const splitRenderEntries = (
  entries: readonly RenderPlanEntry[],
  workerCount: number
): RenderPlanEntry[][] => {
  const actualCount = Math.max(
    1,
    Math.min(workerCount, entries.length === 0 ? 1 : entries.length)
  );
  const chunks: RenderPlanEntry[][] = Array.from(
    { length: actualCount },
    () => []
  );
  entries.forEach((entry, index) => {
    chunks[index % actualCount]!.push(entry);
  });
  return chunks.filter((chunk) => chunk.length > 0);
};

/**
 * Render plan entries in-process without worker threads.
 */
const renderPlanInProcess = async (
  logger: Logger,
  plan: RenderPlan,
  workDir: string,
  cacheDir: string | undefined,
  userAgent: string,
  codeHighlight: CodeHighlightOptions,
  linkTarget?: string,
  onEntryRendered?: (durationMs: number) => void
): Promise<void> => {
  const processorLogger = createProcessorLogger(logger, 'atr:processor');
  const processor = createDefaultMarkdownProcessor({
    cacheDir,
    userAgent,
    logger: processorLogger,
  });

  for (const entry of plan.files) {
    const entryStartedAt = performance.now();
    const snapshot = await renderArticleSnapshot({
      processor,
      entry,
      docsDir: plan.docsDir,
      logger,
      codeHighlight,
      linkTarget,
    });
    await writeRenderedSnapshot(workDir, snapshot);
    const entryDurationMs = performance.now() - entryStartedAt;
    onEntryRendered?.(entryDurationMs);
  }
};

/**
 * Render plan entries with worker threads, falling back when needed.
 */
export const runRenderWorkers = async ({
  logger,
  plan,
  workDir,
  cacheDir,
  userAgent,
  codeHighlight,
  linkTarget,
  signal,
}: {
  logger: Logger;
  plan: RenderPlan;
  workDir: string;
  cacheDir: string | undefined;
  userAgent: string;
  codeHighlight: CodeHighlightOptions;
  linkTarget?: string;
  signal: AbortSignal;
}): Promise<void> => {
  if (plan.files.length === 0) {
    return;
  }

  const startedAt = performance.now();
  const expectedEntryCount = plan.files.length;
  let entryCount = 0;
  let entryTotalMs = 0;
  let entryMaxMs = 0;
  let entryTimingResolve: (() => void) | null = null;
  const entryTimingPromise = new Promise<void>((resolve) => {
    entryTimingResolve = resolve;
  });

  const recordEntryDuration = (durationMs: number) => {
    entryCount += 1;
    entryTotalMs += durationMs;
    entryMaxMs = Math.max(entryMaxMs, durationMs);
    if (entryCount >= expectedEntryCount && entryTimingResolve) {
      entryTimingResolve();
      entryTimingResolve = null;
    }
  };

  const formatDuration = (durationMs: number) => `${durationMs.toFixed(2)}ms`;

  const logChunkEntries = (chunks: RenderPlanEntry[][], mode: string) => {
    const entriesPerChunk = chunks.map((chunk) => chunk.length).join(', ');
    logger.debug(`renderer: chunk entries (${mode}) = ${entriesPerChunk}`);
  };

  const logEntryStats = () => {
    const averageMs = entryCount > 0 ? entryTotalMs / entryCount : 0;
    logger.info(
      `renderer: entry time max=${formatDuration(
        entryMaxMs
      )} avg=${formatDuration(averageMs)} (${entryCount} entries)`
    );
  };

  const logTotalTime = () => {
    const totalMs = performance.now() - startedAt;
    logger.info(`renderer: total time ${formatDuration(totalMs)}`);
  };

  const finalizeMetrics = async () => {
    if (entryCount < expectedEntryCount) {
      await entryTimingPromise;
    }
    logEntryStats();
    logTotalTime();
  };

  if (globalThis.fetch && globalThis.fetch !== baseFetch) {
    logger.info(
      'renderer: Custom fetch detected. Falling back to in-process rendering.'
    );
    logChunkEntries([plan.files.slice()], 'in-process');
    await renderPlanInProcess(
      logger,
      plan,
      workDir,
      cacheDir,
      userAgent,
      codeHighlight,
      linkTarget,
      recordEntryDuration
    );
    await finalizeMetrics();
    return;
  }

  const workerEntry = await resolveWorkerEntry();
  if (!workerEntry) {
    logger.warn(
      'renderer: Worker entry not found. Falling back to in-process rendering.'
    );
    logChunkEntries([plan.files.slice()], 'in-process');
    await renderPlanInProcess(
      logger,
      plan,
      workDir,
      cacheDir,
      userAgent,
      codeHighlight,
      linkTarget,
      recordEntryDuration
    );
    await finalizeMetrics();
    return;
  }

  const chunks = splitRenderEntries(plan.files, cpus().length);
  logChunkEntries(chunks, 'workers');
  const workers: Worker[] = [];
  let aborted = false;

  const terminateWorkers = () => {
    for (const worker of workers) {
      worker.terminate();
    }
  };

  const abortHandler = () => {
    aborted = true;
    terminateWorkers();
  };

  signal.addEventListener('abort', abortHandler);

  try {
    await Promise.all(
      chunks.map(
        (entries, workerIndex) =>
          new Promise<void>((resolve, reject) => {
            if (aborted) {
              reject(new Error('Rendering aborted.'));
              return;
            }

            const payload: RenderWorkerPayload = {
              workerIndex,
              docsDir: plan.docsDir,
              workDir,
              entries,
              cacheDir,
              userAgent,
              codeHighlight,
              linkTarget,
            };

            const worker = new Worker(workerEntry, { workerData: payload });
            workers.push(worker);

            let settled = false;
            const finishError = (error: unknown) => {
              if (settled) {
                return;
              }
              settled = true;
              const err =
                error instanceof Error ? error : new Error(String(error));
              terminateWorkers();
              reject(err);
            };

            worker.on('message', (message: any) => {
              if (!message || typeof message !== 'object') {
                return;
              }
              if (message.type === 'log') {
                const level = String(message.level);
                const workerTag =
                  typeof message.workerIndex === 'number'
                    ? `worker-${message.workerIndex}: `
                    : '';
                const text = `renderer: ${workerTag}${message.message ?? ''}`;
                if (level === 'debug') {
                  logger.debug(text);
                } else if (level === 'info') {
                  logger.info(text);
                } else if (level === 'warn') {
                  logger.warn(text);
                } else if (level === 'error') {
                  logger.error(text);
                } else {
                  logger.info(text);
                }
                return;
              }
              if (message.type === 'entryTiming') {
                const durationMs = Number(message.durationMs);
                if (Number.isFinite(durationMs)) {
                  recordEntryDuration(durationMs);
                }
                return;
              }
              if (message.type === 'error') {
                const err = new Error(
                  message.message ? String(message.message) : 'Worker error'
                );
                if (message.stack) {
                  err.stack = String(message.stack);
                }
                finishError(err);
              }
            });

            worker.on('error', (error) => {
              finishError(error);
            });

            worker.on('exit', (code) => {
              if (settled) {
                return;
              }
              settled = true;
              if (code === 0) {
                resolve();
              } else {
                terminateWorkers();
                reject(
                  new Error(
                    `Worker ${workerIndex} exited with code ${code ?? 'null'}.`
                  )
                );
              }
            });
          })
      )
    );
    await finalizeMetrics();
  } finally {
    signal.removeEventListener('abort', abortHandler);
  }
};

/**
 * Load rendered snapshots from the work directory.
 */
export const loadRenderedSnapshots = async (
  plan: RenderPlan,
  workDir: string
): Promise<RenderedArticleSnapshot[]> => {
  return Promise.all(
    plan.files.map(async (entry) => {
      try {
        const snapshot = await readRenderedSnapshot(workDir, entry.index);
        return snapshot;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to read render output (${entry.relativePath}): ${message}`
        );
      }
    })
  );
};
