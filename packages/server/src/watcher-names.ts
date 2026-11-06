import { containsDevice, deviceLabel, withDevice } from './device-names.js';
import { withLanguage } from './i18n/index.js';
import { watcherTemplates } from './watcher-templates.js';

/**
 * Wächter aus Vorlagen heißen alle gleich ("Batterie schwach" mal zehn). Diese Hinweise sagen, um welches Gerät es geht
 * und wie ein Name mit Gerät aussähe, ohne etwas umzubenennen: das entscheidet der Mensch (Editor, Sammelknopf).
 */
export interface NameHints {
  /** Friendly Name der beobachteten Entität, ohne ihn die Entitäts-ID (immer gesetzt) */
  subject: string;
  /** Kurzer Gerätename ("iPhone Rene" statt "iPhone Rene Battery Level") */
  deviceLabel: string;
  /** Der Name des Wächters nennt das Gerät schon */
  nameHasDevice: boolean;
  /** Der Name entspricht genau dem einer Vorlage (deutsch oder englisch): er wurde nie angepasst */
  defaultName: boolean;
  /** So hieße der Wächter mit Gerät; null: nichts zu ergänzen oder die Entität ist unbekannt (nie ein Name aus der Entitäts-ID bei fehlender Verbindung) */
  suggestedName: string | null;
  /** Dasselbe für den Kartentitel, nur wenn er noch der der Vorlage ist */
  suggestedTitle: string | null;
}

/** Namen und Kartentitel der Vorlagen in beiden Sprachen: ein Wächter, der in der anderen Sprache angelegt wurde, zählt genauso */
export interface TemplateDefaults {
  names: Set<string>;
  titles: Set<string>;
}

const key = (s: string): string => s.trim().toLowerCase();

export function templateDefaults(): TemplateDefaults {
  const names = new Set<string>();
  const titles = new Set<string>();
  for (const lang of ['de', 'en'] as const) {
    for (const tpl of withLanguage(lang, () => watcherTemplates())) {
      if (!tpl.draft) continue;
      names.add(key(tpl.draft.name));
      titles.add(key(tpl.draft.card.title));
    }
  }
  return { names, titles };
}

export function nameHints(
  w: { name: string; card: { title: string }; trigger: { entityId: string } },
  seen: { name?: string } | null,
  defaults: TemplateDefaults,
): NameHints {
  const entityId = w.trigger.entityId;
  const subject = seen?.name?.trim() || entityId;
  const label = deviceLabel(seen?.name, entityId);
  const nameHasDevice = containsDevice(w.name, label);
  const defaultName = defaults.names.has(key(w.name));
  const known = seen !== null;
  const name = known && !nameHasDevice ? withDevice(w.name, label) : w.name;
  const title = known && defaults.titles.has(key(w.card.title)) ? withDevice(w.card.title, label, 200) : w.card.title;
  return {
    subject,
    deviceLabel: label,
    nameHasDevice,
    defaultName,
    suggestedName: name !== w.name ? name : null,
    suggestedTitle: title !== w.card.title ? title : null,
  };
}
