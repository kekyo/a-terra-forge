// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

import { resolve } from 'path';
import { defineConfig } from 'vite';
import { atrPreview } from 'atr/vite';

const projectRoot = process.cwd();

export default defineConfig({
  root: resolve(projectRoot, 'dist'),
  publicDir: false,
  plugins: [
    atrPreview({
      configPath: resolve(projectRoot, 'atr.json'),
    }),
  ],
  server: {
    open: true,
  },
});
