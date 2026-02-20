import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    alias: {
      'onecrawl': new URL('./src/__mocks__/onecrawl.ts', import.meta.url).pathname,
      '@giulio-leone/gaussflow-vectorless': new URL('./src/__mocks__/@giulio-leone/gaussflow-vectorless.ts', import.meta.url).pathname
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/types/**/*'],
    },
  },
});
