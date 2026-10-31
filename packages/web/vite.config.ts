import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit die App unter dem wechselnden Ingress-Pfad von Home Assistant läuft.
  base: './',
  plugins: [tailwindcss(), svelte()],
  build: { outDir: '../server/web', emptyOutDir: true },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8099', ws: true } } },
});
