// Mutationstests: Stryker verändert den Quelltext an einer Stelle (ein „Mutant“) und lässt die Tests laufen.
// Bleiben sie grün, prüft kein Test diese Stelle. Aufruf: `pnpm mutation` (Wurzel) oder `pnpm --filter @stups/server mutation`.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // pnpm legt den Runner nicht neben den Kern, darum ausdrücklich laden
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.mutation.config.ts' },
  // Zuerst die Module, in denen ein Fehler am meisten kostet: Rechte, Sichtbarkeit, Anmeldung, Netzgrenze, Zeitrechnung.
  // Weitere Dateien hier ergänzen; jede zusätzliche verlängert den Lauf.
  mutate: [
    'src/permissions.ts',
    'src/access.ts',
    'src/api/child-guard.ts',
    'src/api/board-guard.ts',
    'src/store/visibility.ts',
    'src/store/board-access.ts',
    'src/store/validate.ts',
    'src/store/confirmation.ts',
    'src/session-auth.ts',
    'src/identity.ts',
    'src/ingress.ts',
    'src/safe-fetch.ts',
    'src/upload-quota.ts',
    'src/recurrence.ts',
    'src/reminders.ts',
    'src/time.ts',
    'src/quiet.ts',
  ],
  coverageAnalysis: 'perTest',
  // Ein zweiter Lauf prüft nur, was sich an Quelltext oder Tests geändert hat
  incremental: true,
  incrementalFile: 'reports/mutation/incremental.json',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
  // Stryker schreibt Pfade der tsconfig für den Sandkasten um und braucht dafür die JS-Schnittstelle von TypeScript, die es in
  // TypeScript 7 nicht mehr gibt. Die tsconfig dieses Pakets zeigt nicht aus dem Paket hinaus, es gibt nichts umzuschreiben:
  // Der Name einer Datei, die es nicht gibt, schaltet den Schritt ab.
  tsconfigFile: 'tsconfig.stryker-unbenutzt.json',
  // Kein Abbruch unter einer Schwelle: Der Bericht zeigt Lücken, er sperrt keinen Stand
  thresholds: { high: 90, low: 75, break: null },
};
