import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'packages/server/web/**', 'packages/web/.svelte-kit/**', 'local/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Tippfehler und echte Fehler zählen, Stilfragen nicht
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'svelte/no-navigation-without-resolve': 'off',
      // Date wird hier nur einmalig zum Rechnen genutzt, nicht als reaktiver Zustand
      'svelte/prefer-svelte-reactivity': 'off',
      // svelte-check kennt Warnungen, die ESLint nicht sieht; die dortigen Ignore-Kommentare sind nötig
      'svelte/no-unused-svelte-ignore': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
);
