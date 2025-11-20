// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { existsSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { join, posix, resolve } from 'path';

type NextFunction = (error?: unknown) => void;

const isHtmlNavigation = (req: IncomingMessage): boolean => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  const accept = req.headers.accept;
  if (accept === undefined || accept === '') {
    return true;
  }

  return accept.includes('text/html') || accept.includes('*/*');
};

const getPathname = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  const [pathPart] = url.split('?');
  if (!pathPart) {
    return undefined;
  }
  try {
    return decodeURIComponent(pathPart);
  } catch {
    return undefined;
  }
};

const isInternalPath = (pathname: string): boolean =>
  pathname.startsWith('/@') ||
  pathname.startsWith('/__') ||
  pathname.startsWith('/node_modules');

const resolveIndexPath = (rootDir: string, pathname: string): string => {
  const relativePath = pathname.replace(/^\/+/, '');
  return join(rootDir, relativePath, 'index.html');
};

const resolveHtmlPath = (rootDir: string, pathname: string): string => {
  const relativePath = pathname.replace(/^\/+/, '');
  return join(rootDir, relativePath);
};

const buildRedirectUrl = (rawUrl: string): string => {
  const [pathPart, queryPart] = rawUrl.split('?');
  const safePath = pathPart ?? '';
  const withSlash = safePath.endsWith('/') ? safePath : `${safePath}/`;
  return queryPart ? `${withSlash}?${queryPart}` : withSlash;
};

export const createPreviewHtmlNotFoundMiddleware = (rootDir: string) => {
  const normalizedRoot = resolve(rootDir);

  return (req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
    if (!isHtmlNavigation(req)) {
      next();
      return;
    }

    const pathname = getPathname(req.url);
    if (!pathname || isInternalPath(pathname)) {
      next();
      return;
    }

    const extension = posix.extname(pathname);
    const isDirectoryRequest = pathname.endsWith('/');
    const isHtmlFile = extension === '.html';
    const isBarePath = extension === '' && !isDirectoryRequest;

    if (!isDirectoryRequest && !isHtmlFile && !isBarePath) {
      next();
      return;
    }

    if (isDirectoryRequest) {
      const indexPath = resolveIndexPath(normalizedRoot, pathname);
      if (existsSync(indexPath)) {
        next();
        return;
      }
      res.statusCode = 404;
      res.end();
      return;
    }

    if (isHtmlFile) {
      const htmlPath = resolveHtmlPath(normalizedRoot, pathname);
      if (existsSync(htmlPath)) {
        next();
        return;
      }
      res.statusCode = 404;
      res.end();
      return;
    }

    const indexPath = resolveIndexPath(normalizedRoot, pathname);
    if (existsSync(indexPath)) {
      const rawUrl = req.url ?? pathname;
      const redirectUrl = buildRedirectUrl(rawUrl);
      res.statusCode = 307;
      res.setHeader('Location', redirectUrl);
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end();
  };
};
