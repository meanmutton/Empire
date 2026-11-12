import { describe, expect, it } from 'vitest';
import { buildOutpost, claimBlocker, colonize, markClaims, moveFleet, ORPHAN_TURNS, razeOutposts, releaseOrphans, wormholeCost, wormholeExit } from '../src/engine/movement';
import { endTurn, startTurn } from '../src/engine/turn';
import { hexDistance, neighbors } from '../src/engine/hex';
import { outpostRange, visibleHexes } from '../src/engine/visibility';
import { factionIncome, SCIENCE_SHIP, scienceShipYield, studySite } from '../src/engine/economy';
import { propose } from '../src/engine/diplomacy';
import { connectedHexes, relation } from '../src/engine/query';
import { PLANET_YIELDS } from '../src/data/improvements';
import { TECHS } from '../src/data/techs';
import { emptyHex, firstDesign, fleetOf, newGame, setStatus } from './helpers';

describe('multi-turn movement', () => {
  it('a fleet on a long route keeps its movement at the start of a turn, can be redirected, and carries on at the end', () => {
    const g = newGame('route');
    g.active = g.turnOrder.indexOf('concord');
    const d = firstDesign('concord', (x) => x.role === 'scout');
    const start = emptyHex(g);
    const fid = fleetOf(g, 'concord', d, start);
    // A destination well beyond one turn's reach.
    let dest = start;
    for (let k = 0; k < d.stats.speed * 3; k++) dest = neighbors(g.map, dest).find((n) => n !== start && g.map.hexes[n].terrain === 'space') ?? dest;
    expect(moveFleet(g, fid, dest).ok).toBe(true);
    const f = g.fleets[fid];
    const after1 = f.hex;
    expect(f.path.length).toBeGreaterThan(0);
    // Turn passes back round to the Concord: the fleet has not moved yet and has its full movement.
    for (let i = 0; i < g.turnOrder.length; i++) { endTurn(g); if (g.turnOrder[g.active] === 'concord') break; }
    expect(g.turnOrder[g.active]).toBe('concord');
    const atStart = f.hex;
    expect(f.movesLeft).toBeGreaterThan(0);
    expect(f.path.length).toBeGreaterThan(0);
    // Its first leg ended at the end of the turn it was ordered (it did not move again at the start).
    expect(atStart).toBe(after1);
    // Left alone, it continues at the end of this turn.
    const before = f.path.length;
    endTurn(g);
    expect(g.fleets[fid].path.length).toBeLessThan(before);
  });
});

describe('claims', () => {
  it('explains why ships will not take a hex', () => {
    const g = newGame('claims');
    const theirs = g.map.hexes.findIndex((h) => h.owner === 'krasnyr' && !h.system);
    setStatus(g, 'concord', 'krasnyr', 'relations');
    expect(claimBlocker(g, 'concord', theirs)).toMatch(/at war/);
    setStatus(g, 'concord', 'krasnyr', 'war');
    expect(claimBlocker(g, 'concord', theirs)).toBeNull();
    const home = g.factions.krasnyr.home;
    expect(claimBlocker(g, 'concord', home)).toMatch(/invade/);
  });
});

/** A Lattice hex ringed by six Concord hexes, away from everyone's systems. */
function enclave(g: ReturnType<typeof newGame>): number {
  const c = emptyHex(g, 4);
  g.map.hexes[c].owner = 'concord';
  for (const n of neighbors(g.map, c)) g.map.hexes[n].owner = 'concord';
  return c;
}

describe('cut-off territory', () => {
  it(`passes to a power that completely surrounds it after ${ORPHAN_TURNS} turns without a planet, outpost or starbase`, () => {
    const g = newGame('orphans');
    const pocket = enclave(g);
    expect(pocket).toBeGreaterThanOrEqual(0);
    g.map.hexes[pocket].owner = 'lattice';
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
    g.turn += ORPHAN_TURNS - 1;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
    g.turn += 1;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('concord');
  });

  it('is kept while the owner has ships there, and never touches connected territory', () => {
    const g = newGame('orphans2');
    const pocket = enclave(g);
    g.map.hexes[pocket].owner = 'lattice';
    fleetOf(g, 'lattice', firstDesign('lattice', (x) => x.role === 'scout'), pocket);
    releaseOrphans(g, 'lattice');
    g.turn += ORPHAN_TURNS + 1;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
    const lattice = g.map.hexes.filter((h) => h.owner === 'lattice').length;
    startTurn(g);
    expect(g.map.hexes.filter((h) => h.owner === 'lattice').length).toBeGreaterThanOrEqual(lattice - 1);
  });
});

describe('cut-off territory needs a single power all round it', () => {
  it('stays put when one bordering hex is open space', () => {
    const g = newGame('orphans3');
    const pocket = enclave(g);
    g.map.hexes[pocket].owner = 'lattice';
    g.map.hexes[neighbors(g.map, pocket)[0]].owner = null;
    releaseOrphans(g, 'lattice');
    g.turn += ORPHAN_TURNS + 2;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
  });

  it('an outpost keeps it connected', () => {
    const g = newGame('orphans4');
    const pocket = enclave(g);
    g.map.hexes[pocket].owner = 'lattice';
    g.map.hexes[pocket].outpost = true;
    releaseOrphans(g, 'lattice');
    g.turn += ORPHAN_TURNS + 2;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
    expect(g.map.hexes[pocket].orphanSince).toBeUndefined();
  });
});

describe('outposts', () => {
  it('can be built in open space, claim the hex and see as far as scouts', () => {
    const g = newGame('outpost1');
    const hex = emptyHex(g, 4);
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'constructor'), hex);
    expect(buildOutpost(g, fid).ok).toBe(true);
    expect(g.map.hexes[hex].owner).toBe('concord');
    expect(g.map.hexes[hex].outpost).toBe(true);
    const scout = Math.max(...firstDesignAll('concord', 'scout').map((d) => d.stats.sensors));
    expect(outpostRange(g, 'concord')).toBe(scout);
    delete g.fleets[fid];
    const vis = visibleHexes(g, 'concord');
    const far = g.map.hexes.findIndex((_, i) => hexDistance(g.map, hex, i) === scout);
    expect(vis.has(far)).toBe(true);
    // One per hex.
    const fid2 = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'constructor'), hex);
    expect(buildOutpost(g, fid2).ok).toBe(false);
  });

  it('can’t go in someone else’s territory', () => {
    const g = newGame('outpost2');
    const theirs = g.map.hexes.findIndex((h, i) => h.owner === 'krasnyr' && !h.system && i !== g.factions.krasnyr.home);
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'constructor'), theirs);
    for (const f of Object.values(g.fleets)) if (f.owner === 'krasnyr' && f.hex === theirs) f.hex = g.factions.krasnyr.home;
    expect(buildOutpost(g, fid).ok).toBe(false);
  });

  it('blocks claims until enemy warships destroy it', () => {
    const g = newGame('outpost3');
    const hex = emptyHex(g, 4);
    g.map.hexes[hex].owner = 'krasnyr';
    g.map.hexes[hex].outpost = true;
    setStatus(g, 'concord', 'krasnyr', 'war');
    const scout = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), hex);
    expect(claimBlocker(g, 'concord', hex)).toMatch(/outpost/);
    markClaims(g, 'concord');
    expect(g.map.hexes[hex].pendingClaim).toBeNull();
    razeOutposts(g, 'concord');
    expect(g.map.hexes[hex].outpost).toBe(true); // a scout can't destroy it
    delete g.fleets[scout];
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'line'), hex);
    razeOutposts(g, 'concord');
    expect(g.map.hexes[hex].outpost).toBeUndefined();
    markClaims(g, 'concord');
    expect(g.map.hexes[hex].pendingClaim).toBe('concord');
  });

  it('a colony ship can settle a world held by your outpost; harsh worlds become footholds', () => {
    const g = newGame('outpost4');
    const hex = g.map.hexes.findIndex((h) => h.system && !h.owner && h.system.development === 0 && PLANET_YIELDS[h.system.planet].popCap < 4 && h.terrain === 'space');
    const c = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'constructor'), hex);
    expect(buildOutpost(g, c).ok).toBe(true);
    expect(g.map.hexes[hex].system!.development).toBe(0);
    const col = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'colony'), hex);
    expect(colonize(g, col).ok).toBe(true);
    expect(g.map.hexes[hex].system!.development).toBe(1);
  });
});

describe('trade proposals', () => {
  it('reject the same technology twice', () => {
    const g = newGame('trade-dup');
    const r = relation(g, 'concord', 'lattice');
    r.contact = true;
    if (r.a === 'concord') r.embassyA = true; else r.embassyB = true;
    if (r.status === 'neutral') r.status = 'relations';
    const tech = TECHS.map((t) => t.id).find((t) => t !== 'ascension' && !g.factions.lattice.research.known.includes(t));
    g.factions.concord.research.known.push(tech!);
    expect(tech).toBeDefined();
    const res = propose(g, 'concord', 'lattice', [{ kind: 'tech', tech: tech! }, { kind: 'tech', tech: tech! }], []);
    expect(res.ok).toBe(false);
    expect(propose(g, 'concord', 'lattice', [{ kind: 'tech', tech: tech! }], [{ kind: 'anyTech' }, { kind: 'anyTech' }]).ok).toBe(false);
    expect(propose(g, 'concord', 'lattice', [{ kind: 'tech', tech: tech! }], []).ok).toBe(true);
  });
});

describe('science vessels', () => {
  it('add science each turn, more while studying a phenomenon', () => {
    const g = newGame('science');
    const d = firstDesign('concord', (x) => x.role === 'science');
    const plain = g.map.hexes.findIndex((_, i) => !studySite(g, i) && !g.map.hexes[i].owner);
    const site = g.map.hexes.findIndex((h, i) => h.terrain === 'nebula' && studySite(g, i));
    const before = factionIncome(g, 'concord').gross.science;
    const a = fleetOf(g, 'concord', d, plain);
    expect(scienceShipYield(g, 'concord')).toBe(SCIENCE_SHIP.base);
    expect(factionIncome(g, 'concord').gross.science).toBeGreaterThan(before);
    g.fleets[a].hex = site;
    expect(scienceShipYield(g, 'concord')).toBe(SCIENCE_SHIP.study);
  });
});

function firstDesignAll(faction: string, role: string) {
  const out = [];
  try { out.push(firstDesign(faction, (d) => d.role === role)); } catch { /* none */ }
  return out;
}

describe('wormholes', () => {
  it('a fleet on a wormhole can jump to its twin for 1 movement (none for wormhole navigators)', () => {
    const g = newGame('worm1');
    const a = g.map.hexes.findIndex((h) => h.terrain === 'wormhole' && h.wormhole !== null);
    expect(a).toBeGreaterThanOrEqual(0);
    const twin = wormholeExit(g, a)!;
    expect(wormholeExit(g, twin)).toBe(a);
    expect(wormholeExit(g, g.factions.concord.home)).toBeNull();
    const fid = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), a);
    const f = g.fleets[fid];
    f.movesLeft = 3;
    expect(wormholeCost(g, 'concord')).toBe(1);
    expect(moveFleet(g, fid, twin).ok).toBe(true);
    expect(f.hex).toBe(twin);
    expect(f.movesLeft).toBe(2);
    expect(wormholeCost(g, 'tal')).toBe(0);
  });
});

describe('territory through wormholes', () => {
  it('a wormhole a power owns both ends of connects its territory', () => {
    const g = newGame('worm-conn');
    const a = g.map.hexes.findIndex((h) => h.terrain === 'wormhole' && h.wormhole !== null);
    const b = g.map.hexes[a].wormhole!;
    for (const h of g.map.hexes) if (h.owner === 'concord' && h.system === null) h.owner = null; // keep only the core
    const far = (i: number) => g.map.hexes[i];
    far(a).owner = 'concord';
    far(b).owner = 'concord';
    const near = neighbors(g.map, b).find((n) => g.map.hexes[n].terrain === 'space' && !g.map.hexes[n].owner)!;
    far(near).owner = 'concord';
    // Joined to the home territory by hand at one end only.
    let cur = a;
    const home = g.factions.concord.home;
    while (hexDistance(g.map, cur, home) > 1) {
      const next = neighbors(g.map, cur).filter((n) => !g.map.hexes[n].owner || g.map.hexes[n].owner === 'concord')
        .sort((x, y) => hexDistance(g.map, x, home) - hexDistance(g.map, y, home))[0];
      g.map.hexes[next].owner = 'concord';
      cur = next;
    }
    expect(connectedHexes(g, 'concord').has(a)).toBe(true);
    expect(connectedHexes(g, 'concord').has(near)).toBe(true);
    // Without owning the far end, the territory beyond is cut off.
    g.map.hexes[b].owner = null;
    expect(connectedHexes(g, 'concord').has(near)).toBe(false);
  });
});
