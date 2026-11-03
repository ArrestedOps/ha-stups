import { describe, expect, it } from 'vitest';
import { parseRecurrence } from '../src/store/validate.js';
import { BUILTIN_TEMPLATES, CATEGORY_COLOR_NAMES, resolveTemplate, type Lang } from '../src/templates.js';

const LANGS: Lang[] = ['de', 'en'];

describe('Eingebaute Vorlagen', () => {
  it('es gibt die sechs vorgesehenen', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.id)).toEqual(['household', 'move', 'renovation', 'packing', 'baby', 'ideas']);
  });

  it.each(BUILTIN_TEMPLATES.map((t) => [t.id, t] as const))('%s: Name und Beschreibung in beiden Sprachen', (_id, tpl) => {
    for (const lang of LANGS) {
      expect(tpl.name[lang].trim(), `${lang} Name`).not.toBe('');
      expect(tpl.description[lang].trim(), `${lang} Beschreibung`).not.toBe('');
    }
    expect(tpl.name.de).not.toBe(tpl.name.en); // wirklich übersetzt
  });

  describe.each(BUILTIN_TEMPLATES.flatMap((t) => LANGS.map((lang) => [t.id, lang, resolveTemplate(t, lang)] as const)))('%s auf %s', (_id, _lang, data) => {
    it('Spalten: die erste ist offen, genau eine ist „erledigt", höchstens eine „geplant", Namen verschieden', () => {
      expect(data.columns.length).toBeGreaterThanOrEqual(2);
      expect(data.columns[0]).toMatchObject({ done: false, planned: false });
      expect(data.columns.filter((c) => c.done)).toHaveLength(1);
      expect(data.columns.filter((c) => c.planned).length).toBeLessThanOrEqual(1);
      expect(data.columns.some((c) => c.done && c.planned)).toBe(false);
      expect(new Set(data.columns.map((c) => c.name)).size).toBe(data.columns.length);
      for (const c of data.columns) expect(c.name.trim()).not.toBe('');
    });

    it('Kategorien: gültige Farben, verschiedene Namen', () => {
      for (const cat of data.categories) {
        expect(CATEGORY_COLOR_NAMES, cat.name).toContain(cat.color);
        expect(cat.name.trim()).not.toBe('');
      }
      expect(new Set(data.categories.map((c) => c.name)).size).toBe(data.categories.length);
    });

    it('Karten: Titel, gültige Verweise, nicht in der Erledigt-Spalte, Termin nur als Tage, Wiederholung nur mit Termin', () => {
      expect(data.cards.length).toBeGreaterThanOrEqual(3);
      for (const card of data.cards) {
        expect(card.title.trim(), 'Titel').not.toBe('');
        expect(card.title.length).toBeLessThanOrEqual(200);
        expect(card.column).toBeGreaterThanOrEqual(0);
        expect(card.column).toBeLessThan(data.columns.length);
        expect(data.columns[card.column]!.done, `${card.title}: Spalte erledigt`).toBe(false);
        for (const i of card.categories) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(data.categories.length);
        }
        if (card.dueInDays !== null) {
          expect(Number.isInteger(card.dueInDays), card.title).toBe(true);
          expect(card.dueInDays).toBeGreaterThanOrEqual(0);
          expect(card.dueInDays).toBeLessThanOrEqual(365);
        }
        if (card.recurrence) {
          expect(card.dueInDays, `${card.title}: Wiederholung braucht einen Termin`).not.toBeNull();
          expect(() => parseRecurrence(card.recurrence), card.title).not.toThrow();
        }
        if (card.priority) expect(['low', 'medium', 'high']).toContain(card.priority);
        if (card.effort) expect(['small', 'medium', 'large']).toContain(card.effort);
        for (const item of card.checklist) expect(item.trim()).not.toBe('');
      }
    });
  });

  it('„Haushalt" bringt wiederkehrende Aufgaben mit', () => {
    const household = resolveTemplate(BUILTIN_TEMPLATES.find((t) => t.id === 'household')!, 'de');
    expect(household.cards.filter((c) => c.recurrence).length).toBeGreaterThanOrEqual(4);
  });

  it('die Sprache bestimmt die Texte', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === 'household')!;
    expect(resolveTemplate(t, 'de').columns[0]!.name).toBe('Offen');
    expect(resolveTemplate(t, 'en').columns[0]!.name).toBe('Open');
  });
});
