// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it, vi, type TestContext } from 'vitest';
import dayjs from 'dayjs';

import {
  createPreviewHtmlNotFoundMiddleware,
  createPreviewPathRewriteMiddleware,
} from '../src/vite/previewMiddleware';

///////////////////////////////////////////////////////////////////////////////////

const testDate = dayjs().format(`YYYYMMDD_HHmmss`);

const createTempDir = async (fn: TestContext, name: string) => {
  const basePath = join('test_results', testDate, fn.task.name, name);
  await mkdir(basePath, { recursive: true });
  return basePath;
};

const createRequest = (url: string, accept = 'text/html', method = 'GET') =>
  ({
    method,
    url,
    headers: {
      accept,
    },
  }) as any;

const createResponse = () => {
  const res: {
    statusCode: number;
    headers: Record<string, string>;
    setHeader: (key: string, value: string) => void;
    end: ReturnType<typeof vi.fn>;
  } = {
    statusCode: 200,
    headers: {},
    setHeader: vi.fn((key: string, value: string) => {
      res.headers[key.toLowerCase()] = String(value);
    }),
    end: vi.fn(),
  };
  return res;
};

describe('createPreviewHtmlNotFoundMiddleware', () => {
  it('returns 404 when a directory index is missing.', async (fn) => {
    const rootDir = await createTempDir(fn, 'missing-directory');
    const middleware = createPreviewHtmlNotFoundMiddleware(rootDir);
    const req = createRequest('/about/');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(res.statusCode).toBe(404);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('allows directory index when it exists.', async (fn) => {
    const rootDir = await createTempDir(fn, 'existing-directory');
    const aboutDir = join(rootDir, 'about');
    await mkdir(aboutDir, { recursive: true });
    await writeFile(join(aboutDir, 'index.html'), '<html></html>', 'utf8');

    const middleware = createPreviewHtmlNotFoundMiddleware(rootDir);
    const req = createRequest('/about/');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('redirects extensionless requests when a directory index exists.', async (fn) => {
    const rootDir = await createTempDir(fn, 'redirect-directory');
    const guideDir = join(rootDir, 'guide');
    await mkdir(guideDir, { recursive: true });
    await writeFile(join(guideDir, 'index.html'), '<html></html>', 'utf8');

    const middleware = createPreviewHtmlNotFoundMiddleware(rootDir);
    const req = createRequest('/guide');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(res.statusCode).toBe(307);
    expect(res.headers.location).toBe('/guide/');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 for missing html files.', async (fn) => {
    const rootDir = await createTempDir(fn, 'missing-html');
    const middleware = createPreviewHtmlNotFoundMiddleware(rootDir);
    const req = createRequest('/missing.html');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(res.statusCode).toBe(404);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('createPreviewPathRewriteMiddleware', () => {
  it('rewrites root requests to the preview output directory.', () => {
    const middleware = createPreviewPathRewriteMiddleware('dist');
    const req = createRequest('/');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(req.url).toBe('/dist/');
    expect(next).toHaveBeenCalled();
  });

  it('rewrites extensionless paths while preserving query strings.', () => {
    const middleware = createPreviewPathRewriteMiddleware('dist');
    const req = createRequest('/guide?lang=ja');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(req.url).toBe('/dist/guide?lang=ja');
    expect(next).toHaveBeenCalled();
  });

  it('keeps already-prefixed paths as-is.', () => {
    const middleware = createPreviewPathRewriteMiddleware('dist');
    const req = createRequest('/dist/about/');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(req.url).toBe('/dist/about/');
    expect(next).toHaveBeenCalled();
  });

  it('resolves the output directory name dynamically.', () => {
    let currentOutDir = 'dist-a';
    const middleware = createPreviewPathRewriteMiddleware(() => currentOutDir);
    const res = createResponse();
    const next = vi.fn();

    const firstReq = createRequest('/');
    middleware(firstReq, res as any, next);
    expect(firstReq.url).toBe('/dist-a/');

    currentOutDir = 'dist-b';
    const secondReq = createRequest('/guide');
    middleware(secondReq, res as any, next);
    expect(secondReq.url).toBe('/dist-b/guide');
  });

  it('ignores internal Vite paths.', () => {
    const middleware = createPreviewPathRewriteMiddleware('dist');
    const req = createRequest('/@vite/client');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(req.url).toBe('/@vite/client');
    expect(next).toHaveBeenCalled();
  });

  it('skips non-GET requests.', () => {
    const middleware = createPreviewPathRewriteMiddleware('dist');
    const req = createRequest('/guide', 'text/html', 'POST');
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res as any, next);

    expect(req.url).toBe('/guide');
    expect(next).toHaveBeenCalled();
  });
});
