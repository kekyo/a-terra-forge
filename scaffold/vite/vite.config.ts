// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { resolve } from 'path';
import { defineConfig } from 'vite';
import { atrPreview } from 'a-terra-forge/vite';

const projectRoot = process.cwd();

export default defineConfig({
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
