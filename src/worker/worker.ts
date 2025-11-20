// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { parentPort, workerData } from 'worker_threads';

import { createProcessorLogger } from '../logger';
import type { Logger } from '../types';
import {
  createDefaultMarkdownProcessor,
  renderArticleSnapshot,
  type RenderWorkerPayload,
  writeRenderedSnapshot,
} from './renderPipeline';

//////////////////////////////////////////////////////////////////////////////

const postMessage = (message: Record<string, unknown>) => {
  if (parentPort) {
    parentPort.postMessage(message);
  }
};

const createWorkerLogger = (workerIndex: number): Logger => ({
  debug: (message: string) =>
    postMessage({ type: 'log', level: 'debug', message, workerIndex }),
  info: (message: string) =>
    postMessage({ type: 'log', level: 'info', message, workerIndex }),
  warn: (message: string) =>
    postMessage({ type: 'log', level: 'warn', message, workerIndex }),
  error: (message: string) =>
    postMessage({ type: 'log', level: 'error', message, workerIndex }),
});

const run = async () => {
  const payload = workerData as RenderWorkerPayload;
  const logger = createWorkerLogger(payload.workerIndex);
  const processorLogger = createProcessorLogger(
    logger,
    `atr:processor:worker-${payload.workerIndex}`
  );

  const processor = createDefaultMarkdownProcessor({
    cacheDir: payload.cacheDir,
    userAgent: payload.userAgent,
    logger: processorLogger,
  });

  for (const entry of payload.entries) {
    const entryStartedAt = performance.now();
    const snapshot = await renderArticleSnapshot({
      processor,
      entry,
      docsDir: payload.docsDir,
      logger,
      codeHighlight: payload.codeHighlight,
      linkTarget: payload.linkTarget,
    });
    await writeRenderedSnapshot(payload.workDir, snapshot);
    const entryDurationMs = performance.now() - entryStartedAt;
    postMessage({
      type: 'entryTiming',
      durationMs: entryDurationMs,
      entryIndex: entry.index,
      workerIndex: payload.workerIndex,
    });
  }

  postMessage({ type: 'done', workerIndex: payload.workerIndex });
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  postMessage({ type: 'error', message, stack });
  process.exitCode = 1;
});
