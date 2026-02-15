import { defineConfig } from 'vitest/config';
import path from 'path';

// OneCrawl (onegenui-deep-agents) has optional dynamic imports for peer deps
// that Vite's import analysis cannot resolve. Stub them as empty modules.
const optionalPeerStubs = [
  'onecrawl',
  '@giulio-leone/gaussflow-vectorless',
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
  '@ai-sdk/groq',
  '@ai-sdk/mcp',
  '@ai-sdk/mistral',
  '@ai-sdk/openai',
  '@openrouter/ai-sdk-provider',
];

const stubPath = path.resolve(__dirname, 'src/__stubs__/empty.ts');

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      optionalPeerStubs.map((pkg) => [pkg, stubPath]),
    ),
  },
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
