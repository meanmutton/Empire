import { DESIGNS } from '../src/data/designs';
import { MAJOR_IDS } from '../src/data/factions';
import { checkBuild } from '../src/engine/economy';
import { relationKey } from '../src/engine/ids';
import { establishRoute, routeCapacity, routeDisruptors, routeOptions, routeValue, runTradeRoutes } from '../src/engine/routes';
import type { GameState } from '../src/engine/types';
import { firstDesign, fleetOf, newGame, setStatus } from './helpers';

function partners(g: GameState) {
  const r = g.relations[relationKey('concord', 'lattice')];
  r.contact = true; r.status = 'relations'; r.agreements.push('trade');
}
const cargo = () => firstDesign('concord', (d) => d.role === 'cargo');
const latticeHome = (g: GameState) => g.factions.lattice.home;

describe('trade routes', () => {
  it('a cargo ship at a partner system becomes a route paying both sides', () => {
    const g = newGame('routes');
    partners(g);
    const fid = fleetOf(g, 'concord', cargo(), latticeHome(g));
    expect(establishRoute(g, fid).ok).toBe(true);
    expect(g.fleets[fid]).toBeUndefined();
    const r = g.routes![0];
    expect(r.owner).toBe('concord');
    expect(r.partner).toBe('lattice');
    expect(r.path[0]).toBe(r.from);
    expect(r.path.at(-1)).toBe(r.to);
    const v = routeValue(g, r);
    expect(v).toBeGreaterThan(2);
    const c0 = g.factions.concord.stock.energy, l0 = g.factions.lattice.stock.energy;
    expect(runTradeRoutes(g, 'concord')).toBeCloseTo(v);
    expect(runTradeRoutes(g, 'lattice')).toBeCloseTo(v);
    expect(g.factions.concord.stock.energy).toBeCloseTo(c0 + v, 1);
    expect(g.factions.lattice.stock.energy).toBeCloseTo(l0 + v, 1);
  });

  it('needs a cargo ship, a trade agreement and a settled system', () => {
    const g = newGame('routes');
    const warship = fleetOf(g, 'concord', DESIGNS['lattice:tensor'], latticeHome(g));
    expect(establishRoute(g, warship).ok).toBe(false);
    const fid = fleetOf(g, 'concord', cargo(), latticeHome(g));
    g.relations[relationKey('concord', 'lattice')].contact = true;
    expect(establishRoute(g, fid).ok).toBe(false);
    partners(g);
    const empty = g.map.hexes.findIndex((h) => h.owner === 'lattice' && !h.system);
    g.fleets[fid].hex = empty;
    expect(establishRoute(g, fid).ok).toBe(false);
  });

  it('domestic routes need distance and pay less', () => {
    const g = newGame('routes');
    const near = g.map.hexes.findIndex((h) => h.owner === 'concord' && h.system && !h.system.homeOf);
    g.map.hexes[near].system!.development = 2;
    const fid = fleetOf(g, 'concord', cargo(), near);
    expect(establishRoute(g, fid).ok).toBe(false); // too close to home
  });

  it('is capped at 2 routes plus one per Trade Port', () => {
    const g = newGame('routes');
    partners(g);
    expect(routeCapacity(g, 'concord')).toBe(2);
    const targets = g.map.hexes.map((h, i) => i).filter((i) => g.map.hexes[i].owner === 'lattice' && g.map.hexes[i].system);
    for (const t of targets) g.map.hexes[t].system!.development = Math.max(2, g.map.hexes[t].system!.development);
    let opened = 0;
    for (const t of targets) if (establishRoute(g, fleetOf(g, 'concord', cargo(), t)).ok) opened++;
    expect(opened).toBe(2);
  });

  it('enemy warships on the path cut it, and raiders pocket the income', () => {
    const g = newGame('routes');
    partners(g);
    establishRoute(g, fleetOf(g, 'concord', cargo(), latticeHome(g)));
    const r = g.routes![0];
    setStatus(g, 'concord', 'ghaltar', 'war');
    fleetOf(g, 'ghaltar', DESIGNS['lattice:tensor'], r.path[Math.floor(r.path.length / 2)]);
    expect(routeDisruptors(g, r)).toEqual(['ghaltar']);
    const c0 = g.factions.concord.stock.energy, gh0 = g.factions.ghaltar.stock.energy;
    expect(runTradeRoutes(g, 'concord')).toBe(0);
    expect(g.factions.concord.stock.energy).toBe(c0);
    expect(g.factions.ghaltar.stock.energy).toBeGreaterThan(gh0);
  });

  it('war between the partners ends the route', () => {
    const g = newGame('routes');
    partners(g);
    establishRoute(g, fleetOf(g, 'concord', cargo(), latticeHome(g)));
    setStatus(g, 'concord', 'lattice', 'war');
    runTradeRoutes(g, 'concord');
    expect(g.routes).toHaveLength(0);
  });
});

describe('route options', () => {
  it('lists only partners you may trade with, best first, plus distant domestic links', () => {
    const g = newGame('route-options');
    const before = routeOptions(g, 'concord');
    expect(before.every((o) => o.partner === 'concord')).toBe(true);
    const other = Object.keys(g.factions).find((f) => f !== 'concord' && g.factions[f].kind === 'major')!;
    const key = relationKey('concord', other);
    g.relations[key].contact = true;
    g.relations[key].agreements.push('trade');
    const after = routeOptions(g, 'concord');
    expect(after.some((o) => o.partner === other)).toBe(true);
    for (let i = 1; i < after.length; i++) expect(after[i - 1].value).toBeGreaterThanOrEqual(after[i].value);
    setStatus(g, 'concord', other, 'war');
    expect(routeOptions(g, 'concord').some((o) => o.partner === other)).toBe(false);
  });
});

describe('every great power can run trade routes', () => {
  it('can queue a cargo ship at its home shipyard', () => {
    const g = newGame('routes-all');
    for (const id of MAJOR_IDS) {
      const d = firstDesign(id, (x) => x.role === 'cargo');
      g.factions[id].stock.metals = g.factions[id].stock.energy = 500;
      expect(checkBuild(g, id, g.factions[id].home, 'ship', d.id).ok, id).toBe(true);
    }
  });

  it('a Ryn’kai cargo ship opens a route at a trade partner', () => {
    const g = newGame('routes-rynkai');
    const r = g.relations[relationKey('concord', 'rynkai')];
    r.contact = true; r.status = 'relations'; r.agreements.push('trade');
    const fid = fleetOf(g, 'rynkai', firstDesign('rynkai', (d) => d.role === 'cargo'), g.factions.concord.home);
    expect(establishRoute(g, fid).ok).toBe(true);
    expect(g.routes![0].owner).toBe('rynkai');
  });
});
