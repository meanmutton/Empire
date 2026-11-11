import { describe, expect, it } from 'vitest';
import { IMPROVEMENTS } from '../src/data/improvements';
import { ICONS } from '../src/ui/icons';

describe('icon set', () => {
  it('has an icon for every improvement, resource and kind of build', () => {
    for (const id of Object.keys(IMPROVEMENTS)) expect(ICONS[`imp:${id}`], id).toBeTruthy();
    for (const r of ['energy', 'metals', 'science', 'exotics', 'population', 'production']) expect(ICONS[`res:${r}`], r).toBeTruthy();
    for (const k of ['ship', 'develop', 'army', 'diplomat', 'spy', 'wonder']) expect(ICONS[`queue:${k}`], k).toBeTruthy();
  });

  it('every drawing is SVG markup with a colour', () => {
    for (const [k, v] of Object.entries(ICONS)) {
      expect(v.svg, k).toMatch(/^<(path|circle|rect|ellipse)/);
      expect(v.color, k).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
