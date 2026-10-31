import { describe, expect, it } from 'vitest';
import { fitWithin, formatBytes, MAX_UPLOAD_BYTES, uploadProblem } from '../src/lib/image';

describe('fitWithin', () => {
  it('verkleinert die lange Kante auf das Maximum und behält das Seitenverhältnis', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('vergrößert nie', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2048, 100, 2048)).toEqual({ width: 2048, height: 100 });
  });

  it('liefert mindestens 1 Pixel', () => {
    expect(fitWithin(10000, 1, 320)).toEqual({ width: 320, height: 1 });
  });
});

describe('uploadProblem', () => {
  const file = (type: string, size: number) => ({ type, size, name: 'x' }) as File;

  it('erlaubt Bilder und PDF bis 20 MB', () => {
    expect(uploadProblem(file('image/jpeg', 5_000_000))).toBeNull();
    expect(uploadProblem(file('image/heic', 5_000_000))).toBeNull();
    expect(uploadProblem(file('application/pdf', MAX_UPLOAD_BYTES))).toBeNull();
  });

  it('lehnt andere Typen und zu große PDFs ab', () => {
    expect(uploadProblem(file('text/html', 100))).toMatch(/Bilder und PDF/);
    expect(uploadProblem(file('application/pdf', MAX_UPLOAD_BYTES + 1))).toMatch(/20 MB/);
  });

  it('große Bilder sind kein Problem, sie werden verkleinert', () => {
    expect(uploadProblem(file('image/jpeg', 40_000_000))).toBeNull();
  });
});

describe('formatBytes', () => {
  it('schreibt Größen lesbar', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5_500_000)).toBe('5,2 MB');
  });
});
