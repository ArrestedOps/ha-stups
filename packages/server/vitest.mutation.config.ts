import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';

// Nur für `pnpm mutation`: Stryker kopiert das Paket in einen Sandkasten (.stryker-tmp). Tests, die den Quelltextbaum
// des ganzen Repos lesen, finden ihn dort nicht und töten keine Mutanten. Die normale Suite (`pnpm test`) bleibt vollständig.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: ['**/node_modules/**', 'test/import-cycles.test.ts'],
    },
  }),
);
