// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { describe, expect, it, type TestContext } from 'vitest';
import type { CodeHighlightOptions, Logger } from 'mark-deco';

import { buildRenderPlan, runRenderWorkers } from '../src/worker/renderPlan';

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join(
    'test_results',
    'render-workers',
    String(Date.now()),
    fn.task.name,
    name
  );
  await mkdir(basePath, { recursive: true });
  return basePath;
};

describe('runRenderWorkers', () => {
  it('logs performance metrics', async (fn) => {
    const docsDir = await createTempDir(fn, 'docs');
    const workDir = await createTempDir(fn, 'work');
    const cacheDir = await createTempDir(fn, 'cache');

    await writeFile(join(docsDir, 'a.md'), `---\n---\n\n# A\n`, 'utf8');
    await writeFile(join(docsDir, 'b.md'), `---\n---\n\n# B\n`, 'utf8');

    const entries = [
      {
        absolutePath: resolve(docsDir, 'a.md'),
        relativePath: 'a.md',
        directory: '.',
      },
      {
        absolutePath: resolve(docsDir, 'b.md'),
        relativePath: 'b.md',
        directory: '.',
      },
    ];

    const plan = await buildRenderPlan(entries, resolve(docsDir));

    const debugLogs: string[] = [];
    const infoLogs: string[] = [];
    const logger: Logger = {
      debug: (message: string) => debugLogs.push(message),
      info: (message: string) => infoLogs.push(message),
      warn: () => undefined,
      error: () => undefined,
    };

    const codeHighlight: CodeHighlightOptions = {};
    const abortController = new AbortController();

    await runRenderWorkers({
      logger,
      plan,
      workDir: resolve(workDir),
      cacheDir: resolve(cacheDir),
      userAgent: 'atr-test',
      codeHighlight,
      beautifulMermaid: undefined,
      mermaidRenderer: 'beautiful',
      linkTarget: '_blank',
      signal: abortController.signal,
    });

    const chunkLog = debugLogs.find((message) =>
      message.includes('chunk entries')
    );
    const entryLog = infoLogs.find((message) => message.includes('entry time'));
    const totalLog = infoLogs.find((message) => message.includes('total time'));

    expect(chunkLog).toBeTruthy();
    expect(entryLog).toBeTruthy();
    expect(totalLog).toBeTruthy();

    const chunkCounts = chunkLog?.match(/\d+/g)?.map(Number) ?? [];
    const chunkSum = chunkCounts.reduce((sum, value) => sum + value, 0);
    expect(chunkSum).toBe(plan.files.length);

    expect(entryLog).toMatch(/max=.*(ms|s)/);
    expect(entryLog).toMatch(/avg=.*(ms|s)/);
    expect(totalLog).toMatch(/total time .*?(ms|s)/);
  });
});
