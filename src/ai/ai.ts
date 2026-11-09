/**
 * Computer players. Each turn a computer faction researches, negotiates, builds, explores, colonizes,
 * claims territory and fights according to its personality (src/data/factions.ts). Every order goes through
 * applyAction, so the AI obeys exactly the same rules as humans.
 */
import { BALANCE } from '../data/balance';
import { design, DESIGNS_BY_FACTION, type ShipDesign } from '../data/designs';
import { factionDef, hasAbility, type Personality } from '../data/factions';
import { IMPROVEMENTS, PLANET_YIELDS } from '../data/improvements';
import { CLASSES, ROLES } from '../data/ships';
import { TECH_BY_ID, type TechField } from '../data/techs';
import { applyAction, type Action } from '../engine/actions';
import { talkEnd, talkStart } from './talk';
import { offersFor } from '../engine/mercenaries';
import { routeCapacity, routesOf } from '../engine/routes';
import { perceivedThreat } from '../engine/intel';
import { availableVictories, score } from '../engine/victory';
import { armiesNeeded, campaignTarget, defenseAt, gatheredPower, isRunaway, spyTarget, stagingHex, starbaseSite, warsAgainst } from './strategy';
import { say } from './voice';
import { hasEmbassy, opinionOf } from '../engine/agents';
import { getBit } from '../engine/bitset';
import { canPropose, militaryStrength, proposalScore, sharedEnemies } from '../engine/diplomacy';
import { checkBuild, factionIncome, rushCost, slotsOf } from '../engine/economy';
import { cargoFree } from '../engine/ground';
import { hexDistance, hexesWithin, neighbors } from '../engine/hex';
import { planPath } from '../engine/movement';
import { atWar, ownedHexes, relation } from '../engine/query';
import { availableTechs } from '../engine/research';
import { Rng } from '../engine/rng';
import type { FactionId, Fleet, GameState } from '../engine/types';

export interface AiOptions {
  /** Caretaker mode for absent humans: defend and build, no diplomacy or new wars. */
  caretaker?: boolean;
}

type FleetKind = 'scout' | 'colony' | 'constructor' | 'transport' | 'war' | 'civil';

interface Ctx {
  state: GameState;
  me: FactionId;
  p: Personality;
  rng: Rng;
  major: boolean;
  caretaker: boolean;
  enemies: FactionId[];
  /** Net energy per turn after upkeep. */
  netEnergy: number;
  /** The system the war effort concentrates on this turn (see strategy.ts). */
  campaign: number | null;
  reserved: Set<number>;
  owned: Set<number>;
  home: number;
}

function act(ctx: Ctx, action: Action): boolean {
  return applyAction(ctx.state, ctx.me, action).ok;
}

export function aiTurn(state: GameState, me: FactionId, opts: AiOptions = {}): void {
  const f = state.factions[me];
  if (!f.alive) return;
  const ctx: Ctx = {
    state, me, p: factionDef(me).personality, rng: new Rng(state.rng), major: f.kind === 'major',
    caretaker: !!opts.caretaker,
    enemies: Object.keys(state.factions).filter((o) => o !== me && state.factions[o].alive && atWar(state, me, o)),
    netEnergy: factionIncome(state, me).net.energy,
    campaign: null,
    reserved: new Set(), owned: new Set(ownedHexes(state, me)), home: f.home,
  };
  research(ctx);
  if (!ctx.caretaker) talkStart(state, me);
  if (!ctx.caretaker) {
    answerProposals(ctx);
    diplomacy(ctx);
  }
  if (ctx.major && !ctx.caretaker) ctx.campaign = campaignTarget(state, me, ctx.enemies);
  powers(ctx);
  trade(ctx);
  build(ctx);
  rush(ctx);
  agents(ctx);
  fleets(ctx);
  if (!ctx.caretaker) talkEnd(state, me);
}

// ---------------------------------------------------------------------------------------------------------
// Research

function research(ctx: Ctx): void {
  const r = ctx.state.factions[ctx.me].research;
  if (r.current) return;
  const options = availableTechs(ctx.state, ctx.me);
  if (options.length === 0) return;
  const w: Record<TechField, number> = {
    weapons: 0.5 + ctx.p.aggression,
    defense: 0.6 + (1 - ctx.p.aggression) * 0.5,
    construction: 0.9 + ctx.p.expansion * 0.5,
    propulsion: 0.4 + ctx.p.expansion * 0.4,
    society: 0.5 + ctx.p.diplomacy * 0.5,
    computing: 0.4 + ctx.p.science * 0.6 + ctx.p.espionage * 0.3,
  };
  let best = options[0], bestScore = -Infinity;
  for (const id of options) {
    const t = TECH_BY_ID[id];
    let s = w[t.field] * 10 - t.tier * 4 + ctx.rng.float(0, 3);
    if (id.startsWith('hull') || id === 'starbase1') s += 6;
    if (id === 'ascension') s += 30 * ctx.p.science;
    if (s > bestScore) { bestScore = s; best = id; }
  }
  act(ctx, { type: 'research', tech: best });
}

// ---------------------------------------------------------------------------------------------------------
// Diplomacy

function answerProposals(ctx: Ctx): void {
  for (const p of Object.values(ctx.state.proposals)) {
    if (p.to !== ctx.me || p.answer) continue;
    const score = proposalScore(ctx.state, p);
    const ok = act(ctx, { type: score > 0 ? 'accept' : 'reject', proposal: p.id }) && score > 0;
    if (ctx.state.factions[p.from].controller === 'human' && ctx.major) {
      const gift = ok && p.receive.length === 0 && p.give.some((i) => i.kind === 'resource' || i.kind === 'tech');
      say(ctx.state, ctx.me, p.from, gift ? 'gift' : ok ? 'accept' : 'reject');
    }
  }
}

function diplomacy(ctx: Ctx): void {
  const { state, me, p } = ctx;
  const others = Object.keys(state.factions).filter((o) => o !== me && state.factions[o].alive);
  const myStrength = militaryStrength(state, me);
  const pending = new Set(Object.values(state.proposals).filter((x) => x.from === me && !x.answer).map((x) => x.to));

  for (const o of others) {
    const r = relation(state, me, o);
    if (!r.contact || pending.has(o) || !canPropose(state, me, o)) continue;
    const op = opinionOf(state, me, o);
    const theirs = militaryStrength(state, o);
    // Peace when losing or tired of war.
    if (r.status === 'war') {
      const losing = theirs > myStrength * 1.3;
      if ((losing || state.turn - r.since > 15 + p.aggression * 20) && ctx.rng.chance(0.3)) {
        act(ctx, { type: 'propose', to: o, give: [{ kind: 'status', status: 'relations' }], receive: [] });
      }
      continue;
    }
    if (!ctx.rng.chance(0.25)) continue;
    const want = (['trade', 'research', 'economic', 'openBorders'] as const).filter((a) => !r.agreements.includes(a));
    if (want.length && op >= -10 && p.diplomacy > 0.3) {
      act(ctx, { type: 'propose', to: o, give: [{ kind: 'agreement', agreement: ctx.rng.pick(want) }], receive: [] });
      continue;
    }
    if (ctx.major && r.status === 'relations' && op > 15 && p.diplomacy > 0.5) {
      act(ctx, { type: 'propose', to: o, give: [{ kind: 'status', status: 'nap' }], receive: [] });
      continue;
    }
    if (ctx.major && (r.status === 'nap' || r.status === 'relations') && op > 30 && sharedEnemies(state, me, o) > 0) {
      act(ctx, { type: 'propose', to: o, give: [{ kind: 'status', status: 'alliance' }], receive: [] });
      continue;
    }
    if (ctx.major && state.factions[o].kind === 'minor' && !state.factions[o].overlord && myStrength > theirs * 3) {
      act(ctx, { type: 'propose', to: o, give: [{ kind: 'resource', resource: 'energy', amount: Math.min(60, Math.floor(state.factions[me].stock.energy / 3)) }], receive: [{ kind: 'vassal' }] });
    }
  }

  // War decisions (majors; minors only very aggressive ones, rarely).
  if (!ctx.major && p.aggression < 0.85) return;
  if (ctx.enemies.length >= (ctx.major ? 2 : 1)) return;
  if (state.turn < 12) return;
  const period = hasAbility(me, 'distributedCognition') ? 5 : 4;
  if ((state.turn + me.length) % period !== 0) return;
  let target: FactionId | null = null, bestRatio = 0;
  for (const o of others) {
    const r = relation(state, me, o);
    if (!r.contact || r.status === 'war' || state.factions[o].overlord === me || state.factions[me].overlord) continue;
    if (!bordersOn(ctx, o, 6)) continue;
    if ((state.factions[me].flags[`cowed:${o}`] ?? 0) > state.turn) continue;
    const treaty = r.status === 'nap' || r.status === 'alliance';
    if (treaty && (hasAbility(me, 'honorBound') || ctx.rng.next() > p.treachery * 0.5)) continue;
    const ratio = myStrength / Math.max(1, militaryStrength(state, o));
    const op = opinionOf(state, me, o);
    // A rival known (through spies) to be close to winning, or running away with the game, is a tempting
    // target; one already fighting two great powers is left alone (no pile-ons).
    const threat = perceivedThreat(state, me, o);
    const runaway = state.factions[o].kind === 'major' && isRunaway(state, o);
    if (warsAgainst(state, o) >= 2 && threat < 0.7 && !runaway) continue;
    const need = 2.2 - p.aggression * 1.2 + op / 100 - (threat >= 0.7 ? 0.8 : 0) - (runaway ? 0.5 : 0);
    if (ratio > need && ratio > bestRatio) { bestRatio = ratio; target = o; }
  }
  const lattice = hasAbility(me, 'distributedCognition') ? ctx.rng.chance(0.5) : true;
  if (target && lattice) act(ctx, { type: 'declareWar', target });
}

function bordersOn(ctx: Ctx, other: FactionId, dist: number): boolean {
  const theirs = ownedHexes(ctx.state, other);
  const home = ctx.home;
  return theirs.some((h) => hexDistance(ctx.state.map, h, home) <= dist + 8) &&
    theirs.some((h) => [...ctx.owned].some((m) => hexDistance(ctx.state.map, h, m) <= dist));
}

function powers(ctx: Ctx): void {
  const f = ctx.state.factions[ctx.me];
  if (hasAbility(ctx.me, 'fiveYearPlan') && (f.flags.planReadyAt ?? 0) <= ctx.state.turn) {
    act(ctx, { type: 'fiveYearPlan', resource: ctx.enemies.length ? 'metals' : 'science' });
  }
  if (hasAbility(ctx.me, 'totalMobilization')) {
    if (ctx.enemies.length && !f.flags.mobilized) act(ctx, { type: 'mobilize', on: true });
    if (!ctx.enemies.length && f.flags.mobilized && !f.flags.demobilizeAt) act(ctx, { type: 'mobilize', on: false });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Building

function classifyFleet(state: GameState, fl: Fleet): FleetKind {
  const roles = fl.ships.map((s) => design(state.ships[s].design).role);
  if (roles.includes('colony')) return 'colony';
  if (roles.includes('constructor')) return 'constructor';
  if (roles.some((r) => r === 'transport') || fl.ships.some((s) => state.ships[s].cargo.some((c) => state.armies[c]))) return 'transport';
  if (roles.every((r) => r === 'scout' || r === 'explore' || r === 'science')) return 'scout';
  if (roles.every((r) => r === 'cargo')) return 'civil';
  return 'war';
}

function myFleets(ctx: Ctx, kind?: FleetKind): Fleet[] {
  return Object.values(ctx.state.fleets).filter((f) => f.owner === ctx.me && (!kind || classifyFleet(ctx.state, f) === kind));
}

function pickDesign(ctx: Ctx, hex: number, test: (d: ShipDesign) => boolean, biggest = false): ShipDesign | null {
  const options = DESIGNS_BY_FACTION[ctx.me].filter((d) => d.cls !== 'fighter' && test(d) && checkBuild(ctx.state, ctx.me, hex, 'ship', d.id).ok);
  if (options.length === 0) return null;
  const stock = ctx.state.factions[ctx.me].stock;
  const affordable = options.filter((d) => d.cost.metals <= stock.metals - 10 && d.cost.energy <= stock.energy - 10 && d.cost.exotics <= stock.exotics);
  if (affordable.length === 0) return null;
  affordable.sort((a, b) => (biggest ? CLASSES[b.cls].size - CLASSES[a.cls].size : CLASSES[a.cls].size - CLASSES[b.cls].size));
  if (biggest) {
    // Mix in the occasional escort or carrier.
    const roll = ctx.rng.next();
    const alt = affordable.find((d) => (roll < 0.2 && d.role === 'escort') || (roll >= 0.2 && roll < 0.35 && d.role === 'carrier'));
    if (alt) return alt;
  }
  return affordable[0];
}

function build(ctx: Ctx): void {
  const { state, me } = ctx;
  const f = state.factions[me];
  const systems = ownedHexes(state, me).filter((h) => state.map.hexes[h].system && state.map.hexes[h].system!.development > 0);
  const fleets = myFleets(ctx);
  const count = (k: FleetKind) => fleets.filter((x) => classifyFleet(state, x) === k).length;
  const queued = (role: string) => systems.reduce((a, h) => a + state.map.hexes[h].system!.queue.filter((q) => q.kind === 'ship' && design(q.item).role === role).length, 0);
  const colonyTargets = ctx.major ? findColonyTargets(ctx, true).length : 0;
  const outpostTargets = findColonyTargets(ctx, false).length;
  const warStrength = fleets.filter((x) => classifyFleet(state, x) === 'war').reduce((a, x) => a + x.ships.length, 0);
  const wantWarships = Math.round((ctx.major ? 6 : 3) + state.turn * (ctx.major ? 0.25 : 0.06) * (0.5 + ctx.p.aggression) + ctx.enemies.length * 6);
  const armies = Object.values(state.armies).filter((a) => a.owner === me).length;

  for (const hex of systems) {
    const sys = state.map.hexes[hex].system!;
    if (sys.queue.length > 0) continue;
    const yard = sys.improvements.includes('shipyard') || sys.improvements.includes('heavyShipyard');
    const tryBuild = (a: Action) => act(ctx, a);
    if (yard) {
      if (ctx.major && count('scout') + queued('scout') < (state.turn < 40 ? 2 : 1)) {
        const d = pickDesign(ctx, hex, (x) => x.role === 'scout' || x.role === 'explore');
        if (d && tryBuild({ type: 'build', hex, kind: 'ship', item: d.id })) continue;
      }
      if (ctx.major && colonyTargets > 0 && count('colony') + queued('colony') < 2) {
        const d = pickDesign(ctx, hex, (x) => x.role === 'colony');
        if (d && tryBuild({ type: 'build', hex, kind: 'ship', item: d.id })) continue;
      }
      if (outpostTargets > 0 && count('constructor') + queued('constructor') < (ctx.major ? 2 : 0)) {
        const d = pickDesign(ctx, hex, (x) => x.role === 'constructor');
        if (d && tryBuild({ type: 'build', hex, kind: 'ship', item: d.id })) continue;
      }
      if (ctx.major && routesOf(state, me).length + count('civil') + queued('cargo') < routeCapacity(state, me) && routeTargets(ctx).length) {
        const d = pickDesign(ctx, hex, (x) => x.role === 'cargo');
        if (d && tryBuild({ type: 'build', hex, kind: 'ship', item: d.id })) continue;
      }
      // Invasion forces sized to the campaign target's defenders.
      const campaignEnemy = ctx.campaign !== null && state.map.hexes[ctx.campaign].owner !== null && ctx.enemies.includes(state.map.hexes[ctx.campaign].owner!);
      const wantArmies = campaignEnemy ? Math.min(8, armiesNeeded(state, me, ctx.campaign!)) : ctx.enemies.length ? 2 : 0;
      const transportsWanted = wantArmies ? Math.max(1, Math.ceil(wantArmies / 4)) : 0;
      if (ctx.major && count('transport') + queued('transport') < transportsWanted) {
        const d = pickDesign(ctx, hex, (x) => x.role === 'transport' || x.role === 'cargo', true);
        if (d && tryBuild({ type: 'build', hex, kind: 'ship', item: d.id })) continue;
      }
      if (ctx.major && armies < wantArmies && sys.population >= 3) {
        if (tryBuild({ type: 'build', hex, kind: 'army', item: '' })) continue;
      }
      // Warships, as long as the energy economy can carry their upkeep.
      if ((warStrength < wantWarships || f.stock.metals > 300) && ctx.netEnergy > 2) {
        const d = pickDesign(ctx, hex, (x) => x.role === 'line' || x.role === 'escort' || x.role === 'carrier' || x.role === 'raider', true);
        if (d && d.upkeep < ctx.netEnergy - 1 && tryBuild({ type: 'build', hex, kind: 'ship', item: d.id })) {
          ctx.netEnergy -= d.upkeep;
          continue;
        }
      }
    }
    // Improvements and development.
    if (sys.improvements.length < slotsOf(sys)) {
      const imp = chooseImprovement(ctx, hex);
      if (imp && tryBuild({ type: 'build', hex, kind: 'improvement', item: imp })) continue;
    }
    if (sys.development < Math.min(5, sys.size + 1) && f.stock.metals > 60) {
      if (tryBuild({ type: 'build', hex, kind: 'develop', item: '' })) continue;
    }
    if (ctx.major && f.flags.ascensionGate === undefined && sys.homeOf === me) {
      if (checkBuild(state, me, hex, 'wonder', 'ascensionGate').ok) tryBuild({ type: 'build', hex, kind: 'wonder', item: 'ascensionGate' });
    }
    if (ctx.major && f.stock.energy > 120 && Object.values(state.agents).filter((a) => a.owner === me && a.kind === 'diplomat' && !a.capturedBy).length < 2 && sys.homeOf === me) {
      tryBuild({ type: 'build', hex, kind: 'diplomat', item: '' });
    } else if (ctx.major && ctx.p.espionage > 0.5 && f.stock.energy > 150 && Object.values(state.agents).filter((a) => a.owner === me && a.kind === 'spy').length < 3 && sys.homeOf === me) {
      tryBuild({ type: 'build', hex, kind: 'spy', item: '' });
    }
  }
}

/** Covers shortages on the galactic exchange from a big surplus of something else. */
function trade(ctx: Ctx): void {
  const s = ctx.state.factions[ctx.me].stock;
  const spare = 200 + ctx.state.turn * 2;
  if (s.metals < 60 && s.energy > spare + 100) act(ctx, { type: 'exchange', sell: 'energy', buy: 'metals', amount: Math.min(200, s.energy - spare) });
  else if (s.energy < 40 && s.metals > 300) act(ctx, { type: 'exchange', sell: 'metals', buy: 'energy', amount: 120 });
  if (s.exotics < 15 && ctx.state.factions[ctx.me].research.known.includes('hull4') && s.energy > spare + 150) {
    act(ctx, { type: 'exchange', sell: 'energy', buy: 'exotics', amount: 150 });
  }
  if (!ctx.major) return;
  // Mercenaries: ships and armies in wartime, star charts now and then.
  const offers = offersFor(ctx.state, ctx.me).filter((x) => x.check.ok).map((x) => x.offer).sort((a, b) => a.price - b.price);
  const armies = Object.values(ctx.state.armies).filter((a) => a.owner === ctx.me).length;
  for (const o of offers) {
    const energy = ctx.state.factions[ctx.me].stock.energy;
    if (o.kind === 'ship' && ctx.enemies.length && energy - o.price > spare) act(ctx, { type: 'buyOffer', offer: o.id });
    else if (o.kind === 'army' && ctx.enemies.length && armies < 3 && energy - o.price > 150) act(ctx, { type: 'buyOffer', offer: o.id });
    else if (o.kind === 'charts' && energy - o.price > spare && ctx.state.turn % 15 === 0) act(ctx, { type: 'buyOffer', offer: o.id });
  }
}

/** Spends surplus energy finishing builds early. */
function rush(ctx: Ctx): void {
  const { state, me } = ctx;
  const stock = state.factions[me].stock;
  const reserve = 150 + state.turn * 2;
  const heads = ownedHexes(state, me).filter((h) => state.map.hexes[h].system?.queue.length)
    .map((h) => ({ h, c: rushCost(state, h) })).sort((a, b) => a.c - b.c);
  for (const { h, c } of heads) {
    if (stock.energy - c < reserve) break;
    act(ctx, { type: 'rush', hex: h });
  }
}

function chooseImprovement(ctx: Ctx, hex: number): string | null {
  const sys = ctx.state.map.hexes[hex].system!;
  const has = (i: string) => sys.improvements.includes(i);
  const order: string[] = [];
  const p = PLANET_YIELDS[sys.planet];
  if (sys.development >= 3 && !has('shipyard') && ownedHexes(ctx.state, ctx.me).filter((h) => ctx.state.map.hexes[h].system?.improvements.includes('shipyard')).length < 3) order.push('shipyard');
  if (sys.development >= 4 && !has('heavyShipyard')) order.push('heavyShipyard');
  if (sys.development === 5 && availableVictories(ctx.state, ctx.me).includes('singularity')) order.push('lab');
  if (p.metals >= p.energy && p.metals >= p.science) order.push('mine', 'powerPlant', 'lab');
  else if (p.science >= p.energy) order.push('lab', 'mine', 'powerPlant');
  else order.push('powerPlant', 'mine', 'lab');
  order.push('refinery', 'habitat', 'planetShield', 'garrison', 'tradePort', 'academy');
  for (const id of order) {
    if (IMPROVEMENTS[id].unique && has(id)) continue;
    if (checkBuild(ctx.state, ctx.me, hex, 'improvement', id).ok) {
      const c = IMPROVEMENTS[id].cost;
      const s = ctx.state.factions[ctx.me].stock;
      if (c.metals <= s.metals - 20 && c.energy <= s.energy - 10) return id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Agents

function agents(ctx: Ctx): void {
  const { state, me } = ctx;
  // Spy roles: the first watches the strongest rival's capital (intelligence on its victory progress); with
  // three or more, the last guards home against enemy watchers.
  const spies = Object.values(state.agents).filter((a) => a.owner === me && a.kind === 'spy' && !a.capturedBy && !a.ship).sort((x, y) => x.id.localeCompare(y.id));
  const rival = ctx.major ? Object.values(state.factions).filter((f) => f.kind === 'major' && f.alive && f.id !== me && relation(state, me, f.id).contact && relation(state, me, f.id).status !== 'alliance')
    .sort((x, y) => score(state, y.id) - score(state, x.id))[0] : undefined;
  const watcher = rival ? spies[0] : undefined;
  const guard = spies.length >= 3 ? spies[spies.length - 1] : undefined;
  if (watcher && !ctx.caretaker) {
    if (watcher.hex !== rival!.home && !watcher.path.length) act(ctx, { type: 'moveAgent', agent: watcher.id, to: rival!.home });
  }
  if (guard && guard.hex !== ctx.home && !guard.path.length && !guard.mission) act(ctx, { type: 'moveAgent', agent: guard.id, to: ctx.home });
  for (const a of Object.values(state.agents)) {
    if (a.owner !== me || a.capturedBy || a.ship || a.resident) continue;
    if (a === watcher || a === guard) continue;
    if (a.kind === 'diplomat') {
      if (a.path.length) continue;
      const targets = Object.keys(state.factions).filter((o) => o !== me && state.factions[o].alive && relation(state, me, o).contact
        && relation(state, me, o).status !== 'war' && !hasEmbassy(state, me, o)
        && !Object.values(state.agents).some((x) => x.owner === me && x.kind === 'diplomat' && x.target === o));
      targets.sort((x, y) => hexDistance(state.map, a.hex, state.factions[x].home) - hexDistance(state.map, a.hex, state.factions[y].home)
        || (state.factions[y].kind === 'major' ? 1 : 0) - (state.factions[x].kind === 'major' ? 1 : 0));
      if (targets.length) act(ctx, { type: 'sendDiplomat', agent: a.id, target: targets[0] });
    } else if (!ctx.caretaker) {
      if (a.mission) continue;
      if (a.path.length) continue;
      // Work the most valuable target in reach: shipyards of enemies, techs we lack, unrest for the Krasnyr.
      const t = spyTarget(state, me, a.hex, ctx.enemies);
      if (!t) continue;
      if (a.hex === t.hex) {
        if (!act(ctx, { type: 'mission', agent: a.id, mission: t.mission })) act(ctx, { type: 'mission', agent: a.id, mission: 'incite' });
      } else {
        act(ctx, { type: 'moveAgent', agent: a.id, to: t.hex });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Fleets

function findColonyTargets(ctx: Ctx, habitable: boolean): number[] {
  const { state, me } = ctx;
  const f = state.factions[me];
  const radius = ctx.major ? 14 : 2;
  const out: { h: number; s: number }[] = [];
  for (const h of hexesWithin(state.map, ctx.home, radius)) {
    const hx = state.map.hexes[h];
    const sys = hx.system;
    if (!sys || sys.development > 0 || (hx.owner && hx.owner !== me)) continue;
    if (!getBit(f.explored, h)) continue;
    const pc = PLANET_YIELDS[sys.planet].popCap;
    if (habitable !== pc >= 4) continue;
    if (Object.values(state.fleets).some((x) => x.hex === h && atWar(state, me, x.owner))) continue;
    const near = [...ctx.owned].some((o) => hexDistance(state.map, o, h) <= (ctx.major ? 4 : 2));
    if (!near) continue;
    out.push({ h, s: pc * 3 + sys.size * 2 - hexDistance(state.map, ctx.home, h) });
  }
  return out.sort((a, b) => b.s - a.s).map((x) => x.h);
}

function moveTo(ctx: Ctx, fl: Fleet, dest: number): boolean {
  if (fl.hex === dest) return true;
  if (!planPath(ctx.state, fl.id, dest)) return false;
  return act(ctx, { type: 'move', fleet: fl.id, to: dest });
}

function fleetPower(state: GameState, fl: Fleet): number {
  return fl.ships.reduce((a, s) => {
    const d = design(state.ships[s].design).stats;
    return a + (d.energy + d.missile + d.hangar * 4) * Math.sqrt(state.ships[s].hull + d.shields * 3);
  }, 0);
}

function powerAt(state: GameState, hex: number, owners: (o: FactionId) => boolean): number {
  let p = 0;
  for (const fl of Object.values(state.fleets)) if (fl.hex === hex && owners(fl.owner)) p += fleetPower(state, fl);
  const sys = state.map.hexes[hex].system;
  const o = state.map.hexes[hex].owner;
  if (sys && sys.defense > 0 && o && owners(o)) p += sys.defense * BALANCE.defenseAttackPerPoint * Math.sqrt(sys.defense * 5) * 0.8;
  return p;
}

function fleets(ctx: Ctx): void {
  const { state, me } = ctx;
  const f = state.factions[me];
  // Merge idle war fleets sharing a hex into battle groups.
  const byHex = new Map<number, Fleet[]>();
  for (const fl of myFleets(ctx, 'war')) {
    const list = byHex.get(fl.hex) ?? [];
    list.push(fl);
    byHex.set(fl.hex, list);
  }
  for (const list of byHex.values()) {
    list.sort((a, b) => b.ships.length - a.ships.length);
    for (let i = 0; i < list.length; i++) {
      for (let j = list.length - 1; j > i; j--) {
        if (!state.fleets[list[i].id] || !state.fleets[list[j].id]) continue;
        if (list[i].ships.length + list[j].ships.length <= BALANCE.maxShipsPerFleet) act(ctx, { type: 'merge', into: list[i].id, from: list[j].id });
      }
    }
  }

  const unexplored: number[] = [];
  for (let h = 0; h < state.map.hexes.length; h++) if (!getBit(f.explored, h) && state.map.hexes[h].terrain !== 'blackHole') unexplored.push(h);

  const colonyTargets = findColonyTargets(ctx, true);
  const outpostTargets = [...findColonyTargets(ctx, false), ...colonyTargets.slice(2)];

  for (const fl of Object.values(state.fleets)) {
    if (fl.owner !== me || !state.fleets[fl.id]) continue;
    // Promised to stay out of someone's territory.
    const host = state.map.hexes[fl.hex].owner;
    if (host && host !== me && (f.flags[`withdraw:${host}`] ?? 0) > state.turn && !atWar(state, me, host)) {
      moveTo(ctx, fl, ctx.home);
      continue;
    }
    const kind = classifyFleet(state, fl);
    if (!ctx.major && kind !== 'war') {
      if (kind === 'constructor') constructor(ctx, fl, outpostTargets);
      continue;
    }
    switch (kind) {
      case 'scout': scout(ctx, fl, unexplored); break;
      case 'colony': colonyShip(ctx, fl, colonyTargets); break;
      case 'constructor': constructor(ctx, fl, outpostTargets); break;
      case 'transport': transport(ctx, fl); break;
      case 'war': warFleet(ctx, fl); break;
      case 'civil': tradeShip(ctx, fl); break;
      default: claimer(ctx, fl); break;
    }
  }
}

/** Systems a cargo ship could open a route to: trade partners' settled systems first, then far own ones. */
function routeTargets(ctx: Ctx): number[] {
  const { state, me } = ctx;
  const used = new Set((state.routes ?? []).flatMap((r) => [r.to]));
  const foreign: number[] = [], domestic: number[] = [];
  state.map.hexes.forEach((h, i) => {
    if (!h.owner || !h.system || h.system.development < 2 || used.has(i)) return;
    if (h.owner === me) {
      if (hexDistance(state.map, ctx.home, i) >= 6) domestic.push(i);
      return;
    }
    const r = relation(state, me, h.owner);
    if (r.status !== 'war' && r.contact && (r.agreements.includes('trade') || hasAbility(h.owner, 'freePort'))) foreign.push(i);
  });
  if (foreign.length) return foreign;
  // Keep the last slot for a foreign route, which pays both sides more.
  return routesOf(state, me).length < routeCapacity(state, me) - 1 ? domestic : [];
}

function tradeShip(ctx: Ctx, fl: Fleet): void {
  if (act(ctx, { type: 'establishRoute', fleet: fl.id })) return;
  if (fl.path.length) return;
  const targets = routeTargets(ctx).filter((h) => !ctx.reserved.has(h)).sort((a, b) => hexDistance(ctx.state.map, fl.hex, a) - hexDistance(ctx.state.map, fl.hex, b));
  if (!targets.length) return;
  ctx.reserved.add(targets[0]);
  if (moveTo(ctx, fl, targets[0]) && ctx.state.fleets[fl.id]?.hex === targets[0]) act(ctx, { type: 'establishRoute', fleet: fl.id });
}

function scout(ctx: Ctx, fl: Fleet, unexplored: number[]): void {
  if (fl.path.length && !ctx.reserved.has(fl.path[fl.path.length - 1])) {
    ctx.reserved.add(fl.path[fl.path.length - 1]);
    return;
  }
  if (unexplored.length === 0) return claimer(ctx, fl);
  let best = -1, bestD = Infinity;
  for (const h of unexplored) {
    if (ctx.reserved.has(h)) continue;
    const d = hexDistance(ctx.state.map, fl.hex, h) + ctx.rng.float(0, 3);
    if (d < bestD) { bestD = d; best = h; }
  }
  if (best < 0) return;
  for (const h of hexesWithin(ctx.state.map, best, 3)) ctx.reserved.add(h);
  moveTo(ctx, fl, best);
}

function colonyShip(ctx: Ctx, fl: Fleet, targets: number[]): void {
  const sys = ctx.state.map.hexes[fl.hex].system;
  if (sys && sys.development === 0 && targets.includes(fl.hex) && act(ctx, { type: 'colonize', fleet: fl.id })) return;
  const t = targets.filter((h) => !ctx.reserved.has(h)).sort((a, b) => hexDistance(ctx.state.map, fl.hex, a) - hexDistance(ctx.state.map, fl.hex, b))[0];
  if (t === undefined) return;
  ctx.reserved.add(t);
  if (moveTo(ctx, fl, t) && ctx.state.fleets[fl.id]?.hex === t) act(ctx, { type: 'colonize', fleet: fl.id });
}

function constructor(ctx: Ctx, fl: Fleet, targets: number[]): void {
  const here = ctx.state.map.hexes[fl.hex];
  if (here.system && here.system.development === 0 && (!here.owner || here.owner === ctx.me) && act(ctx, { type: 'outpost', fleet: fl.id })) return;
  const t = targets.filter((h) => !ctx.reserved.has(h)).sort((a, b) => hexDistance(ctx.state.map, fl.hex, a) - hexDistance(ctx.state.map, fl.hex, b))[0];
  if (t === undefined) {
    // Nothing to settle: fortify the border facing our nearest rival (or home).
    const site = ctx.major ? starbaseSite(ctx.state, ctx.me) : null;
    const dest = site ?? ctx.home;
    if (fl.hex === dest) act(ctx, { type: 'starbase', fleet: fl.id });
    else moveTo(ctx, fl, dest);
    return;
  }
  ctx.reserved.add(t);
  if (moveTo(ctx, fl, t) && ctx.state.fleets[fl.id]?.hex === t && ctx.state.fleets[fl.id].movesLeft > 0) act(ctx, { type: 'outpost', fleet: fl.id });
}

/** Unowned hexes next to our territory that nobody is claiming yet. */
function claimFrontier(ctx: Ctx): number[] {
  const { state, me } = ctx;
  const out: number[] = [];
  const maxDist = ctx.major ? 99 : 2;
  const seen = new Set<number>();
  for (const h of ctx.owned) {
    for (const n of neighbors(state.map, h)) {
      if (seen.has(n)) continue;
      seen.add(n);
      const hx = state.map.hexes[n];
      if (hx.owner || hx.terrain === 'blackHole' || hx.pendingClaim) continue;
      if (hexDistance(state.map, ctx.home, n) > maxDist) continue;
      if (hx.system && hx.system.development > 0) continue;
      // Do not crowd other factions: leave a hex between us and them unless at war.
      if (neighbors(state.map, n).some((m) => state.map.hexes[m].owner && state.map.hexes[m].owner !== me && !atWar(state, me, state.map.hexes[m].owner!))) continue;
      out.push(n);
    }
  }
  return out;
}

function claimer(ctx: Ctx, fl: Fleet): void {
  if (fl.path.length) return;
  const hx = ctx.state.map.hexes[fl.hex];
  if (!hx.owner && hx.pendingClaim === ctx.me) { ctx.reserved.add(fl.hex); return; }
  const frontier = claimFrontier(ctx).filter((h) => !ctx.reserved.has(h));
  if (frontier.length === 0) return;
  frontier.sort((a, b) => hexDistance(ctx.state.map, fl.hex, a) - hexDistance(ctx.state.map, fl.hex, b));
  ctx.reserved.add(frontier[0]);
  moveTo(ctx, fl, frontier[0]);
}

function transport(ctx: Ctx, fl: Fleet): void {
  const { state, me } = ctx;
  const ships = fl.ships.filter((s) => design(state.ships[s].design).stats.cargo > 0);
  const loaded = ships.some((s) => state.ships[s].cargo.some((c) => state.armies[c]));
  if (!loaded) {
    const idle = Object.values(state.armies).filter((a) => a.owner === me && a.hex === fl.hex);
    for (const a of idle) for (const s of ships) if (act(ctx, { type: 'loadArmy', army: a.id, ship: s })) break;
    if (!Object.values(state.armies).some((a) => a.ship && fl.ships.includes(a.ship))) {
      const garrisoned = Object.values(state.armies).find((a) => a.owner === me && a.hex !== null);
      if (garrisoned && garrisoned.hex !== fl.hex) moveTo(ctx, fl, garrisoned.hex!);
      return;
    }
  }
  // Invade the nearest enemy (or independent, if aggressive) system whose defenses are down.
  const here = state.map.hexes[fl.hex];
  if (here.system && here.system.development > 0 && here.owner !== me && here.system.defense === 0) {
    if (act(ctx, { type: 'invade', fleet: fl.id })) return;
  }
  // Campaign: wait at the staging hex until the fleet has the target's defenses down, then land.
  const c = ctx.campaign;
  if (c !== null && state.map.hexes[c].owner && ctx.enemies.includes(state.map.hexes[c].owner!)) {
    // Collect enough armies first: pick them up wherever they are garrisoned.
    const aboard = fl.ships.flatMap((s) => state.ships[s].cargo).filter((x) => state.armies[x]).length;
    const space = ships.reduce((a, s) => a + cargoFree(state, s), 0);
    if (aboard < armiesNeeded(state, me, c) && space > 0) {
      const here = Object.values(state.armies).filter((a) => a.owner === me && a.hex === fl.hex);
      for (const a of here) for (const s of ships) if (act(ctx, { type: 'loadArmy', army: a.id, ship: s })) break;
      const elsewhere = Object.values(state.armies).filter((a) => a.owner === me && a.hex !== null && a.hex !== fl.hex)
        .sort((x, y) => hexDistance(state.map, fl.hex, x.hex!) - hexDistance(state.map, fl.hex, y.hex!))[0];
      if (elsewhere && fl.ships.flatMap((s) => state.ships[s].cargo).filter((x) => state.armies[x]).length < armiesNeeded(state, me, c)) {
        moveTo(ctx, fl, elsewhere.hex!);
        return;
      }
    }
    const sys = state.map.hexes[c].system!;
    const ours = Object.values(state.fleets).some((x) => x.owner === me && x.hex === c && classifyFleet(state, x) === 'war');
    if (sys.defense === 0 && ours) { moveTo(ctx, fl, c); return; }
    const staging = stagingHex(state, me, c);
    if (fl.hex !== staging) moveTo(ctx, fl, staging);
    return;
  }
  const targets = state.map.hexes.map((h, i) => ({ h, i })).filter(({ h }) =>
    h.system && h.system.development > 0 && h.system.defense === 0 && h.owner !== me &&
    (h.owner ? ctx.enemies.includes(h.owner) : ctx.p.aggression > 0.4) &&
    Object.values(state.fleets).some((x) => x.owner === me && x.hex !== undefined && classifyFleet(state, x) === 'war'));
  if (targets.length === 0) return;
  targets.sort((a, b) => hexDistance(state.map, fl.hex, a.i) - hexDistance(state.map, fl.hex, b.i));
  moveTo(ctx, fl, targets[0].i);
}

function warFleet(ctx: Ctx, fl: Fleet): void {
  const { state, me } = ctx;
  const power = fleetPower(state, fl);
  const hostile = (o: FactionId) => ctx.enemies.includes(o);
  // Stay and fight if enemies share the hex and we're not outmatched.
  const enemyHere = powerAt(state, fl.hex, hostile);
  if (enemyHere > 0) {
    if (enemyHere > power * 2.5 && !hasAbility(me, 'wayOfTheBlade')) act(ctx, { type: 'retreat', fleet: fl.id });
    return;
  }
  // Defend our territory.
  const invaders = Object.values(state.fleets).filter((x) => hostile(x.owner) && ctx.owned.has(x.hex));
  if (invaders.length) {
    invaders.sort((a, b) => hexDistance(state.map, fl.hex, a.hex) - hexDistance(state.map, fl.hex, b.hex));
    const t = invaders[0];
    if (fleetPower(state, t) < power * 1.5 || t.hex === ctx.home) { moveTo(ctx, fl, t.hex); return; }
  }
  if (!ctx.major) {
    // Minors guard home and claim nearby.
    if (hexDistance(state.map, fl.hex, ctx.home) > 2) { moveTo(ctx, fl, ctx.home); return; }
    claimer(ctx, fl);
    return;
  }
  // Campaign: gather at the staging hex, strike together once strong enough, then hold the target.
  if (ctx.campaign !== null && fl.ships.length >= 2) {
    const target = ctx.campaign;
    if (fl.hex === target) return;
    const staging = stagingHex(state, me, target);
    const enough = gatheredPower(state, me, staging, target) >= defenseAt(state, target, me) * 1.3;
    if (enough || hexDistance(state.map, fl.hex, target) <= 1) { if (moveTo(ctx, fl, target)) return; }
    else if (hexDistance(state.map, fl.hex, staging) > 1) { if (moveTo(ctx, fl, staging)) return; }
    else return;
  }
  if (ctx.enemies.length && fl.ships.length >= 3) {
    // Attack the closest enemy target we can beat: fleets, then systems.
    const targets: { hex: number; d: number }[] = [];
    for (const x of Object.values(state.fleets)) {
      if (!hostile(x.owner)) continue;
      if (fleetPower(state, x) > power * 0.9) continue;
      targets.push({ hex: x.hex, d: hexDistance(state.map, fl.hex, x.hex) });
    }
    state.map.hexes.forEach((h, i) => {
      if (!h.owner || !hostile(h.owner) || !h.system) return;
      if (powerAt(state, i, hostile) > power * 0.9) return;
      targets.push({ hex: i, d: hexDistance(state.map, fl.hex, i) - (h.system.homeOf ? 3 : 0) });
    });
    if (targets.length) {
      targets.sort((a, b) => a.d - b.d);
      if (moveTo(ctx, fl, targets[0].hex)) return;
    }
  }
  // At peace: aggressive majors take independent colonies with strong groups.
  if (!ctx.caretaker && ctx.p.aggression > 0.4 && fl.ships.length >= 4) {
    const indep = state.map.hexes.map((h, i) => ({ h, i })).filter(({ h, i }) => !h.owner && h.system && h.system.development > 0 && hexDistance(state.map, ctx.home, i) < 14);
    if (indep.length) {
      indep.sort((a, b) => hexDistance(state.map, fl.hex, a.i) - hexDistance(state.map, fl.hex, b.i));
      const t = indep[0];
      if ((t.h.system!.defense + t.h.system!.garrison) * 10 < power) {
        if (fl.stance !== 'aggressive') act(ctx, { type: 'stance', fleet: fl.id, stance: 'aggressive' });
        if (moveTo(ctx, fl, t.i)) return;
      }
    }
  }
  // Otherwise expand the border, keeping big groups near home.
  if (fl.ships.length >= 4 && hexDistance(state.map, fl.hex, ctx.home) > 6) { moveTo(ctx, fl, ctx.home); return; }
  claimer(ctx, fl);
}

void ROLES;
