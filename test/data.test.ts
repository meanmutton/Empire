import { ABILITIES } from '../src/data/abilities';
import { combatValue, DESIGNS, DESIGNS_BY_FACTION } from '../src/data/designs';
import { FACTIONS, MAJOR_IDS, MINOR_IDS, parseRosterEntry } from '../src/data/factions';
import { CLASSES, ROLES, SHIP_CLASSES } from '../src/data/ships';
import { IMPROVEMENTS } from '../src/data/improvements';

describe('faction data', () => {
  it('has 5 majors and 30 minors with unique ids and colors', () => {
    expect(MAJOR_IDS).toHaveLength(5);
    expect(MINOR_IDS).toHaveLength(30);
    expect(new Set(FACTIONS.map((f) => f.id)).size).toBe(35);
    expect(new Set(FACTIONS.map((f) => f.color.toLowerCase())).size).toBe(35);
  });

  it('gives majors 3 abilities and minors 1–2, all defined', () => {
    for (const f of FACTIONS) {
      if (f.kind === 'major') expect(f.abilities).toHaveLength(3);
      else {
        expect(f.abilities.length).toBeGreaterThanOrEqual(1);
        expect(f.abilities.length).toBeLessThanOrEqual(2);
      }
      for (const a of f.abilities) expect(ABILITIES[a]).toBeDefined();
    }
  });

  it('has valid rosters', () => {
    for (const f of FACTIONS) {
      for (const entry of f.roster) {
        const { cls, role, name } = parseRosterEntry(entry);
        expect(CLASSES[cls], `${f.id} ${entry}`).toBeDefined();
        expect(ROLES[role], `${f.id} ${entry}`).toBeDefined();
        expect(name.length).toBeGreaterThan(0);
      }
      expect(DESIGNS_BY_FACTION[f.id].some((d) => d.role === 'constructor')).toBe(true);
    }
  });

  it('majors have enough system names and a colony ship', () => {
    for (const id of MAJOR_IDS) {
      const f = FACTIONS.find((x) => x.id === id)!;
      expect(f.systemNames.length).toBeGreaterThanOrEqual(10);
      expect(DESIGNS_BY_FACTION[id].some((d) => d.role === 'colony')).toBe(true);
      expect(DESIGNS_BY_FACTION[id].some((d) => d.role === 'scout')).toBe(true);
    }
  });

  it('respects the design doc roster gaps', () => {
    const classes = (id: string) => new Set(DESIGNS_BY_FACTION[id].map((d) => d.cls));
    const roles = (id: string) => new Set(DESIGNS_BY_FACTION[id].map((d) => d.role));
    expect(classes('concord').has('dreadnaught')).toBe(false);
    expect(roles('rynkai').has('science')).toBe(false);
    expect(classes('krasnyr').has('battleCruiser')).toBe(false);
    for (const id of MAJOR_IDS) expect(classes(id).size).toBeGreaterThanOrEqual(9);
  });
});

describe('ship designs', () => {
  it('have sane stats', () => {
    for (const d of Object.values(DESIGNS)) {
      expect(d.stats.hull, d.id).toBeGreaterThan(0);
      if (d.cls !== 'fighter') expect(d.stats.speed, d.id).toBeGreaterThanOrEqual(1);
      expect(d.cost.metals, d.id).toBeGreaterThan(0);
    }
  });

  it('carriers have hangars and warships have weapons', () => {
    for (const d of Object.values(DESIGNS)) {
      if (d.role === 'carrier') expect(d.stats.hangar, d.id).toBeGreaterThan(0);
      if (d.role === 'line') expect(d.stats.energy + d.stats.missile, d.id).toBeGreaterThan(0);
    }
  });

  it('bigger line ships are stronger', () => {
    const values = SHIP_CLASSES.filter((c) => c !== 'fighter').map((c) => {
      const d = Object.values(DESIGNS).find((x) => x.faction === 'lattice' && x.cls === c && x.role === 'line');
      return d ? combatValue(d) : null;
    }).filter((v): v is number => v !== null);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('applies faction modifiers', () => {
    const ryn = DESIGNS['rynkai:kaithar'];
    const lat = DESIGNS['lattice:tensor'];
    expect(ryn.stats.energy + ryn.stats.missile).toBeGreaterThan(lat.stats.energy + lat.stats.missile);
    expect(DESIGNS['nhar:veil'].stats.stealth).toBeGreaterThan(0);
  });
});

describe('improvements', () => {
  it('all have costs and valid levels', () => {
    for (const [id, imp] of Object.entries(IMPROVEMENTS)) {
      expect(imp.buildPoints, id).toBeGreaterThan(0);
      expect(imp.minLevel, id).toBeGreaterThanOrEqual(1);
      expect(imp.minLevel, id).toBeLessThanOrEqual(5);
    }
  });
});
