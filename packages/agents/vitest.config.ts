import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
  },
  resolve: {
    alias: {
      '@continue-reasoning/core': path.resolve(__dirname, '../core'),
      '@continue-reasoning/cli-client': path.resolve(__dirname, '../cli-client'),
      '@continue-reasoning/cr-coding': path.resolve(__dirname, './'),
    }
  }
});