// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { join, resolve } from 'path';
import { defineConfig, UserConfig } from 'vite';
import dts from 'vite-plugin-dts';
import prettierMax from 'prettier-max';
import screwUp from 'screw-up';
import { atrPreview } from './src/vite';

const buildConfig: UserConfig = {
  plugins: [
    prettierMax({
      typescript: 'tsconfig.tests.json',
    }),
    screwUp({
      outputMetadataFile: true,
    }),
    dts({
      rollupTypes: true,
    }),
  ],
  build: {
    outDir: 'dist',
    lib: {
      entry: {
        index: 'src/index.ts',
        vite: 'src/vite.ts',
        worker: 'src/worker/worker.ts',
      },
      name: 'atr',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      output: {
        banner: '#!/usr/bin/env node',
      },
      external: [
        'fs',
        'fs/promises',
        'os',
        'crypto',
        'path',
        'url',
        'util',
        'debug',
        'events',
        'child_process',
        'worker_threads',
        'glob',
        'commander',
        'mark-deco',
        'mark-deco/node',
      ],
    },
    target: 'es2018',
    minify: false,
    sourcemap: true,
  },
};

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  if (command === 'serve') {
    const demoRoot = resolve('demo');
    return {
      publicDir: false,
      plugins: [
        atrPreview({
          configPath: join(demoRoot, 'atr.json'),
          variables: {
            docsDir: join(demoRoot, 'docs'),
            templatesDir: resolve('scaffold/templates'),
            outDir: join(demoRoot, 'dist'),
          },
        }),
      ],
      server: {
        open: true,
      },
    };
  }

  return buildConfig;
});
