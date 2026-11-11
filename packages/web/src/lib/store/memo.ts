// ---------- lokale Merkzettel (können im iframe blockiert sein) ----------

export const memo = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* egal */
    }
  },
};
