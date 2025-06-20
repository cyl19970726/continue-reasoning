import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 seconds timeout for each test
    hookTimeout: 10000, // 10 seconds timeout for setup/teardown
    teardownTimeout: 10000,
    maxConcurrency: 1, // Run tests sequentially to avoid file system conflicts
    pool: 'forks', // Use separate processes for better isolation
    fileParallelism: false, // Disable parallel file execution
    isolate: true, // Isolate each test file
    include: [
      '**/*.test.ts',
      '**/*.spec.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**'
    ]
  },
  resolve: {
    alias: {
      '@': '/Users/hhh0x/agent/continue-reasoning/packages'
    }
  }
});