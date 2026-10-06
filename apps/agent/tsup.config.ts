import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  minify: false,
  bundle: true,
  // Sidecar autocontenido: inline TODO lo de node_modules (ai, zod, providers,
  // @ichibot/shared) en UN solo archivo. Solo quedan externos los builtins de node (node:*).
  noExternal: [/.*/],
  splitting: false,
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node'
  }
});
