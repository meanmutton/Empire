import { describe, expect, it } from 'vitest';
import { FACTIONS, MAJOR_IDS, MINOR_IDS } from '../src/data/factions';
import { cargoShips, saleLines } from '../src/ui/trade-text';

describe('faction guide trade text', () => {
  it('lists what every minor sells, with the ships it would be', () => {
    for (const id of MINOR_IDS) {
      const lines = saleLines(id);
      expect(lines.length, id).toBeGreaterThan(0);
      for (const l of lines) {
        expect(l.what.length, id).toBeGreaterThan(0);
        if (l.what.includes('Vessel') || l.what.includes('Ship') || l.ships.length) expect(l.ships.length, `${id} ${l.what}`).toBeGreaterThan(0);
      }
    }
  });

  it('says what a minor needs from the buyer where it asks for something', () => {
    expect(saleLines('ixxi')[0].needs).toMatch(/alliance/);
    expect(saleLines('thessic').every((l) => l.needs === null)).toBe(true);
    expect(saleLines('nhar').some((l) => l.what === 'Spy' && /embassy/.test(l.needs ?? ''))).toBe(true);
  });

  it('great powers sell nothing on the market, but every faction has a cargo ship', () => {
    for (const id of MAJOR_IDS) expect(saleLines(id)).toEqual([]);
    for (const f of FACTIONS) expect(cargoShips(f.id).length, f.id).toBeGreaterThan(0);
  });
});
