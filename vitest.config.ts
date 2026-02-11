import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/types/**/*'],
    },
  },
});
