import { describe, expect, it } from 'vitest';
import { MAJOR_IDS, MINOR_IDS } from '../src/data/factions';
import { LEADERS } from '../src/data/leaders';
import { lore } from '../src/ui/lore';

describe('faction guide lore (docs/LORE.md)', () => {
  const l = lore();

  it('has the Meridian Reach sections', () => {
    const titles = l.reach.map((s) => s.title);
    expect(titles).toContain('The Quieting');
    expect(titles).toContain('The Severance (3410)');
    expect(l.reach.every((s) => s.blocks.length > 0)).toBe(true);
  });

  it('has every great power, with a tagline, story, appearance, views and a bio for each leader', () => {
    for (const id of MAJOR_IDS) {
      const m = l.majors[id];
      expect(m, id).toBeTruthy();
      expect(m.tagline).toMatch(/^Home: /);
      expect(m.paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(m.appearance.length).toBeGreaterThan(10);
      expect(m.views).toHaveLength(4);
      for (const leader of LEADERS[id]) expect(m.leaders[leader.name], `${id} ${leader.name}`).toBeTruthy();
    }
  });

  it('has a paragraph for every minor faction', () => {
    for (const id of MINOR_IDS) expect(l.minors[id]?.length ?? 0, id).toBeGreaterThan(100);
  });
});
