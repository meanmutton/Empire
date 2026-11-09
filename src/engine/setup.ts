/** Creating a new game: choose minors, generate the map, set up factions, starting units and relations. */
import { BALANCE } from '../data/balance';
import { DESIGNS_BY_FACTION, type ShipDesign } from '../data/designs';
import { factionDef, hasAbility, MAJOR_IDS, MINOR_IDS } from '../data/factions';
import { emptyBits, setBits } from './bitset';
import { hexesWithin } from './hex';
import { newId, relationKey } from './ids';
import { generateMap } from './mapgen';
import { Rng, seedRng } from './rng';
import {
  STATE_SCHEMA_VERSION, type FactionId, type FactionState, type GameConfig, type GameState, type HumanSeat,
} from './types';

export interface NewGameOptions {
  seed: string;
  seats: HumanSeat[];
  width?: number;
  height?: number;
  /** Force a particular set of minors (otherwise 10 random). */
  minors?: FactionId[];
  minorCount?: number;
  turnLimit?: number | null;
  victory?: Partial<GameConfig['victory']>;
}

export const MAP_SIZES = {
  small: { width: 36, height: 22 },
  standard: { width: 50, height: 30 },
  huge: { width: 64, height: 40 },
} as const;

export function createGame(opts: NewGameOptions): GameState {
  if (opts.seats.length < 1 || opts.seats.length > 5) throw new Error('A game needs 1–5 human players.');
  const seen = new Set<string>();
  for (const s of opts.seats) {
    if (!MAJOR_IDS.includes(s.faction)) throw new Error(`${s.faction} is not a major faction.`);
    if (seen.has(s.faction)) throw new Error(`${s.faction} was picked twice.`);
    seen.add(s.faction);
  }
  const rngState = seedRng(opts.seed);
  const rng = new Rng(rngState);
  const minors = opts.minors ?? rng.shuffle(MINOR_IDS).slice(0, opts.minorCount ?? 10);
  const config: GameConfig = {
    width: opts.width ?? MAP_SIZES.standard.width,
    height: opts.height ?? MAP_SIZES.standard.height,
    seats: opts.seats,
    minors,
    victory: { conquest: true, domination: true, ascendance: true, alliance: true, ...opts.victory },
    dominationShare: 0.4,
    turnLimit: opts.turnLimit ?? null,
  };
  const all = [...MAJOR_IDS, ...minors];
  const gen = generateMap({ width: config.width, height: config.height, majors: MAJOR_IDS, minors }, rng);

  const state: GameState = {
    schema: STATE_SCHEMA_VERSION,
    id: `g-${opts.seed}`,
    seed: opts.seed,
    rng: rngState,
    config,
    turn: 1,
    turnOrder: rng.shuffle(all),
    active: 0,
    map: gen.map,
    factions: {},
    fleets: {},
    ships: {},
    armies: {},
    agents: {},
    starbases: {},
    relations: {},
    proposals: {},
    log: [],
    nextId: 0,
    winner: null,
  };

  for (const id of all) {
    const def = factionDef(id);
    const seat = opts.seats.find((s) => s.faction === id);
    const home = gen.homes[id];
    const explored = setBits(emptyBits(config.width * config.height), [
      ...gen.territory[id],
      ...hexesWithin(gen.map, home, def.kind === 'major' ? 5 : 3),
    ]);
    const f: FactionState = {
      id,
      kind: def.kind,
      controller: seat ? 'human' : 'ai',
      player: seat?.name ?? null,
      alive: true,
      stock: { ...(def.kind === 'major' ? BALANCE.startingStock : BALANCE.minorStartingStock) },
      research: { known: [], current: null, progress: 0 },
      home,
      overlord: null,
      explored,
      flags: {},
    };
    state.factions[id] = f;
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a, b] = [all[i], all[j]].sort();
      state.relations[relationKey(a, b)] = {
        a, b, contact: false, status: 'neutral', since: 1, embassyA: false, embassyB: false, agreements: [],
        opinionAB: baseOpinion(a, b), opinionBA: baseOpinion(b, a),
      };
    }
  }

  for (const id of all) addStartingUnits(state, id);
  return state;
}

function baseOpinion(from: FactionId, to: FactionId): number {
  let o = 0;
  if (hasAbility(to, 'prestige')) o += 20;
  if (from === 'mechanist' && to === 'lattice') o -= 50;
  return o;
}

function pickDesign(faction: FactionId, test: (d: ShipDesign) => boolean): ShipDesign | undefined {
  return DESIGNS_BY_FACTION[faction].filter(test).sort((a, b) => a.buildPoints - b.buildPoints)[0];
}

/** Adds a single-ship fleet (or a ship to an existing fleet). Returns the fleet id. */
export function spawnShip(state: GameState, faction: FactionId, d: ShipDesign, hex: number, fleetId?: string): string {
  let fid = fleetId;
  if (!fid) {
    fid = newId(state, 'f');
    state.fleets[fid] = {
      id: fid, owner: faction, name: '', hex, ships: [], movesLeft: d.stats.speed, path: [], stance: 'aggressive',
    };
  }
  const sid = newId(state, 's');
  state.ships[sid] = {
    id: sid, owner: faction, design: d.id, hull: d.stats.hull, fleet: fid, xp: 0,
    fighters: d.stats.hangar, cargo: [],
  };
  const fleet = state.fleets[fid];
  fleet.ships.push(sid);
  if (!fleet.name) fleet.name = d.name;
  return fid;
}

function addStartingUnits(state: GameState, faction: FactionId): void {
  const f = state.factions[faction];
  const home = f.home;
  const warship = pickDesign(faction, (d) => d.role === 'line' && d.cls !== 'fighter' && d.tech === null)
    ?? pickDesign(faction, (d) => d.cls !== 'fighter' && (d.stats.energy + d.stats.missile) > 0 && d.tech === null);
  if (f.kind === 'major') {
    const scout = pickDesign(faction, (d) => d.role === 'scout');
    const colony = pickDesign(faction, (d) => d.role === 'colony');
    const builder = pickDesign(faction, (d) => d.role === 'constructor');
    if (scout) spawnShip(state, faction, scout, home);
    if (scout) spawnShip(state, faction, scout, home);
    if (colony) spawnShip(state, faction, colony, home);
    if (builder) spawnShip(state, faction, builder, home);
    if (warship) {
      const fid = spawnShip(state, faction, warship, home);
      spawnShip(state, faction, warship, home, fid);
      state.fleets[fid].name = 'Home Guard';
    }
    const dip = newId(state, 'a');
    state.agents[dip] = {
      id: dip, owner: faction, kind: 'diplomat', hex: home, ship: null, path: [], target: null,
      mission: null, progress: 0, resident: false, capturedBy: null,
    };
    const spies = hasAbility(faction, 'stateSecurity') ? 2 : 0;
    for (let i = 0; i < spies; i++) {
      const id = newId(state, 'a');
      state.agents[id] = {
        id, owner: faction, kind: 'spy', hex: home, ship: null, path: [], target: null,
        mission: null, progress: 0, resident: false, capturedBy: null,
      };
    }
    const army = newId(state, 'r');
    state.armies[army] = { id: army, owner: faction, strength: BALANCE.army.strength, xp: 0, hex: home, ship: null };
  } else if (warship) {
    const fid = spawnShip(state, faction, warship, home);
    spawnShip(state, faction, warship, home, fid);
    state.fleets[fid].name = 'Home Guard';
  }
}
