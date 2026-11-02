import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Das Plugin übersetzt die Runen (`$state`) in *.svelte.ts, damit auch Module wie lib/i18n getestet werden können
  plugins: [svelte()],
  test: { include: ['test/**/*.test.ts'], environment: 'node', setupFiles: ['test/setup.ts'] },
});
