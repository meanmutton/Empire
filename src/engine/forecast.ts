/**
 * Battle forecast (§7.4): how a fight in a hex looks from one faction's point of view, using only what it
 * knows. Your own and allied forces are known exactly. For enemies:
 *  - you only count fleets you can see (hidden or cloaked fleets are a nasty surprise);
 *  - without a scout watching (a ship of yours in the hex, or a scout, science or exploration ship within two
 *    hexes) you see only ship classes, and assume typical designs at full hull with green crews;
 *  - without a spy at their capital you assume their technology equals yours;
 *  - without both, you assume they fight on Engage.
 * The estimate is a force ratio (√ of firepower × durability, so twice the ships reads as 2.0), mapped to a
 * label that matches how often battles at that ratio are won (see test/forecast.test.ts).
 */
import { DESIGNS, type ShipDesign } from '../data/designs';
import { DOCTRINES, type DoctrineId } from '../data/doctrines';
import type { ShipClass, ShipStats } from '../data/ships';
import {
  collectParties, fleetDoctrine, fleetUnits, hostile, INDEPENDENT, partyMultiplier, screening, shieldEnv, unitFire, type Unit,
} from './combat';
import { hexDistance } from './hex';
import { intelLevel } from './intel';
import { relation } from './query';
import { techEffects } from './research';
import type { FactionId, GameState } from './types';
import { canSeeFleet, observers, visibleHexes } from './visibility';

export const FORECASTS = ['overwhelming', 'likely', 'even', 'unlikely', 'hopeless'] as const;
export type ForecastId = (typeof FORECASTS)[number];

export const FORECAST_NAMES: Record<ForecastId, string> = {
  overwhelming: 'Overwhelming victory',
  likely: 'Likely victory',
  even: 'Even fight',
  unlikely: 'Likely loss',
  hopeless: 'Hopeless cause',
};

/** Force ratio thresholds (mine ÷ theirs) for each label. */
const THRESHOLDS: [number, ForecastId][] = [[2.5, 'overwhelming'], [1.3, 'likely'], [0.77, 'even'], [0.4, 'unlikely']];

export function forecastFor(ratio: number): ForecastId {
  for (const [t, id] of THRESHOLDS) if (ratio >= t) return id;
  return 'hopeless';
}

export interface Forecast {
  label: ForecastId;
  /** Estimated force ratio, yours ÷ theirs. */
  ratio: number;
  /** How much of the enemy you can actually see and assess. */
  intel: 'good' | 'fair' | 'poor';
  /** What the estimate rests on, and what would sharpen it. */
  notes: string[];
}

const typical = new Map<ShipClass, ShipDesign>();

/** The average design of a class across all factions: what you assume when you only see a silhouette. */
function typicalDesign(d: ShipDesign): ShipDesign {
  let t = typical.get(d.cls);
  if (!t) {
    const all = Object.values(DESIGNS).filter((x) => x.cls === d.cls && x.role !== 'cargo' && x.role !== 'colony' && x.role !== 'constructor');
    const pool = all.length ? all : [d];
    const avg = (k: keyof ShipStats) => pool.reduce((a, x) => a + x.stats[k], 0) / pool.length;
    const stats = { ...d.stats };
    for (const k of Object.keys(stats) as (keyof ShipStats)[]) stats[k] = avg(k);
    t = { ...d, id: `typical:${d.cls}`, name: `unknown ${d.cls}`, role: 'line', stats };
    typical.set(d.cls, t);
  }
  return t;
}

const sightCache = new WeakMap<GameState, { key: string; vis: Set<number>; obs: ReturnType<typeof observers> }>();

/** What `viewer` sees, cached while nothing that changes it has moved (the AI asks many times a turn). */
function sight(state: GameState, viewer: FactionId): { vis: Set<number>; obs: ReturnType<typeof observers> } {
  let sig = 0, n = 0;
  for (const f of Object.values(state.fleets)) { sig = (sig * 31 + f.hex + 1) | 0; n++; }
  const key = `${viewer}:${state.seq}:${n}:${sig}:${Object.keys(state.starbases).length}`;
  const c = sightCache.get(state);
  if (c && c.key === key) return c;
  const fresh = { key, vis: visibleHexes(state, viewer), obs: observers(state, viewer) };
  sightCache.set(state, fresh);
  return fresh;
}

function scouted(state: GameState, viewer: FactionId, hex: number): boolean {
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== viewer) continue;
    if (f.hex === hex) return true;
    if (hexDistance(state.map, f.hex, hex) > 2) continue;
    if (f.ships.some((s) => { const r = DESIGNS[state.ships[s].design]?.role; return r === 'scout' || r === 'science' || r === 'explore'; })) return true;
  }
  return false;
}

/**
 * The forecast for a battle in `hex` if `extra` fleets of the viewer join (e.g. the fleet it is about to send).
 * Null when it can see no enemy there.
 */
export function battleForecast(state: GameState, viewer: FactionId, hex: number, extra: string[] = []): Forecast | null {
  const env = shieldEnv(state, hex);
  const { vis, obs } = sight(state, viewer);
  const seen = scouted(state, viewer, hex);
  const parties = collectParties(state, hex);
  const mine: Unit[] = [];
  const theirs: Unit[] = [];
  const doctrineOf = new Map<string, DoctrineId>();
  const myDoctrines = new Map<string, DoctrineId>();
  const notes: string[] = [];
  let guessedDesigns = false, guessedTech = false, hidden = false;
  const enemyFactions = new Set<FactionId>();
  // Viewer's own fleets joining from elsewhere.
  for (const id of extra) {
    const f = state.fleets[id];
    if (!f || f.owner !== viewer || f.hex === hex) continue;
    mine.push(...fleetUnits(state, f, env));
    myDoctrines.set(id, fleetDoctrine(f));
  }
  // Does anything the viewer brings provoke independents?
  const provokes = [...myDoctrines.values()].some((d) => DOCTRINES[d].provokes)
    || Object.values(state.fleets).some((f) => f.hex === hex && f.owner === viewer && DOCTRINES[fleetDoctrine(f)].provokes);
  for (const p of parties) {
    const f = p.faction;
    const ours = f === viewer || (f !== INDEPENDENT && relation(state, viewer, f).status === 'alliance');
    if (ours) {
      for (const u of p.units) {
        mine.push(u);
        if (u.fleet) myDoctrines.set(u.fleet, fleetDoctrine(state.fleets[u.fleet]));
      }
      continue;
    }
    const enemy = f === INDEPENDENT ? provokes : hostile(state, hex, viewer, f);
    if (!enemy) continue;
    const spies = f === INDEPENDENT || intelLevel(state, viewer, f) >= 1;
    const tech = spies ? undefined : techEffects(state, viewer);
    for (const u of p.units) {
      if (u.kind !== 'ship') {
        if (!vis.has(hex) && !seen) { hidden = true; continue; }
        theirs.push(u);
        enemyFactions.add(f);
        continue;
      }
      const fl = state.fleets[u.fleet!];
      if (!canSeeFleet(state, viewer, fl, vis, obs)) { hidden = true; continue; }
      enemyFactions.add(f);
      doctrineOf.set(fl.id, seen && spies ? fleetDoctrine(fl) : 'engage');
    }
    for (const fl of Object.values(state.fleets)) {
      if (fl.hex !== hex || fl.owner !== f || !doctrineOf.has(fl.id)) continue;
      if (!seen) guessedDesigns = true;
      if (!spies) guessedTech = true;
      theirs.push(...fleetUnits(state, fl, env, { tech, designOf: seen ? undefined : typicalDesign }));
    }
  }
  if (!theirs.length) return null;

  const power = (units: Unit[], foes: Unit[], docs: Map<string, DoctrineId>, factions: FactionId[], foeFactions: FactionId[]) => {
    const scr = screening(units, foes, env);
    const byFaction = new Map<FactionId, number>();
    for (const f of factions) {
      byFaction.set(f, partyMultiplier(state, hex, { faction: f }, foeFactions.map((x) => ({ faction: x })), !state.battles[hex], foes).mult);
    }
    let a = 0, d = 0;
    for (const u of units) {
      const doc = DOCTRINES[u.fleet ? docs.get(u.fleet) ?? 'engage' : 'engage'];
      const fixed = !u.fleet;
      a += unitFire(u, scr, null) * (byFaction.get(u.party) ?? 1) * (fixed ? 1 : doc.attack);
      d += (u.shieldPool + u.hull * u.tough) / (fixed ? 1 : doc.exposure);
    }
    return a * d;
  };
  const myFactions = [...new Set(mine.map((u) => u.party))];
  const sMine = power(mine, theirs, myDoctrines, myFactions, [...enemyFactions]);
  const sTheirs = power(theirs, mine, doctrineOf, [...enemyFactions], myFactions);
  const ratio = sTheirs > 0 ? Math.sqrt(sMine / sTheirs) : sMine > 0 ? 99 : 1;

  if (guessedDesigns) notes.push('Enemy designs are guessed from their ship classes: get a scout or a fleet within 2 hexes for an exact count.');
  if (guessedTech) notes.push('Enemy technology is assumed equal to yours: a spy at their capital would tell you.');
  if (!(seen && !guessedTech)) notes.push('Their combat doctrine is unknown (assumed Engage).');
  if (hidden) notes.push('Some enemy forces there are hidden from you.');
  notes.push('Battles are uncertain: luck, doctrine and events can turn even a lopsided fight.');
  const gaps = (guessedDesigns ? 1 : 0) + (guessedTech ? 1 : 0);
  return { label: forecastFor(ratio), ratio, intel: gaps === 0 ? 'good' : gaps === 1 ? 'fair' : 'poor', notes };
}
