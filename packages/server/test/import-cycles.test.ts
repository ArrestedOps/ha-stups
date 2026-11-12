import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packages = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = /\.(ts|svelte|js)$/;
const norm = (p: string) => resolve(p).replaceAll('\\', '/');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : SOURCE.test(e.name) ? [norm(join(dir, e.name))] : [],
  );
}

// Ein Import zählt nur zur Laufzeit, wenn er nicht komplett als Typ markiert ist
function isTypeOnly(clause: string): boolean {
  const c = clause.trim();
  if (c.startsWith('type ')) return true;
  const named = /^\{([^}]*)\}$/.exec(c);
  const specs = named ? named[1]!.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return specs.length > 0 && specs.every((s) => s.startsWith('type '));
}

function specifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found: string[] = [];
  for (const m of code.matchAll(/\b(?:import|export)\s+([^'";]*?)\s*from\s*['"](\.[^'"]+)['"]/g)) {
    if (!isTypeOnly(m[1]!)) found.push(m[2]!);
  }
  for (const m of code.matchAll(/\bimport\s*['"](\.[^'"]+)['"]/g)) found.push(m[1]!);
  for (const m of code.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) found.push(m[1]!);
  return found;
}

function buildGraph(srcDir: string): Map<string, string[]> {
  const files = listFiles(srcDir);
  const known = new Set(files);
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const targets = new Set<string>();
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      const base = norm(join(dirname(file), spec));
      const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.svelte.ts`, `${base}.svelte`, `${base}/index.ts`];
      const hit = candidates.find((c) => known.has(c));
      if (hit) targets.add(hit);
    }
    graph.set(file, [...targets]);
  }
  return graph;
}

// Tarjan: Zyklen sind stark zusammenhängende Komponenten mit mehr als einem Knoten (oder Selbstkante)
function findCycles(graph: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  const visit = (v: string) => {
    index.set(v, index.size);
    low.set(v, index.get(v)!);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1 || graph.get(v)?.includes(v)) cycles.push(component.sort());
    }
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return cycles;
}

// Typ-Zyklen sind gewollt (store/internals.ts); Laufzeit-Zyklen machen Importreihenfolge und Initialisierung brüchig
describe('Laufzeit-Importzyklen', () => {
  for (const pkg of ['server', 'web']) {
    it(`${pkg}: keine Zyklen unter src`, () => {
      const srcDir = join(packages, pkg, 'src');
      expect(existsSync(srcDir)).toBe(true);
      const graph = buildGraph(srcDir);
      const edges = [...graph.values()].reduce((n, t) => n + t.length, 0);
      // Leerlauf-Schutz: ein kaputter Parser findet sonst keine Zyklen, weil er nichts findet
      expect(graph.size).toBeGreaterThanOrEqual(50);
      expect(edges).toBeGreaterThanOrEqual(100);
      const rel = (f: string) => relative(norm(srcDir), f).replaceAll('\\', '/');
      const report = findCycles(graph).map((c) => c.map(rel).join(' <-> '));
      expect(report, `Zyklen:\n${report.join('\n')}`).toEqual([]);
    });
  }

  it('die Zyklensuche findet a -> b -> a und lässt c allein', () => {
    const graph = new Map([['a', ['b']], ['b', ['a']], ['c', []]]);
    expect(findCycles(graph)).toEqual([['a', 'b']]);
  });
});
