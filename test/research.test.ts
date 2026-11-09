import { DESIGNS } from '../src/data/designs';
import { IMPROVEMENTS } from '../src/data/improvements';
import { CLASSES } from '../src/data/ships';
import { TECH_BY_ID, TECHS } from '../src/data/techs';
import { factionIncome } from '../src/engine/economy';
import { resetMovement } from '../src/engine/movement';
import { advanceResearch, availableTechs, canResearch, completedFields, grantTech, setResearch, techCost, techEffects } from '../src/engine/research';
import { createGame } from '../src/engine/setup';
import { emptyHex, firstDesign, fleetOf, newGame } from './helpers';

describe('tech tree', () => {
  it('has ~48 techs with valid prerequisites', () => {
    expect(TECHS.length).toBeGreaterThanOrEqual(45);
    for (const t of TECHS) {
      for (const r of t.requires) {
        expect(TECH_BY_ID[r], `${t.id} needs ${r}`).toBeDefined();
        expect(TECH_BY_ID[r].tier, `${t.id}`).toBeLessThan(t.tier);
      }
    }
  });

  it('every tech referenced by ships and improvements exists', () => {
    for (const c of Object.values(CLASSES)) if (c.tech) expect(TECH_BY_ID[c.tech]).toBeDefined();
    for (const i of Object.values(IMPROVEMENTS)) if (i.tech) expect(TECH_BY_ID[i.tech]).toBeDefined();
    for (const id of ['starbase1', 'starbase2', 'starbase3']) expect(TECH_BY_ID[id]).toBeDefined();
  });

  it('every tech is reachable', () => {
    const g = newGame();
    for (let i = 0; i < 200; i++) {
      const next = availableTechs(g, 'concord');
      if (next.length === 0) break;
      for (const t of next) grantTech(g, 'concord', t);
    }
    expect(g.factions.concord.research.known.length).toBe(TECHS.length);
    expect(completedFields(g, 'concord')).toHaveLength(6);
  });
});

describe('research', () => {
  it('completes the current project when science is banked', () => {
    const g = newGame();
    expect(canResearch(g, 'concord', 'hull2')).toBe(false);
    expect(setResearch(g, 'concord', 'starbase1')).toBe(true);
    g.factions.concord.research.progress = techCost('starbase1') + 5;
    expect(advanceResearch(g, 'concord')).toEqual(['starbase1']);
    expect(g.factions.concord.research.progress).toBeCloseTo(5);
    expect(canResearch(g, 'concord', 'hull2')).toBe(true);
    expect(g.factions.concord.research.current).toBeNull();
  });

  it('tech effects reach movement and the economy', () => {
    const g = newGame();
    const hex = emptyHex(g);
    const frig = fleetOf(g, 'concord', firstDesign('concord', (d) => d.cls === 'frigate' && d.role === 'line'), hex);
    const cruiser = fleetOf(g, 'concord', firstDesign('concord', (d) => d.cls === 'heavyCruiser'), hex);
    resetMovement(g, 'concord');
    const f0 = g.fleets[frig].movesLeft, c0 = g.fleets[cruiser].movesLeft;
    grantTech(g, 'concord', 'ionDrives');
    resetMovement(g, 'concord');
    expect(g.fleets[frig].movesLeft).toBe(f0 + 1);
    expect(g.fleets[cruiser].movesLeft).toBe(c0);
    const e0 = factionIncome(g, 'concord').gross.energy;
    grantTech(g, 'concord', 'commerce');
    expect(factionIncome(g, 'concord').gross.energy).toBeGreaterThan(e0);
    grantTech(g, 'concord', 'lasers');
    expect(techEffects(g, 'concord').energyWeapons).toBeCloseTo(0.1);
  });

  it('the Aurelian Republic starts with 3 techs', () => {
    const g = createGame({ seed: 'aur', seats: [{ faction: 'concord', name: 'A' }], minors: ['aurelian', 'myrr', 'quorr', 'ixxi', 'nhar', 'tal', 'skarn', 'cryx', 'zenith', 'echo'] });
    expect(g.factions.aurelian.research.known).toHaveLength(3);
    void DESIGNS;
  });
});
