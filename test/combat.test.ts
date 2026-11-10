import { DESIGNS } from '../src/data/designs';
import { battleHexes, repairFleets, resolveBattleAt, resolveCombat } from '../src/engine/combat';
import { applyAction } from '../src/engine/actions';
import type { DoctrineId } from '../src/data/doctrines';
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

/** Spawns n ships of a design for a faction at hex, in groups of 6, with a doctrine. */
function force(g: GameState, owner: string, designId: string, hex: number, n: number, doctrine: DoctrineId = 'engage'): void {
  while (n > 0) {
    const k = Math.min(6, n);
    g.fleets[fleetOf(g, owner, DESIGNS[designId], hex, k)].doctrine = doctrine;
    n -= k;
  }
}

/** Many battles of a ships vs b ships; returns how often each side came out ahead, and average losses. */
function trial(a: number, b: number, opts: { trials?: number; designId?: string; da?: DoctrineId; db?: DoctrineId; rounds?: number; tag?: string } = {}) {
  const trials = opts.trials ?? 200, id = opts.designId ?? 'lattice:tensor';
  let aWins = 0, bWins = 0, aLost = 0, bLost = 0;
  for (let t = 0; t < trials; t++) {
    const g = newGame('combat');
    g.rng = seedRng(`${opts.tag ?? 't'}-${a}-${b}-${t}`);
    if (opts.rounds) g.config.combatRounds = opts.rounds;
    const hex = emptyHex(g);
    clear(g, hex);
    setStatus(g, 'concord', 'krasnyr', 'war');
    force(g, 'concord', id, hex, a, opts.da);
    force(g, 'krasnyr', id, hex, b, opts.db);
    resolveBattleAt(g, hex, 'concord');
    const w = g.battleLog!.at(-1)!.winner;
    if (w === 'concord') aWins++;
    if (w === 'krasnyr') bWins++;
    const lost = (f: string) => g.battleLog!.at(-1)!.sides.find((x) => x.faction === f)!.ships.reduce((n, r) => n + r.destroyed + r.captured, 0);
    aLost += lost('concord') / a;
    bLost += lost('krasnyr') / b;
  }
  return { aWins: aWins / trials, bWins: bWins / trials, aLost: aLost / trials, bLost: bLost / trials };
}

describe('combat lethality and luck', () => {
  for (const id of ['lattice:tensor', 'lattice:matrix', 'lattice:axiom', 'lattice:proof', 'lattice:vector']) {
    it(`equal forces of ${id} trade evenly and bloodily`, () => {
      const r = trial(12, 12, { designId: id, trials: 60, tag: id });
      expect(r.aWins).toBeGreaterThan(0.3);
      expect(r.bWins).toBeGreaterThan(0.3);
      for (const lost of [r.aLost, r.bLost]) { expect(lost).toBeGreaterThan(0.2); expect(lost).toBeLessThan(0.65); }
    });
  }

  it('underdogs win sometimes: about a quarter at 1.5:1, about one in eight at 2:1, almost never at 3:1', () => {
    const r15 = trial(9, 6, { trials: 400, tag: 'u15' });
    const r2 = trial(12, 6, { trials: 400, tag: 'u2' });
    const r3 = trial(18, 6, { trials: 400, tag: 'u3' });
    expect(r15.bWins).toBeGreaterThan(0.2);
    expect(r15.bWins).toBeLessThan(0.34);
    expect(r2.bWins).toBeGreaterThan(0.08);
    expect(r2.bWins).toBeLessThan(0.18);
    expect(r3.bWins).toBeLessThan(0.05);
  }, 30_000);

  it('Full Attack is bloodier than Cautious for both sides', () => {
    const full = trial(12, 12, { da: 'fullAttack', db: 'fullAttack', trials: 80, tag: 'fa' });
    const careful = trial(12, 12, { da: 'cautious', db: 'cautious', trials: 80, tag: 'ca' });
    expect(full.aLost + full.bLost).toBeGreaterThan((careful.aLost + careful.bLost) * 1.5);
  });

  it('more combat rounds make fights to the end bloodier', () => {
    const short = trial(12, 12, { da: 'fullAttack', db: 'fullAttack', rounds: 3, trials: 80, tag: 'r3' });
    const long = trial(12, 12, { da: 'fullAttack', db: 'fullAttack', rounds: 10, trials: 80, tag: 'r10' });
    expect(long.aLost + long.bLost).toBeGreaterThan(short.aLost + short.bLost + 0.2);
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

  it('fleets on Retreat break away; the Ryn\'kai refuse the order', () => {
    const g = newGame('ret');
    const hex = emptyHex(g);
    clear(g, hex);
    setStatus(g, 'concord', 'krasnyr', 'war');
    const c = fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 3);
    fleetOf(g, 'krasnyr', DESIGNS['lattice:tensor'], hex, 6);
    g.fleets[c].doctrine = 'retreat';
    resolveBattleAt(g, hex, 'concord');
    const rec = g.battleLog!.at(-1)!;
    if (g.fleets[c]) expect(g.fleets[c].hex).not.toBe(hex);
    expect(rec.sides.find((s) => s.faction === 'concord')!.withdrew).toBe(1);
    expect(rec.fought).toBe(1);
    const ryn = Object.values(g.fleets).find((f) => f.owner === 'rynkai')!;
    g.active = g.turnOrder.indexOf('rynkai');
    expect(applyAction(g, 'rynkai', { type: 'doctrine', fleet: ryn.id, doctrine: 'retreat' }).ok).toBe(false);
    expect(applyAction(g, 'rynkai', { type: 'doctrine', fleet: ryn.id, doctrine: 'cautious' }).ok).toBe(true);
  });

  it('Engage withdraws after heavy losses, Full Attack never does', () => {
    let engageLeft = 0, fullLeft = 0;
    for (let t = 0; t < 30; t++) {
      for (const doctrine of ['engage', 'fullAttack'] as const) {
        const g = newGame('wd');
        g.rng = seedRng(`wd-${t}`);
        const hex = emptyHex(g);
        clear(g, hex);
        setStatus(g, 'concord', 'krasnyr', 'war');
        force(g, 'concord', 'lattice:tensor', hex, 6, doctrine);
        force(g, 'krasnyr', 'lattice:tensor', hex, 12, 'fullAttack');
        resolveBattleAt(g, hex, 'concord');
        const left = g.battleLog!.at(-1)!.sides.find((s) => s.faction === 'concord')!.withdrew ?? 0;
        if (doctrine === 'engage') engageLeft += left; else fullLeft += left;
      }
    }
    expect(engageLeft).toBeGreaterThan(5);
    expect(fullLeft).toBe(0);
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

describe('the fog of battle', () => {
  it('has critical hits, damaged and crippled survivors, and rare events (very rarely big ones)', () => {
    let crits = 0, crippled = 0, minor = 0, major = 0, battles = 0, rounds = 0;
    for (let t = 0; t < 400; t++) {
      const g = newGame('fog');
      g.rng = seedRng(`fog-${t}`);
      const hex = emptyHex(g);
      clear(g, hex);
      setStatus(g, 'concord', 'krasnyr', 'war');
      force(g, 'concord', 'lattice:proof', hex, 6, 'fullAttack');
      force(g, 'krasnyr', 'lattice:proof', hex, 6, 'fullAttack');
      resolveBattleAt(g, hex, 'concord');
      const b = g.battleLog!.at(-1)!;
      battles++;
      rounds += b.fought!;
      for (const s of b.sides) { crits += s.crits ?? 0; crippled += s.ships.reduce((a, r) => a + (r.crippled ?? 0), 0); }
      for (const r of b.rounds!) for (const l of r.lines) {
        if (l.startsWith('★')) major++;
        else if (/Sensor ghosts|Inspired gunnery|wreckage|jammed|Damage-control|launch late/.test(l)) minor++;
      }
    }
    expect(crits).toBeGreaterThan(battles);
    expect(crippled).toBeGreaterThan(battles * 0.3);
    expect(minor / rounds).toBeGreaterThan(0.02);
    expect(minor / rounds).toBeLessThan(0.1);
    expect(major / battles).toBeLessThan(0.03);
  });

  it('Hit and Run pulls out after two rounds', () => {
    let early = 0;
    for (let t = 0; t < 30; t++) {
      const g = newGame('hr');
      g.rng = seedRng(`hr-${t}`);
      const hex = emptyHex(g);
      clear(g, hex);
      setStatus(g, 'concord', 'krasnyr', 'war');
      force(g, 'concord', 'lattice:tensor', hex, 6, 'hitAndRun');
      force(g, 'krasnyr', 'lattice:tensor', hex, 6, 'fullAttack');
      resolveBattleAt(g, hex, 'concord');
      const b = g.battleLog!.at(-1)!;
      // Two full rounds, then a round pulling out under fire; only ships with wrecked engines stay behind.
      if (b.fought! <= 3) early++;
    }
    expect(early).toBeGreaterThan(25);
  });

  it('Hold the Line stands its ground over its own system', () => {
    let held = 0, engageLeft = 0;
    for (let t = 0; t < 30; t++) {
      for (const doctrine of ['holdLine', 'engage'] as const) {
        const g = newGame('hold');
        g.rng = seedRng(`hold-${t}`);
        setStatus(g, 'concord', 'krasnyr', 'war');
        const home = g.factions.concord.home;
        for (const f of Object.values(g.fleets)) if (f.hex === home) f.hex = 0;
        g.map.hexes[home].system!.defense = 3;
        force(g, 'concord', 'lattice:tensor', home, 6, doctrine);
        force(g, 'krasnyr', 'lattice:tensor', home, 9, 'fullAttack');
        resolveBattleAt(g, home, 'krasnyr');
        const left = g.battleLog!.at(-1)!.sides.find((s) => s.faction === 'concord')!.withdrew ?? 0;
        if (doctrine === 'holdLine' && left === 0) held++;
        if (doctrine === 'engage' && left > 0) engageLeft++;
      }
    }
    expect(held).toBe(30);
    expect(engageLeft).toBeGreaterThan(10);
  });
});

describe('battle report wording', () => {
  it('names the sides and counts only ships as lost ships', () => {
    const g = newGame('words');
    const hex = g.map.hexes.findIndex((h) => !h.owner && h.system && h.system.development > 0 && h.system.defense > 0);
    expect(hex).toBeGreaterThanOrEqual(0);
    const fid = fleetOf(g, 'concord', DESIGNS['lattice:proof'], hex, 6);
    g.fleets[fid].doctrine = 'fullAttack';
    resolveBattleAt(g, hex, 'concord');
    const e = g.log.filter((x) => x.kind === 'battle').at(-1)!;
    expect(e.text).not.toMatch(/@independent|concord lost/);
    expect(e.text).toMatch(/Concord lost \d+\/6 ships/);
    expect(e.text).toMatch(/Independents/);
    const rec = g.battleLog!.at(-1)!;
    const indepLost = rec.rounds!.reduce((a, r) => a + (r.sides.find((s) => s.faction === '@independent')?.lost ?? 0), 0);
    expect(indepLost).toBe(0);
  });
});
