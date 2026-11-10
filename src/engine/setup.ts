/** Creating a new game: choose minors, generate the map, set up factions, starting units and relations. */
import { applyAdvancedStart } from './advanced-start';
import { DEFAULT_COMBAT_ROUNDS, MAX_COMBAT_ROUNDS, MIN_COMBAT_ROUNDS } from '../data/doctrines';
import { BALANCE } from '../data/balance';
import { DESIGNS_BY_FACTION, type ShipDesign } from '../data/designs';
import { colorDistance, factionDef, hasAbility, MAJOR_IDS, MIN_COLOR_DISTANCE, MINOR_IDS } from '../data/factions';
import { emptyBits, setBits } from './bitset';
import { hexesWithin } from './hex';
import { newId, relationKey } from './ids';
import { generateMap } from './mapgen';
import { DEFAULT_TURN_LIMIT, PRESETS, type PresetId } from '../data/victories';
import { refreshOffers } from './mercenaries';
import { grantTech } from './research';
import { TECHS } from '../data/techs';
import { Rng, seedRng } from './rng';
import { defaultLeader } from '../data/leaders';
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
  /** Victory preset (default Classic). Peaceful games leave the Ryn'kai out. */
  preset?: PresetId;
  /** Default 200 rounds; null for no limit. */
  turnLimit?: number | null;
  /** Combat rounds per battle (3–10, default 5). */
  combatRounds?: number;
}

export const MAP_SIZES = {
  small: { width: 36, height: 22 },
  standard: { width: 50, height: 30 },
  huge: { width: 64, height: 40 },
} as const;

export function createGame(opts: NewGameOptions): GameState {
  const preset = opts.preset ?? 'classic';
  const majors = PRESETS[preset].majors;
  if (opts.seats.length < 1 || opts.seats.length > majors.length) throw new Error(`A game needs 1–${majors.length} human players.`);
  const seen = new Set<string>();
  for (const s of opts.seats) {
    if (!MAJOR_IDS.includes(s.faction)) throw new Error(`${s.faction} is not a major faction.`);
    if (!majors.includes(s.faction)) throw new Error(`The ${factionDef(s.faction).name} are not in ${PRESETS[preset].name} games.`);
    if (seen.has(s.faction)) throw new Error(`${s.faction} was picked twice.`);
    seen.add(s.faction);
  }
  const rngState = seedRng(opts.seed);
  const rng = new Rng(rngState);
  const minors = opts.minors ?? pickMinors(rng, opts.minorCount ?? 10, majors);
  const config: GameConfig = {
    width: opts.width ?? MAP_SIZES.standard.width,
    height: opts.height ?? MAP_SIZES.standard.height,
    seats: opts.seats,
    minors,
    preset,
    majors,
    turnLimit: opts.turnLimit === undefined ? DEFAULT_TURN_LIMIT : opts.turnLimit,
    combatRounds: Math.max(MIN_COMBAT_ROUNDS, Math.min(MAX_COMBAT_ROUNDS, Math.round(opts.combatRounds ?? DEFAULT_COMBAT_ROUNDS))),
  };
  const all = [...majors, ...minors];
  const gen = generateMap({ width: config.width, height: config.height, majors, minors }, rng);

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
    payments: [],
    log: [],
    battles: {},
    seq: 0,
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
    if (def.kind === 'major') f.leader = seat?.leader ?? defaultLeader(opts.seed, id);
    state.factions[id] = f;
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a, b] = [all[i], all[j]].sort();
      state.relations[relationKey(a, b)] = {
        a, b, contact: false, status: 'neutral', since: 1, embassyA: false, embassyB: false, agreements: [], aggressor: null,
        opinionAB: baseOpinion(a, b), opinionBA: baseOpinion(b, a),
      };
    }
  }

  for (const id of all) addStartingUnits(state, id);
  for (const id of all) {
    if (hasAbility(id, 'fortressWorlds')) state.map.hexes[state.factions[id].home].system!.defense *= 2;
  }
  for (const id of all) {
    if (hasAbility(id, 'ancientArchives')) {
      const tier1 = TECHS.filter((t) => t.tier <= 2 && t.requires.length === 0);
      for (const t of rng.shuffle(tier1).slice(0, 3)) grantTech(state, id, t.id);
    }
  }
  // Total War starts with the galaxy already carved up (§10.5).
  if (preset === 'totalWar') {
    applyAdvancedStart(state, rng);
    state.log = [];
  }
  refreshOffers(state);
  return state;
}

/** Picks minors at random, skipping any whose color is too close to a faction already in the game. */
function pickMinors(rng: Rng, count: number, majors: FactionId[]): FactionId[] {
  const chosen: FactionId[] = [];
  const colors = majors.map((m) => factionDef(m).color);
  for (const threshold of [MIN_COLOR_DISTANCE, 30, 0]) {
    for (const m of rng.shuffle(MINOR_IDS)) {
      if (chosen.length >= count) break;
      if (chosen.includes(m)) continue;
      const c = factionDef(m).color;
      if (colors.every((x) => colorDistance(x, c) >= threshold)) {
        chosen.push(m);
        colors.push(c);
      }
    }
    if (chosen.length >= count) break;
  }
  return chosen;
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
      id: fid, owner: faction, name: '', hex, ships: [], movesLeft: d.stats.speed, path: [],
      doctrine: d.stats.energy + d.stats.missile + d.stats.hangar > 0 && d.role !== 'scout' ? (hasAbility(faction, 'wayOfTheBlade') ? 'fullAttack' : 'engage') : (hasAbility(faction, 'wayOfTheBlade') ? 'cautious' : 'retreat'),
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
