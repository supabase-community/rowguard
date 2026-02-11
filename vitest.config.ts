import { defineConfig } from 'vitest/config';

const isIntegration = process.env.VITEST_INTEGRATION === '1';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 2000,
    hookTimeout: 5000,
    exclude: ['**/node_modules/**', '**/dist/**'],
    include: isIntegration
      ? ['tests/integration.test.ts']
      : ['tests/sql-generation.test.ts', 'tests/typed.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
});
