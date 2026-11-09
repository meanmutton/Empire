import { neighbors, ring } from '../src/engine/hex';
import {
  buildOutpost, colonize, continuePaths, markClaims, mergeFleets, moveFleet, resetMovement, resolveClaims, splitFleet,
} from '../src/engine/movement';
import { canSeeFleet, isExplored } from '../src/engine/visibility';
import { invade } from '../src/engine/ground';
import { emptyHex, firstDesign, fleetOf, newGame, setStatus } from './helpers';

function clearAround(g: ReturnType<typeof newGame>, hex: number, r: number) {
  for (let k = 0; k <= r; k++) for (const h of ring(g.map, hex, k)) {
    g.map.hexes[h].terrain = 'space';
    g.map.hexes[h].wormhole = null;
  }
}

describe('movement', () => {
  it('moves up to speed and continues next turn', () => {
    const g = newGame();
    const start = emptyHex(g);
    clearAround(g, start, 12);
    const scout = firstDesign('concord', (d) => d.role === 'scout');
    const fid = fleetOf(g, 'concord', scout, start);
    const dest = ring(g.map, start, 10)[0];
    expect(moveFleet(g, fid, dest).ok).toBe(true);
    const f = g.fleets[fid];
    expect(f.movesLeft).toBe(0);
    expect(f.path.length).toBe(10 - scout.stats.speed);
    resetMovement(g, 'concord');
    continuePaths(g, 'concord');
    expect(f.path.length).toBe(Math.max(0, 10 - 2 * scout.stats.speed));
  });

  it('cannot enter black holes', () => {
    const g = newGame();
    const start = emptyHex(g);
    clearAround(g, start, 3);
    for (const n of ring(g.map, start, 1)) g.map.hexes[n].terrain = 'blackHole';
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), start);
    expect(moveFleet(g, fid, ring(g.map, start, 3)[0]).ok).toBe(false);
  });

  it('stops when entering a hex with enemies', () => {
    const g = newGame();
    const start = emptyHex(g);
    clearAround(g, start, 6);
    const enemyHex = ring(g.map, start, 2)[0];
    fleetOf(g, 'rynkai', firstDesign('rynkai', (d) => d.role === 'line' && d.cls === 'frigate'), enemyHex);
    setStatus(g, 'concord', 'rynkai', 'war');
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), start);
    const beyond = ring(g.map, start, 5).find((h) => ring(g.map, enemyHex, 3).includes(h))!;
    moveFleet(g, fid, enemyHex);
    expect(g.fleets[fid].hex).toBe(enemyHex);
    moveFleet(g, fid, beyond);
    expect(g.fleets[fid].hex).toBe(enemyHex);
  });

  it('merges up to 6 ships and splits', () => {
    const g = newGame();
    const hex = emptyHex(g);
    const d = firstDesign('concord', (x) => x.role === 'line' && x.cls === 'frigate');
    const a = fleetOf(g, 'concord', d, hex, 4);
    const b = fleetOf(g, 'concord', d, hex, 2);
    const c = fleetOf(g, 'concord', d, hex, 1);
    expect(mergeFleets(g, a, b).ok).toBe(true);
    expect(g.fleets[a].ships).toHaveLength(6);
    expect(mergeFleets(g, a, c).ok).toBe(false);
    const split = splitFleet(g, a, g.fleets[a].ships.slice(0, 2))!;
    expect(g.fleets[split].ships).toHaveLength(2);
    expect(g.fleets[a].ships).toHaveLength(4);
  });
});

describe('claims', () => {
  it('claims an empty hex at the start of the next turn', () => {
    const g = newGame();
    const hex = emptyHex(g);
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), hex);
    markClaims(g, 'concord');
    expect(g.map.hexes[hex].owner).toBeNull();
    expect(g.map.hexes[hex].pendingClaim).toBe('concord');
    expect(resolveClaims(g, 'concord')).toContain(hex);
    expect(g.map.hexes[hex].owner).toBe('concord');
  });

  it('does not claim if the fleet left or an enemy arrived', () => {
    const g = newGame();
    const hex = emptyHex(g);
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), hex);
    markClaims(g, 'concord');
    g.fleets[fid].hex = neighbors(g.map, hex)[0];
    expect(resolveClaims(g, 'concord')).toHaveLength(0);
    g.fleets[fid].hex = hex;
    markClaims(g, 'concord');
    fleetOf(g, 'rynkai', firstDesign('rynkai', (d) => d.role === 'scout'), hex);
    expect(resolveClaims(g, 'concord')).toHaveLength(0);
    expect(g.map.hexes[hex].owner).toBeNull();
  });

  it('needs war to claim enemy territory, and defenses down for systems', () => {
    const g = newGame();
    const rynHex = g.map.hexes.findIndex((h, i) => h.owner === 'rynkai' && !h.system && i !== g.factions.rynkai.home);
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), rynHex);
    markClaims(g, 'concord');
    expect(g.map.hexes[rynHex].pendingClaim).toBeNull();
    setStatus(g, 'concord', 'rynkai', 'war');
    markClaims(g, 'concord');
    expect(resolveClaims(g, 'concord')).toContain(rynHex);
    const home = g.factions.rynkai.home;
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), home);
    for (const f of Object.values(g.fleets)) if (f.owner === 'rynkai' && f.hex === home) f.hex = rynHex + 0;
    markClaims(g, 'concord');
    expect(g.map.hexes[home].pendingClaim).toBeNull();
  });

  it('only takes empty hexes: settled planets need invasion, starbases must be destroyed', () => {
    const g = newGame();
    setStatus(g, 'concord', 'rynkai', 'war');
    // An undefended Ryn'kai outpost: presence alone does not take it.
    const outpost = g.map.hexes.findIndex((h) => h.owner === 'rynkai' && h.system && !h.system.homeOf);
    const sys = g.map.hexes[outpost].system!;
    sys.defense = 0;
    sys.garrison = 0;
    for (const f of Object.values(g.fleets)) if (f.owner === 'rynkai' && f.hex === outpost) f.hex = g.factions.rynkai.home;
    const tr = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'transport'), outpost);
    markClaims(g, 'concord');
    expect(g.map.hexes[outpost].pendingClaim).toBeNull();
    // Landing an army does take it.
    const ship = g.fleets[tr].ships[0];
    g.armies.a1 = { id: 'a1', owner: 'concord', strength: 10, xp: 0, hex: null, ship };
    g.ships[ship].cargo.push('a1');
    expect(invade(g, tr).ok).toBe(true);
    expect(g.map.hexes[outpost].owner).toBe('concord');
    // An unsettled star system is an empty hex: presence claims it.
    const wild = g.map.hexes.findIndex((h) => h.system && !h.owner && h.system.development === 0 && h.terrain === 'space');
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), wild);
    markClaims(g, 'concord');
    expect(g.map.hexes[wild].pendingClaim).toBe('concord');
    // An enemy starbase blocks the claim until it is destroyed.
    const empty = g.map.hexes.findIndex((h, i) => h.owner === 'rynkai' && !h.system && !Object.values(g.fleets).some((f) => f.hex === i));
    g.starbases.sb = { id: 'sb', owner: 'rynkai', hex: empty, tier: 1, hull: 150 };
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), empty);
    markClaims(g, 'concord');
    expect(g.map.hexes[empty].pendingClaim).toBeNull();
    delete g.starbases.sb;
    markClaims(g, 'concord');
    expect(g.map.hexes[empty].pendingClaim).toBe('concord');
  });
});

describe('colonization', () => {
  it('colony ships found colonies and are consumed', () => {
    const g = newGame();
    const target = g.map.hexes.findIndex((h) => h.system && !h.owner && h.system.development === 0 && h.terrain === 'space');
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'colony'), target);
    expect(colonize(g, fid).ok).toBe(true);
    expect(g.map.hexes[target].owner).toBe('concord');
    expect(g.map.hexes[target].system!.development).toBeGreaterThanOrEqual(1);
    expect(g.fleets[fid]).toBeUndefined();
    expect(colonize(g, fid).ok).toBe(false);
  });

  it('constructors found outposts and survive', () => {
    const g = newGame();
    const target = g.map.hexes.findIndex((h) => h.system && !h.owner && h.system.development === 0 && h.terrain === 'space');
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'constructor'), target);
    const metals = g.factions.concord.stock.metals;
    expect(buildOutpost(g, fid).ok).toBe(true);
    expect(g.factions.concord.stock.metals).toBeLessThan(metals);
    expect(g.fleets[fid]).toBeDefined();
    expect(g.map.hexes[target].system!.development).toBe(1);
  });
});

describe('visibility', () => {
  it('explores as fleets move', () => {
    const g = newGame();
    const start = emptyHex(g);
    clearAround(g, start, 8);
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), start);
    const dest = ring(g.map, start, 4)[0];
    expect(isExplored(g, 'concord', dest)).toBe(false);
    moveFleet(g, fid, dest);
    expect(isExplored(g, 'concord', dest)).toBe(true);
  });

  it('nebulae and cloaks hide fleets', () => {
    const g = newGame();
    const hex = emptyHex(g);
    clearAround(g, hex, 3);
    const watcher = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), ring(g.map, hex, 1)[0]);
    const target = fleetOf(g, 'rynkai', firstDesign('rynkai', (d) => d.role === 'scout'), hex);
    expect(canSeeFleet(g, 'concord', g.fleets[target])).toBe(true);
    g.map.hexes[hex].terrain = 'nebula';
    expect(canSeeFleet(g, 'concord', g.fleets[target])).toBe(false);
    g.map.hexes[hex].terrain = 'space';
    const cloaked = fleetOf(g, 'nhar', firstDesign('nhar', (d) => d.role === 'raider'), hex);
    expect(canSeeFleet(g, 'concord', g.fleets[cloaked])).toBe(false);
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'science'), g.fleets[watcher].hex);
    expect(canSeeFleet(g, 'concord', g.fleets[cloaked])).toBe(true);
  });
});
