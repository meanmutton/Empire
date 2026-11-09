import { DESIGNS } from '../src/data/designs';
import { battleHexes, repairFleets, resolveBattleAt, resolveCombat, retreatFleet } from '../src/engine/combat';
import { invade, loadArmy } from '../src/engine/ground';
import { ring } from '../src/engine/hex';
import { Rng, seedRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';
import { emptyHex, firstDesign, fleetOf, newGame, setStatus } from './helpers';

function clear(g: GameState, hex: number) {
  for (const h of [hex, ...ring(g.map, hex, 1)]) { g.map.hexes[h].terrain = 'space'; g.map.hexes[h].wormhole = null; }
}

function countShips(g: GameState, owner: string, hex: number): number {
  return Object.values(g.fleets).filter((f) => f.owner === owner && f.hex === hex).reduce((a, f) => a + f.ships.length, 0);
}

/** Two identical forces of n ships each; returns average fraction lost per side over many trials. */
function equalBattle(designId: string, groups: number, trials: number): { a: number; b: number } {
  let la = 0, lb = 0;
  for (let t = 0; t < trials; t++) {
    const g = newGame('combat');
    g.rng = seedRng(`trial-${t}`);
    const hex = emptyHex(g);
    clear(g, hex);
    setStatus(g, 'concord', 'krasnyr', 'war');
    const d = DESIGNS[designId];
    for (let k = 0; k < groups; k++) { fleetOf(g, 'concord', d, hex, 6); fleetOf(g, 'krasnyr', d, hex, 6); }
    const n = groups * 6;
    resolveBattleAt(g, hex, 'concord');
    la += (n - countShips(g, 'concord', hex)) / n;
    lb += (n - countShips(g, 'krasnyr', hex)) / n;
  }
  return { a: la / trials, b: lb / trials };
}

describe('combat lethality', () => {
  for (const id of ['lattice:tensor', 'lattice:matrix', 'lattice:axiom', 'lattice:proof', 'lattice:vector']) {
    it(`equal forces of ${id} each lose about half per round`, () => {
      const r = equalBattle(id, 3, 30);
      expect(r.a).toBeGreaterThan(0.4);
      expect(r.a).toBeLessThan(0.6);
      expect(r.b).toBeGreaterThan(0.4);
      expect(r.b).toBeLessThan(0.6);
    });
  }

  it('a force twice as big wins decisively', () => {
    let bigLoss = 0, smallLoss = 0;
    for (let t = 0; t < 30; t++) {
      const g = newGame('combat');
      g.rng = seedRng(`big-${t}`);
      const hex = emptyHex(g);
      clear(g, hex);
      setStatus(g, 'concord', 'krasnyr', 'war');
      const d = DESIGNS['lattice:tensor'];
      for (let k = 0; k < 4; k++) fleetOf(g, 'concord', d, hex, 6);
      for (let k = 0; k < 2; k++) fleetOf(g, 'krasnyr', d, hex, 6);
      resolveBattleAt(g, hex, 'concord');
      bigLoss += (24 - countShips(g, 'concord', hex)) / 24;
      smallLoss += (12 - countShips(g, 'krasnyr', hex)) / 12;
    }
    expect(bigLoss / 30).toBeLessThan(0.35);
    expect(smallLoss / 30).toBeGreaterThan(0.75);
  });

  it('only fights at war', () => {
    const g = newGame();
    const hex = emptyHex(g);
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 3);
    fleetOf(g, 'krasnyr', DESIGNS['lattice:tensor'], hex, 3);
    expect(battleHexes(g, 'concord')).toHaveLength(0);
    setStatus(g, 'concord', 'krasnyr', 'war');
    expect(battleHexes(g, 'concord')).toEqual([hex]);
    expect(resolveCombat(g, 'concord')).toHaveLength(1);
    expect(g.log.some((e) => e.kind === 'battle')).toBe(true);
  });

  it('first round is flagged and later rounds are not', () => {
    const g = newGame();
    const hex = emptyHex(g);
    setStatus(g, 'concord', 'krasnyr', 'war');
    fleetOf(g, 'concord', DESIGNS['lattice:proof'], hex, 6);
    fleetOf(g, 'krasnyr', DESIGNS['lattice:proof'], hex, 6);
    expect(resolveBattleAt(g, hex, 'concord').firstRound).toBe(true);
    g.seq += 1;
    expect(resolveBattleAt(g, hex, 'krasnyr').firstRound).toBe(false);
  });

  it('boarding captures ships over many battles', () => {
    let captured = 0;
    for (let t = 0; t < 20; t++) {
      const g = newGame('board');
      g.rng = seedRng(`b-${t}`);
      const hex = emptyHex(g);
      setStatus(g, 'concord', 'rynkai', 'war');
      fleetOf(g, 'rynkai', DESIGNS['lattice:tensor'], hex, 6);
      fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 6);
      captured += resolveBattleAt(g, hex, 'rynkai').parties.find((p) => p.faction === 'concord')!.captured;
    }
    expect(captured).toBeGreaterThan(0);
  });

  it('escorts draw fire', () => {
    let escortLosses = 0, otherLosses = 0;
    for (let t = 0; t < 40; t++) {
      const g = newGame('esc');
      g.rng = seedRng(`e-${t}`);
      const hex = emptyHex(g);
      setStatus(g, 'concord', 'krasnyr', 'war');
      const esc = firstDesign('lattice', (d) => d.role === 'escort' && d.cls === 'destroyer');
      const line = firstDesign('lattice', (d) => d.role === 'line' && d.cls === 'destroyer');
      const fid = fleetOf(g, 'concord', esc, hex, 3);
      for (let i = 0; i < 3; i++) fleetOf(g, 'concord', line, hex, 1);
      fleetOf(g, 'krasnyr', line, hex, 6);
      const before = new Set(g.fleets[fid].ships);
      resolveBattleAt(g, hex, 'krasnyr');
      const after = new Set(g.fleets[fid]?.ships ?? []);
      const escLost = [...before].filter((s) => !after.has(s)).length;
      escortLosses += escLost;
      otherLosses += 3 - Object.values(g.fleets).filter((f) => f.owner === 'concord' && f.id !== fid).length;
    }
    expect(escortLosses).toBeGreaterThan(otherLosses);
  });
});

describe('planets, invasion, retreat, repair', () => {
  it('fleets grind down planetary defenses, then armies invade', () => {
    const g = newGame('inv');
    const home = g.factions.rynkai.home;
    setStatus(g, 'concord', 'rynkai', 'war');
    for (const f of Object.values(g.fleets)) if (f.owner === 'rynkai') { for (const s of f.ships) delete g.ships[s]; delete g.fleets[f.id]; }
    const big = firstDesign('lattice', (d) => d.cls === 'battleship' && d.role === 'line');
    for (let k = 0; k < 3; k++) fleetOf(g, 'concord', big, home, 6);
    const sys = g.map.hexes[home].system!;
    const def0 = sys.defense;
    for (let i = 0; i < 6 && sys.defense > 0; i++) { g.seq++; resolveBattleAt(g, home, 'concord'); }
    expect(sys.defense).toBeLessThan(def0);
    expect(sys.defense).toBe(0);
    const tr = firstDesign('concord', (d) => d.role === 'transport');
    const tfid = fleetOf(g, 'concord', tr, home, 1);
    const ship = g.fleets[tfid].ships[0];
    for (let k = 0; k < g.ships[ship].cargo.length + 4; k++) {
      const id = `rtest${k}`;
      g.armies[id] = { id, owner: 'concord', strength: 40, xp: 1, hex: home, ship: null };
      loadArmy(g, id, ship);
    }
    const r = invade(g, tfid);
    expect(r.ok).toBe(true);
    expect(g.map.hexes[home].owner).toBe('concord');
  });

  it('cannot invade while defenses stand', () => {
    const g = newGame('inv2');
    setStatus(g, 'concord', 'rynkai', 'war');
    const home = g.factions.rynkai.home;
    const tr = firstDesign('concord', (d) => d.role === 'transport');
    const fid = fleetOf(g, 'concord', tr, home, 1);
    expect(invade(g, fid).ok).toBe(false);
  });

  it('retreats, except the Ryn\'kai', () => {
    const g = newGame('ret');
    const hex = emptyHex(g);
    clear(g, hex);
    setStatus(g, 'concord', 'rynkai', 'war');
    const c = fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 2);
    const r = fleetOf(g, 'rynkai', DESIGNS['lattice:tensor'], hex, 2);
    expect(retreatFleet(g, r).ok).toBe(false);
    expect(retreatFleet(g, c).ok).toBe(true);
    if (g.fleets[c]) expect(g.fleets[c].hex).not.toBe(hex);
  });

  it('repairs in friendly territory and faster at docks', () => {
    const g = newGame('rep');
    const home = g.factions.concord.home;
    const d = DESIGNS['lattice:tensor'];
    const fid = fleetOf(g, 'concord', d, home, 1);
    const s = g.ships[g.fleets[fid].ships[0]];
    s.hull = 10;
    repairFleets(g, 'concord');
    expect(s.hull).toBeGreaterThan(10);
    void new Rng(g.rng);
  });
});
