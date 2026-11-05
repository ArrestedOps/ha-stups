/** Rechenlogik für „Warum kommt nichts?": wie viele Geräte einer Person erreichbar sind und ob gerade Ruhezeit ist */

export interface StandPerson {
  services: { service: string; exists: boolean | null }[];
  /** ntfy-Thema eingetragen (undefined: es gibt kein ntfy) */
  ntfy?: boolean;
}

/** „mobile_app_annas_iphone" → „Annas iphone" */
export function deviceName(service: string): string {
  const s = service.replace(/^notify\./, '').replace(/^mobile_app_/, '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : service;
}

export interface Reach {
  /** erreichbare Geräte (Dienste, die es in Home Assistant gibt oder deren Stand unbekannt ist, dazu ein ntfy-Thema) */
  ok: number;
  /** alle eingetragenen Geräte */
  total: number;
  /** Dienste, die Home Assistant nicht kennt */
  missing: string[];
}

export function reach(p: StandPerson): Reach {
  const missing = p.services.filter((s) => s.exists === false).map((s) => s.service);
  const ntfy = p.ntfy ? 1 : 0;
  return { ok: p.services.length - missing.length + ntfy, total: p.services.length + ntfy, missing };
}

const minutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Ist zu dieser Uhrzeit (Minuten seit Mitternacht, Ortszeit) Ruhezeit? Sie darf über Mitternacht gehen („22:00" bis „07:00"). */
export function quietNow(q: { start: string; end: string; off: boolean }, nowMinutes: number): boolean {
  if (q.off) return false;
  const a = minutes(q.start);
  const b = minutes(q.end);
  if (a === b) return false;
  return a < b ? nowMinutes >= a && nowMinutes < b : nowMinutes >= a || nowMinutes < b;
}
