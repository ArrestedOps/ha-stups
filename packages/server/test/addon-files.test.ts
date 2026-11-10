import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const load = (file: string) => parse(readFileSync(join(root, file), 'utf8')) as Record<string, unknown>;

// Ein Syntaxfehler in diesen Dateien lässt den Supervisor das Add-on im Store verschwinden,
// ohne dass Build oder Tests sonst etwas merken.
describe('Add-on-Dateien für Home Assistant', () => {
  it('config.yaml ist gültig und hat die Pflichtangaben', () => {
    const c = load('stups/config.yaml');
    expect(c.name).toBeTypeOf('string');
    expect(c.description).toBeTypeOf('string');
    expect(c.version).toMatch(/^\d+\.\d+\.\d+$/);
    // Der Slug bestimmt, wo Home Assistant die Daten ablegt: eine Änderung lässt alle Daten zurück
    expect(c.slug).toBe('stups');
    expect(c.arch).toEqual(['aarch64', 'amd64']);
    expect(c.ingress).toBe(true);
  });

  it('repository.yaml ist gültig', () => {
    const r = load('repository.yaml');
    expect(r.name).toBeTypeOf('string');
    expect(r.url).toMatch(/^https:\/\/github\.com\//);
  });

  it('die Übersetzung nennt nur Optionen, die es gibt', () => {
    const options = Object.keys(load('stups/config.yaml').schema as object);
    const translated = Object.keys((load('stups/translations/de.yaml').configuration ?? {}) as object);
    for (const key of translated) expect(options).toContain(key);
  });

  it('Englisch übersetzt genau dieselben Optionen wie Deutsch, mit Name und Beschreibung', () => {
    for (const app of ['stups', 'stups-beta']) {
      const de = (load(`${app}/translations/de.yaml`).configuration ?? {}) as Record<string, { name: string; description: string }>;
      const en = (load(`${app}/translations/en.yaml`).configuration ?? {}) as Record<string, { name: string; description: string }>;
      expect(Object.keys(en).sort(), app).toEqual(Object.keys(de).sort());
      for (const [key, v] of Object.entries(en)) {
        expect(v.name, `${app} ${key} name`).toBeTypeOf('string');
        expect(v.description, `${app} ${key} description`).toBeTypeOf('string');
        expect(v.name, `${app} ${key}`).not.toBe(de[key]!.name);
      }
    }
  });

  // Seit 1.41 übernimmt der erste Start diese Werte in die App; danach wirken sie nicht mehr (siehe addon-options.ts). Wer die Konfiguration öffnet, soll das sehen.
  it('die Optionen, die der erste Start in die App übernimmt, heißen „veraltet", log_level nicht', () => {
    for (const app of ['stups', 'stups-beta']) {
      for (const [lang, mark] of [['de', '(veraltet)'], ['en', '(deprecated)']] as const) {
        const cfg = (load(`${app}/translations/${lang}.yaml`).configuration ?? {}) as Record<string, { name: string; description: string }>;
        for (const key of ['users', 'access_mode', 'dashboard_path', 'daily_summary_time', 'overdue_nag_time']) {
          expect(cfg[key]!.name, `${app} ${lang} ${key}`).toContain(mark);
        }
        expect(cfg.log_level!.name, `${app} ${lang} log_level`).not.toContain(mark);
      }
    }
  });

  it('die normale App zeigt auf ihre eigenen Bilder, nie auf die der Beta', () => {
    const image = load('stups/config.yaml').image as string;
    expect(image).toBe('ghcr.io/arrestedops/ha-stups-{arch}');
    expect(image).not.toContain('beta');
  });
});

describe('Dockerfile', () => {
  const docker = readFileSync(join(root, 'stups/Dockerfile'), 'utf8');
  const runtime = docker.slice(docker.lastIndexOf('FROM '));

  it('das Laufzeit-Image bekommt die fertig installierten Pakete aus der Build-Stufe (pnpm deploy), ohne pnpm und ohne zweite Installation', () => {
    expect(docker).toContain('pnpm --filter @stups/server deploy --prod /prod');
    expect(runtime).toContain('COPY --from=build /prod/node_modules');
    expect(runtime).not.toMatch(/pnpm|npm install/);
  });

  it('der Aufbau im Image entspricht dem im Repository: web und public liegen neben dist', () => {
    const targets = runtime
      .split('\n')
      .filter((l) => l.startsWith('COPY '))
      .map((l) => l.trim().split(/\s+/).pop());
    for (const dir of ['dist', 'web', 'public', 'node_modules']) expect(targets, dir).toContain(dir);
    expect(runtime).toContain('CMD ["node", "dist/main.js"]');
  });
});

describe('Dokumentation auf Englisch und Deutsch', () => {
  const pairs: [string, string][] = [
    ['README.md', 'README.de.md'],
    ['stups/DOCS.md', 'stups/DOCS.de.md'],
    ['stups-beta/DOCS.md', 'stups-beta/DOCS.de.md'],
    ['stups/CHANGELOG.md', 'stups/CHANGELOG.de.md'],
    ['docs/docker.md', 'docs/docker.de.md'],
  ];
  const head = (f: string) => readFileSync(join(root, f), 'utf8').split('\n').slice(0, 12).join('\n');

  it('jede englische Datei verweist oben auf ihre deutsche und umgekehrt (die englische ist maßgeblich)', () => {
    for (const [en, de] of pairs) {
      expect(existsSync(join(root, en)), en).toBe(true);
      expect(existsSync(join(root, de)), de).toBe(true);
      expect(head(en), en).toContain(`(${de.split('/').pop()})`);
      expect(head(de), de).toContain(`(${en.split('/').pop()})`);
      expect(head(de), de).toContain('maßgeblich');
    }
  });

  it('die englischen Fassungen sind wirklich englisch (kein deutscher Fließtext geblieben)', () => {
    for (const [en] of pairs) {
      const text = readFileSync(join(root, en), 'utf8').replace(/```[\s\S]*?```/g, '');
      const german = text.match(/\b(und|oder|nicht|für|werden|wird|eine|einen|dein|deine|ist)\b/g) ?? [];
      expect(german.length, `${en}: ${german.slice(0, 5).join(',')}`).toBeLessThan(8);
    }
  });
});

describe('Aufbau des Repositorys', () => {
  it('docs/ enthält nur, was Nutzer lesen (Docker-Anleitung, Bilder); Unterlagen für die Entwicklung liegen in dev/', () => {
    expect(readdirSync(join(root, 'docs')).sort()).toEqual(['docker.de.md', 'docker.md', 'images']);
    for (const f of ['entwicklung.md', 'testliste.md', 'superpowers', 'onboarding', 'announcements', 'spike-ha-integration.md', 'logo.mjs']) {
      expect(existsSync(join(root, 'dev', f)), f).toBe(true);
    }
  });
});

describe('Changelog der normalen App', () => {
  const versions = (f: string) => [...readFileSync(join(root, f), 'utf8').matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]!);

  it('die englische Datei (der Update-Dialog zeigt sie) hat keine Version, die der deutschen fehlt, und beide beginnen mit derselben', () => {
    const en = versions('stups/CHANGELOG.md');
    const de = versions('stups/CHANGELOG.de.md');
    expect(en.length).toBeGreaterThan(5);
    for (const v of en) expect(de, v).toContain(v);
    expect(en[0]).toBe(de[0]);
  });

  it('jede Version steht nur noch in einer Sprache pro Datei (kein „English first, German version below“ mehr)', () => {
    for (const f of ['stups/CHANGELOG.md', 'stups/CHANGELOG.de.md']) {
      expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/English first, German version below|^\*\*Deutsch\*\*$/m);
    }
  });
});

describe('Add-on-Dateien der Beta', () => {
  const stable = () => load('stups/config.yaml');
  const beta = () => load('stups-beta/config.yaml');

  it('config.yaml ist gültig, hat einen festen eigenen Slug und eine Beta-Version', () => {
    const c = beta();
    // Zweite App im selben Repository: anderer Slug = eigenes /data. Der Slug darf sich nie ändern (die Daten blieben zurück).
    expect(c.slug).toBe('stups_beta');
    expect(c.slug).not.toBe(stable().slug);
    expect(c.name).toBe('Stups (Beta)');
    expect(c.description).toBeTypeOf('string');
    expect(c.version).toMatch(/^\d+\.\d+\.\d+-beta\.\d+$/);
    expect(c.arch).toEqual(stable().arch);
    expect(c.ingress).toBe(true);
    expect(c.ingress_port).toBe(stable().ingress_port);
  });

  // Beide Ordner liegen in beiden Branches; ohne stage zeigt der Store die Beta jedem, der das normale Repository einträgt.
  it('die Beta ist experimentell (nur im erweiterten Modus sichtbar), die normale App nicht', () => {
    expect(beta().stage).toBe('experimental');
    expect(stable().stage).toBeUndefined();
  });

  it('die Beta-Version kündigt die nächste normale Version an: gleiche oder höhere Version als die normale App', () => {
    const num = (v: string) => v.split('-')[0]!.split('.').map(Number) as [number, number, number];
    const [bMaj, bMin, bPat] = num(String(beta().version));
    const [sMaj, sMin, sPat] = num(String(stable().version));
    // Basis der Beta >= normale Version (nach der Veröffentlichung sind sie gleich, bis die nächste Beta beginnt)
    expect(bMaj * 1e6 + bMin * 1e3 + bPat).toBeGreaterThanOrEqual(sMaj * 1e6 + sMin * 1e3 + sPat);
  });

  it('eigene Bilder: ha-stups-beta-{arch}, nie die der normalen App', () => {
    expect(beta().image).toBe('ghcr.io/arrestedops/ha-stups-beta-{arch}');
    expect(beta().image).not.toBe(stable().image);
  });

  it('eigenes Panel in der Seitenleiste, damit man die beiden Apps unterscheidet', () => {
    expect(beta().panel_title).toBe('Stups Beta');
    expect(beta().panel_title).not.toBe(stable().panel_title);
    expect(beta().panel_icon).toBeTypeOf('string');
    expect(beta().panel_icon).not.toBe(stable().panel_icon);
  });

  it('dieselben Optionen und Rechte wie die normale App (sie läuft mit demselben Code)', () => {
    for (const key of ['options', 'schema', 'map', 'homeassistant_api', 'init', 'startup', 'boot', 'panel_admin', 'ingress_port']) {
      expect(beta()[key], key).toEqual(stable()[key]);
    }
  });

  it('die Übersetzung stimmt mit der normalen App überein', () => {
    expect(load('stups-beta/translations/de.yaml')).toEqual(load('stups/translations/de.yaml'));
    expect(load('stups-beta/translations/en.yaml')).toEqual(load('stups/translations/en.yaml'));
  });

  it('alle Dateien sind da: Symbol, Logo, Dokumentation, Changelog', () => {
    for (const f of ['icon.png', 'logo.png', 'DOCS.md', 'CHANGELOG.md', 'translations/de.yaml', 'translations/en.yaml']) {
      expect(existsSync(join(root, 'stups-beta', f)), f).toBe(true);
    }
  });

  it('die Beta liegt nicht hinter derselben Version wie die normale App fest: Beta-Version gehört zur kommenden oder aktuellen Version', () => {
    const [bMaj, bMin] = String(beta().version).split('-')[0]!.split('.').map(Number) as [number, number];
    const [sMaj, sMin] = String(stable().version).split('.').map(Number) as [number, number];
    expect(bMaj * 1000 + bMin).toBeGreaterThanOrEqual(sMaj * 1000 + sMin);
  });
});
