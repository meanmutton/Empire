import { DESIGNS } from '../src/data/designs';
import { gloriousWinsNeeded, VICTORY_IDS } from '../src/data/victories';
import { resolveBattleAt } from '../src/engine/combat';
import { relationKey } from '../src/engine/ids';
import { seedRng } from '../src/engine/rng';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';
import { availableVictories, checkVictory, progress, runCouncil } from '../src/engine/victory';
import { grantTech } from '../src/engine/research';
import { TECHS } from '../src/data/techs';
import { emptyHex, fleetOf, newGame, setStatus } from './helpers';

const majors = ['concord', 'rynkai', 'varrhen', 'krasnyr', 'lattice'];
function holdHomes(g: GameState, by: string, n = 99) {
  let k = 0;
  for (const m of majors) if (m !== by && k < n) { g.map.hexes[g.factions[m].home].owner = by; k++; }
}

describe('who can win how', () => {
  it('matches the agreed table, with one unique victory each', () => {
    const g = newGame('vic');
    expect(availableVictories(g, 'concord')).not.toContain('conquest');
    expect(availableVictories(g, 'rynkai')).toEqual(['conquest', 'gloriousCampaign', 'score']);
    expect(availableVictories(g, 'krasnyr')).toContain('economicSupremacy');
    const uniques: Record<string, string> = { concord: 'ascendance', rynkai: 'gloriousCampaign', varrhen: 'hegemony', krasnyr: 'worldRevolution', lattice: 'singularity' };
    for (const [f, v] of Object.entries(uniques)) {
      expect(availableVictories(g, f)).toContain(v);
      for (const o of majors) if (o !== f) expect(availableVictories(g, o)).not.toContain(v);
    }
    expect(availableVictories(g, 'myrr')).toEqual([]);
    for (const m of majors) expect(availableVictories(g, m)).toContain('score');
  });

  it('presets: Peaceful has no Ryn\'kai and no military wins; Total War lets the Concord conquer', () => {
    const p = createGame({ seed: 'peace', seats: [{ faction: 'concord', name: 'A' }], preset: 'peaceful' });
    expect(p.factions.rynkai).toBeUndefined();
    expect(Object.values(p.factions).filter((f) => f.kind === 'major')).toHaveLength(4);
    for (const m of p.config.majors) for (const v of ['conquest', 'hegemony', 'gloriousCampaign']) expect(availableVictories(p, m)).not.toContain(v);
    expect(() => createGame({ seed: 'peace', seats: [{ faction: 'rynkai', name: 'R' }], preset: 'peaceful' })).toThrow();
    const t = createGame({ seed: 'tw', seats: [{ faction: 'concord', name: 'A' }], preset: 'totalWar' });
    expect([...availableVictories(t, 'concord')].sort()).toEqual(['conquest', 'score']);
    // Total War is military victories only (plus Score at the turn limit).
    for (const m of t.config.majors) for (const v of availableVictories(t, m)) expect(['conquest', 'hegemony', 'gloriousCampaign', 'score']).toContain(v);
    expect(availableVictories(t, 'varrhen')).toContain('hegemony');
    expect(availableVictories(t, 'lattice')).not.toContain('singularity');
  });

  it('defaults to a 200-round turn limit', () => {
    expect(createGame({ seed: 'tl', seats: [{ faction: 'concord', name: 'A' }] }).config.turnLimit).toBe(200);
    expect(createGame({ seed: 'tl', seats: [{ faction: 'concord', name: 'A' }], turnLimit: null }).config.turnLimit).toBeNull();
  });

  it('every victory reports progress without throwing', () => {
    const g = newGame('vic');
    for (const m of majors) for (const v of VICTORY_IDS) {
      const p = progress(g, m, v);
      expect(p.fraction).toBeGreaterThanOrEqual(0);
      expect(p.fraction).toBeLessThanOrEqual(1);
      expect(p.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('victories', () => {
  it('Conquest for those allowed it, but never for the Concord in Classic', () => {
    const g = newGame('vic');
    holdHomes(g, 'concord');
    expect(checkVictory(g, false)).toBeNull();
    const h = newGame('vic');
    holdHomes(h, 'krasnyr');
    expect(checkVictory(h, false)).toBe('krasnyr');
  });

  it('Hegemony: two rival homes and four vassals (Varrhen only)', () => {
    const g = newGame('vic');
    holdHomes(g, 'varrhen', 2);
    const minors = Object.values(g.factions).filter((f) => f.kind === 'minor').slice(0, 4);
    for (const m of minors.slice(0, 3)) m.overlord = 'varrhen';
    expect(checkVictory(g, false)).toBeNull();
    minors[3].overlord = 'varrhen';
    expect(checkVictory(g, false)).toBe('varrhen');
  });

  it('Glorious Campaign counts battle wins, scaled by map size', () => {
    expect(gloriousWinsNeeded(36, 22)).toBeLessThan(gloriousWinsNeeded(50, 30));
    expect(gloriousWinsNeeded(64, 40)).toBeGreaterThan(gloriousWinsNeeded(50, 30));
    const g = newGame('vic');
    g.rng = seedRng('glory');
    const hex = emptyHex(g);
    setStatus(g, 'rynkai', 'concord', 'war');
    fleetOf(g, 'rynkai', DESIGNS['lattice:proof'], hex, 6);
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 2);
    resolveBattleAt(g, hex, 'rynkai');
    expect(g.factions.rynkai.flags.battleWins).toBe(1);
    expect(g.factions.rynkai.flags['beat:concord']).toBe(1);
    g.factions.rynkai.flags.battleWins = 45;
    for (const m of majors) g.factions.rynkai.flags[`beat:${m}`] = 1;
    expect(checkVictory(g, false)).toBe('rynkai');
  });

  it('Ascendance (Concord) and Singularity (Lattice)', () => {
    const g = newGame('vic');
    for (const t of TECHS) grantTech(g, 'concord', t.id);
    expect(checkVictory(g, false)).toBeNull();
    g.factions.concord.flags.ascensionGate = 1;
    expect(checkVictory(g, false)).toBe('concord');
    const h = newGame('vic');
    for (const t of TECHS) grantTech(h, 'lattice', t.id);
    const cores = h.map.hexes.filter((x) => x.owner === 'lattice' && x.system).slice(0, 3);
    for (const x of cores) { x.system!.development = 5; if (!x.system!.improvements.includes('lab')) x.system!.improvements.push('lab'); }
    for (let i = 0; i < 9; i++) expect(checkVictory(h, true)).toBeNull();
    expect(checkVictory(h, true)).toBe('lattice');
  });

  it('World Revolution: six defections and three vassals (Krasnyr only)', () => {
    const g = newGame('vic');
    g.factions.krasnyr.flags.defections = 6;
    const minors = Object.values(g.factions).filter((f) => f.kind === 'minor').slice(0, 3);
    for (const m of minors) m.overlord = 'krasnyr';
    expect(checkVictory(g, false)).toBe('krasnyr');
  });

  it('Grand Alliance needs 10 rounds in a row', () => {
    const g = newGame('vic');
    for (const m of majors) if (m !== 'lattice') setStatus(g, 'lattice', m, 'alliance');
    for (const h of g.map.hexes) if (h.system && !h.owner) h.owner = 'lattice';
    for (let i = 0; i < 9; i++) expect(checkVictory(g, true)).toBeNull();
    expect(checkVictory(g, true)).toBe('lattice');
  });

  it('the Galactic Council counts population votes and needs two wins in a row', () => {
    const g = newGame('vic');
    // Everyone loves the Concord and hosts its embassy.
    for (const f of Object.keys(g.factions)) {
      if (f === 'concord') continue;
      const r = g.relations[relationKey('concord', f)];
      r.contact = true;
      if (r.a === 'concord') { r.embassyA = true; r.opinionBA = 100; } else { r.embassyB = true; r.opinionAB = 100; }
    }
    g.turn = 20;
    runCouncil(g);
    expect(g.council!.shares.concord).toBeGreaterThan(2 / 3);
    expect(g.council!.streak.concord).toBe(1);
    g.turn = 40;
    expect(checkVictory(g, true)).toBe('concord');
  });

  it('Score decides at the turn limit', () => {
    const g = newGame('vic');
    g.config.turnLimit = 1;
    expect(checkVictory(g, false)).toBeNull();
    expect(majors).toContain(checkVictory(g, true));
  });
});
