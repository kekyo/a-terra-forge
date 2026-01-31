// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { describe, expect, it, vi, type TestContext } from 'vitest';
import dayjs from 'dayjs';

import type { GitCommitMetadata } from '../src/types';
import type { RenderPlan } from '../src/worker/renderPipeline';

///////////////////////////////////////////////////////////////////////////////////

const mockState = vi.hoisted(() => ({
  collectGitMetadataMock: vi.fn(),
  runRenderWorkersMock: vi.fn(),
  loadRenderedSnapshotsMock: vi.fn(),
}));

vi.mock('../src/gitMetadata', () => ({
  collectGitMetadata: mockState.collectGitMetadataMock,
}));

vi.mock('../src/worker/renderPlan', async () => {
  const actual = await vi.importActual<
    typeof import('../src/worker/renderPlan')
  >('../src/worker/renderPlan');
  return {
    ...actual,
    runRenderWorkers: mockState.runRenderWorkersMock,
    loadRenderedSnapshots: mockState.loadRenderedSnapshotsMock,
  };
});

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

///////////////////////////////////////////////////////////////////////////////////

describe('generateDocs', () => {
  it('starts git metadata collection without blocking rendering', async (fn) => {
    mockState.collectGitMetadataMock.mockReset();
    mockState.runRenderWorkersMock.mockReset();
    mockState.loadRenderedSnapshotsMock.mockReset();

    const docsDir = await createTempDir(fn, 'docs');
    const templatesDir = await createTempDir(fn, 'templates');
    const outDir = await createTempDir(fn, 'out');

    await writeFile(join(docsDir, 'entry.md'), '# Title', 'utf8');
    await writeFile(
      join(templatesDir, 'index-category.html'),
      '<html><body>{{for article articles}}{{article.entryHtml}}{{end}}</body></html>',
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'index-timeline.html'),
      '<html><body>{{timelineIndexPath}}</body></html>',
      'utf8'
    );
    await writeFile(
      join(templatesDir, 'timeline-entry.html'),
      '<article>{{body}}</article>',
      'utf8'
    );

    const events: string[] = [];
    let resolveGit: (
      value: ReadonlyMap<string, GitCommitMetadata | undefined>
    ) => void = () => undefined;

    const gitPromise = new Promise<
      ReadonlyMap<string, GitCommitMetadata | undefined>
    >((resolvePromise) => {
      resolveGit = resolvePromise;
    });

    mockState.collectGitMetadataMock.mockImplementation(async () => {
      events.push('git-started');
      return gitPromise;
    });

    mockState.runRenderWorkersMock.mockImplementation(async () => {
      events.push('render-started');
    });

    mockState.loadRenderedSnapshotsMock.mockImplementation(
      async (plan: RenderPlan) => {
        events.push('snapshots-loaded');
        return plan.files.map((entry) => ({
          index: entry.index,
          relativePath: entry.relativePath,
          directory: entry.directory,
          html: '<p>Body</p>',
          timelineHtml: '<p>Body</p>',
          frontmatter: { id: entry.assignedId, title: 'Title' },
          uniqueIdPrefix: 'u',
        }));
      }
    );

    vi.resetModules();
    const { generateDocs } = await import('../src/process');

    const abortController = new AbortController();
    const generation = generateDocs(
      {
        docsDir: resolve(docsDir),
        templatesDir: resolve(templatesDir),
        outDir: resolve(outDir),
        cacheDir: '.cache',
      },
      abortController.signal
    );

    for (
      let attempts = 0;
      attempts < 100 && mockState.runRenderWorkersMock.mock.calls.length === 0;
      attempts += 1
    ) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }

    expect(mockState.runRenderWorkersMock).toHaveBeenCalledTimes(1);
    expect(events).toContain('git-started');
    expect(events).toContain('render-started');

    resolveGit(new Map());
    await generation;
  });
});
