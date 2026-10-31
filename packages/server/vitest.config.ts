import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Auf einem ausgelasteten Rechner braucht schon der Start eines Test-Workers mehrere Sekunden
    testTimeout: 15_000,
  },
});
