import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { crestSvg } from '../src/ui/crests';
import { GLYPHS } from '../src/ui/glyphs';

describe('faction emblems', () => {
  it('every faction has its own glyph', () => {
    for (const f of FACTIONS) expect(GLYPHS[f.id], f.id).toBeTruthy();
    expect(new Set(FACTIONS.map((f) => GLYPHS[f.id])).size).toBe(FACTIONS.length);
  });

  it('glyph paths stay inside their 20×20 box and contain no bad numbers', () => {
    for (const f of FACTIONS) {
      const d = GLYPHS[f.id];
      expect(d, f.id).not.toMatch(/NaN|undefined/);
      // Absolute coordinates only (arcs use relative ones, checked through their start points).
      for (const n of d.replace(/a[^A-Za-z]*/g, '').match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number(n), `${f.id} ${n}`).toBeGreaterThanOrEqual(-0.01);
        expect(Number(n), `${f.id} ${n}`).toBeLessThanOrEqual(20.01);
      }
    }
  });

  it('every faction has a crest', () => {
    for (const f of FACTIONS) {
      const svg = crestSvg(f.id);
      expect(svg, f.id).toMatch(/^<svg [^>]*viewBox="0 0 64 64">/);
      expect(svg, f.id).not.toMatch(/NaN|undefined/);
    }
  });
});
