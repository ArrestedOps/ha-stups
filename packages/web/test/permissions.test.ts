import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import PermissionToggles from '../src/components/PermissionToggles.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { mayDo, PERMISSION_KEYS, permissionRows, type Permission } from '../src/lib/permissions';

beforeEach(() => setLanguage('de'));

describe('Liste der Berechtigungen (Oberfläche und Server stimmen überein)', () => {
  it('dieselben Schlüssel in derselben Reihenfolge wie server/src/permissions.ts', () => {
    const src = readFileSync(new URL('../../server/src/permissions.ts', import.meta.url), 'utf8');
    const block = /export const PERMISSIONS = \[([\s\S]*?)\] as const;/.exec(src)![1]!;
    const keys = [...block.matchAll(/^\s*'([a-z]+)',/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect([...PERMISSION_KEYS]).toEqual(keys);
  });

  it('jede Berechtigung hat Titel und Erklärung, in Deutsch und Englisch verschieden', () => {
    const de = permissionRows();
    expect(de.map((r) => r.key)).toEqual([...PERMISSION_KEYS]);
    for (const r of de) {
      expect(r.title.length, r.key).toBeGreaterThan(2);
      expect(r.hint.length, r.key).toBeGreaterThan(10);
    }
    setLanguage('en');
    const en = permissionRows();
    for (const [i, r] of en.entries()) {
      expect(r.title, r.key).not.toBe(de[i]!.title);
      expect(r.hint, r.key).not.toBe(de[i]!.hint);
    }
  });

  it('die Erklärung der App-Einstellungen sagt ausdrücklich, was nicht dazugehört (Dashboard und Panel-Pfad)', () => {
    const hint = permissionRows().find((r) => r.key === 'settings')!.hint;
    expect(hint).toMatch(/Dashboard/);
    expect(hint).toMatch(/Panel/);
  });
});

describe('mayDo: darf diese Person das?', () => {
  const member = (permissions: Permission[]) => ({ isAdmin: false, isChild: false, permissions });

  it('Administrator immer', () => {
    for (const k of PERMISSION_KEYS) expect(mayDo({ isAdmin: true, isChild: false, permissions: [] }, k)).toBe(true);
  });

  it('Mitglied nach Liste', () => {
    expect(mayDo(member(['watchers']), 'watchers')).toBe(true);
    expect(mayDo(member(['watchers']), 'house')).toBe(false);
    expect(mayDo(member([]), 'people')).toBe(false);
  });

  it('Kind nie, auch wenn die Liste etwas enthielte (oder es als Administrator eingetragen ist)', () => {
    expect(mayDo({ isAdmin: false, isChild: true, permissions: ['watchers'] }, 'watchers')).toBe(false);
    expect(mayDo({ isAdmin: true, isChild: true, permissions: [] }, 'watchers')).toBe(false);
  });
});

describe('Schalter für die Berechtigungen einer Person', () => {
  const person = (over: Record<string, unknown> = {}) => ({ id: 'p1', displayName: 'Anna', isAdmin: false, isChild: false, permissions: ['watchers'] as Permission[], ...over });
  const html = (props: Record<string, unknown>) => render(PermissionToggles, { props: { person: person(), busy: false, onchange: () => undefined, ...props } }).body;
  const count = (s: string, needle: string) => s.split(needle).length - 1;

  it('ein Schalter je Berechtigung, mit Erklärung und dem Zustand der Person', () => {
    const out = html({});
    expect(out).toContain('data-testid="permissions-p1"');
    expect(count(out, 'role="switch"')).toBe(PERMISSION_KEYS.length);
    for (const r of permissionRows()) {
      expect(out, r.key).toContain(r.title);
      expect(out, r.key).toContain(r.hint);
      expect(out, r.key).toContain(`data-testid="permission-${r.key}"`);
    }
    // genau ein Schalter ist an (watchers)
    expect(count(out, 'aria-checked="true"')).toBe(1);
    expect(out).toMatch(/aria-checked="true"[^>]*aria-label="[^"]*Wächter[^"]*Anna|aria-label="[^"]*Wächter[^"]*Anna[^"]*"[^>]*aria-checked="true"|aria-label="[^"]*Anna[^"]*"[^>]*aria-checked="true"/);
  });

  it('jeder Schalter nennt die Person (Screenreader)', () => {
    const labels = [...html({}).matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(PERMISSION_KEYS.length);
    for (const l of labels) expect(l).toContain('Anna');
  });

  it('Administrator: kein Schalter, nur der Hinweis „Administratoren dürfen alles"', () => {
    const out = html({ person: person({ isAdmin: true, permissions: [] }) });
    expect(count(out, 'role="switch"')).toBe(0);
    expect(out).toContain('Administratoren dürfen alles');
  });

  it('Kind: gar nichts (Kinder bleiben bei ihrer festen Einschränkung)', () => {
    const out = html({ person: person({ isChild: true, permissions: [] }) });
    expect(count(out, 'role="switch"')).toBe(0);
    expect(out).not.toContain('permissions-p1');
    expect(out).not.toContain('Administratoren dürfen alles');
  });

  it('beschäftigt: alle Schalter gesperrt', () => {
    const out = html({ busy: true });
    expect(count(out, 'disabled')).toBeGreaterThanOrEqual(PERMISSION_KEYS.length);
  });

  it('Englisch', () => {
    setLanguage('en');
    const out = html({ person: person({ isAdmin: true, permissions: [] }) });
    expect(out).toContain('Administrators may do everything');
  });
});
