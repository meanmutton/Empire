/**
 * Space combat (§7). At the end of a faction's turn, every hex where its forces meet an enemy fights a battle
 * of several combat rounds (3–10, set by the host; default 5). Battles run without human input: each fleet
 * follows its doctrine (when to withdraw, offense vs defense, preferred range).
 *
 * Each combat round:
 *  1. The range moves one band (long, medium, close) toward what the side that wins the maneuver wants.
 *  2. Maybe a battle event (rare, small; very rarely, big).
 *  3. Every ship, starbase and planet fires its shots. A shot picks a target (bigger ships and escorts draw
 *     more fire), may miss against evasive targets, does 50–150% of its expected damage, and sometimes lands
 *     a critical hit. Each side also has a fortune for the battle and for the round.
 *  4. All damage lands at once. Shields soak damage first, then hull. Ships under half hull are damaged (fire
 *     at 75%), under a quarter crippled (40%); at zero they are destroyed, or boarded.
 *  5. Fleets that were withdrawing leave the hex; fleets that hit their doctrine's limit start withdrawing,
 *     taking pursuit fire for one round (less if they are faster than the pursuers).
 *
 * Lethality is normalized per battle: at nominal fire, the armed forces lose `BALANCE.combat.lethality` of
 * their durability per round, whatever the designs, so tactics, numbers, doctrine and luck decide battles
 * rather than the raw scale of weapon numbers.
 */
import { BALANCE } from '../data/balance';
import { design, DESIGNS, type ShipDesign } from '../data/designs';
import { DEFAULT_COMBAT_ROUNDS, DOCTRINES, RANGE_MODS, RANGES, type DoctrineDef, type DoctrineId, type RangeBand } from '../data/doctrines';
import { factionDef, hasAbility as hasAbilityRaw } from '../data/factions';
import { CLASSES, ROLES } from '../data/ships';
import { log } from './events';
import { hexDistance, neighbors } from './hex';
import { newId } from './ids';
import { hostilesAt, removeShip } from './movement';
import { atWar, friendly } from './query';
import { techEffects } from './research';
import { Rng } from './rng';
import { spawnShip } from './setup';
import type { BattleRecord, BattleRoundLog, BattleSide, FactionId, Fleet, GameState } from './types';

/** Pseudo-faction id for independent (unowned) defended systems. */
export const INDEPENDENT = '@independent';

function hasAbility(f: FactionId, a: Parameters<typeof hasAbilityRaw>[1]): boolean {
  return f !== INDEPENDENT && hasAbilityRaw(f, a);
}

const SUPPORT_ROLES = new Set(['cargo', 'colony', 'constructor', 'transport', 'carrier']);

export interface Unit {
  kind: 'ship' | 'starbase' | 'planet';
  /** Ship id, starbase id, or hex as string for planets. */
  id: string;
  name: string;
  /** Ship design id. */
  design?: string;
  party: FactionId;
  /** Fleet id for ships. */
  fleet?: string;
  hull: number;
  maxHull: number;
  /** Shield points this battle (soak damage before hull; ×2 per shield, × terrain). */
  shieldPool: number;
  shields: number;
  energy: number;
  missile: number;
  fighters: number;
  pd: number;
  evasion: number;
  weight: number;
  size: number;
  speed: number;
  xp: number;
  cost: number;
  role?: string;
  /** Durability multiplier from tech (hull, starbase, planetary). */
  tough: number;
  // Battle state.
  dead?: boolean;
  gone?: boolean;
  captured?: boolean;
  weaponsOut?: boolean;
  shieldsDown?: boolean;
  pinned?: boolean;
}

interface Party {
  faction: FactionId;
  units: Unit[];
}

interface FleetState {
  id: string;
  party: FactionId;
  doctrine: DoctrineDef;
  startHP: number;
  withdrawing: boolean;
  /** Set when it escapes (pursuit-free) through an ability. */
  vanish?: boolean;
  command: number;
  left?: number;
  cornered?: boolean;
}

interface PartyState {
  fortune: number;
  battleMod: number;
  roundMod: number;
  noWithdraw: boolean;
  grounded: boolean;
  dealt: number;
  taken: number;
  crits: number;
}

export interface BattleReport {
  hex: number;
  firstRound: boolean;
  parties: { faction: FactionId; units: number; lost: number; captured: number; damage: number }[];
}

export function shieldEnv(state: GameState, hex: number): number {
  const t = state.map.hexes[hex].terrain;
  return t === 'nebula' ? 0.5 : t === 'ionStorm' ? 0 : 1;
}

/** Effective hit points left: shield pool plus hull × toughness. */
export function effHP(u: Unit): number {
  return u.dead || u.gone ? 0 : u.shieldPool + Math.max(0, u.hull) * u.tough;
}

function startHP(u: Unit): number {
  return u.shieldPool + u.hull * u.tough;
}

export function fleetDoctrine(f: Fleet): DoctrineId {
  return DOCTRINES[f.doctrine] ? f.doctrine : 'engage';
}

/** What an observer assumes about a fleet it cannot fully see: another faction's tech, typical designs. */
export interface FleetGuess {
  tech?: ReturnType<typeof techEffects>;
  designOf?: (actual: ShipDesign) => ShipDesign;
}

/** Combat units for a fleet's ships, as they would fight in a hex with shield environment `env`. */
export function fleetUnits(state: GameState, fl: Fleet, env: number, guess?: FleetGuess): Unit[] {
  const te = guess?.tech ?? techEffects(state, fl.owner);
  return fl.ships.map((sid) => {
    const real = state.ships[sid];
    const d = guess?.designOf ? guess.designOf(design(real.design)) : design(real.design);
    const s = guess?.designOf ? { ...real, hull: d.stats.hull, xp: 0, fighters: d.stats.hangar } : real;
    const size = CLASSES[d.cls].size;
    const small = size <= CLASSES.frigate.size ? te.smallShipSpeed : 0;
    const shields = d.stats.shields * (1 + te.shields);
    return {
      kind: 'ship' as const, id: sid, name: d.name, design: d.id, party: fl.owner, fleet: fl.id, hull: s.hull, maxHull: d.stats.hull,
      shieldPool: 2 * shields * env * (1 + te.hull), shields,
      energy: d.stats.energy * (1 + te.energyWeapons + te.attack), missile: d.stats.missile * (1 + te.missiles + te.attack),
      fighters: s.fighters * (1 + te.fighters), pd: d.stats.pd * (1 + te.pointDefense), tough: 1 + te.hull,
      evasion: d.stats.evasion, size, speed: d.cls === 'fighter' ? 0 : d.stats.speed + te.speed + small,
      weight: (d.cls === 'fighter' ? 0.5 : size * (ROLES[d.role].escort ? 2.5 : 1))
        * (d.role === 'cargo' && hasAbility(fl.owner, 'smugglers') ? 0.1 : 1),
      xp: s.xp, cost: d.cost.metals + d.cost.energy, role: d.role,
    };
  });
}

/** Builds the combat units in a hex, grouped by faction. Exported for the battle forecast. */
export function collectParties(state: GameState, hex: number): Party[] {
  const parties = new Map<FactionId, Party>();
  const party = (f: FactionId) => {
    let p = parties.get(f);
    if (!p) parties.set(f, (p = { faction: f, units: [] }));
    return p;
  };
  const env = shieldEnv(state, hex);
  for (const fl of Object.values(state.fleets)) {
    if (fl.hex !== hex) continue;
    party(fl.owner).units.push(...fleetUnits(state, fl, env));
  }
  for (const b of Object.values(state.starbases)) {
    if (b.hex !== hex) continue;
    const spec = BALANCE.starbase[b.tier as 1 | 2 | 3]!;
    const te = techEffects(state, b.owner);
    party(b.owner).units.push({
      kind: 'starbase', id: b.id, name: spec.name, party: b.owner, hull: b.hull, maxHull: spec.hull, shieldPool: 0, shields: 0,
      energy: spec.defense * (1 + te.attack), missile: spec.defense / 2, fighters: 0, pd: spec.defense / 4, weight: 8, size: 8,
      speed: 0, evasion: 0, xp: 1, cost: spec.metals, tough: 1 + te.starbaseHull,
    });
  }
  const h = state.map.hexes[hex];
  const sys = h.system;
  if (sys && sys.development > 0 && sys.defense > 0) {
    const owner = h.owner ?? INDEPENDENT;
    const pd = h.owner ? 1 + techEffects(state, h.owner).planetDefense : 1;
    const attack = sys.defense * BALANCE.defenseAttackPerPoint * pd;
    party(owner).units.push({
      kind: 'planet', id: String(hex), name: `${sys.name} defenses`, party: owner, hull: sys.defense * 5, maxHull: sys.defense * 5,
      shieldPool: 0, shields: 0, energy: attack / 2, missile: attack / 2, fighters: 0, pd: sys.defense / 4, weight: 6, size: 8,
      speed: 0, evasion: 0, xp: 1, cost: sys.defense * 8, tough: pd,
    });
  }
  return [...parties.values()];
}

/** Do parties a and b fight? Independents fight factions whose fleets there provoke them. */
export function hostile(state: GameState, hex: number, a: FactionId, b: FactionId): boolean {
  if (a === b) return false;
  if (a === INDEPENDENT || b === INDEPENDENT) {
    const other = a === INDEPENDENT ? b : a;
    return Object.values(state.fleets).some((f) => f.hex === hex && f.owner === other && DOCTRINES[fleetDoctrine(f)].provokes);
  }
  return atWar(state, a, b);
}

/** Hexes where `faction` must fight this turn. */
export function battleHexes(state: GameState, faction: FactionId): number[] {
  const candidates = new Set<number>();
  for (const f of Object.values(state.fleets)) if (f.owner === faction) candidates.add(f.hex);
  for (const b of Object.values(state.starbases)) if (b.owner === faction) candidates.add(b.hex);
  state.map.hexes.forEach((h, i) => { if (h.owner === faction && h.system && h.system.defense > 0) candidates.add(i); });
  const out: number[] = [];
  for (const hex of candidates) {
    const parties = collectParties(state, hex);
    if (!parties.some((p) => p.faction === faction)) continue;
    if (parties.some((p) => hostile(state, hex, faction, p.faction))) out.push(hex);
  }
  return out.sort((a, b) => a - b);
}

/** Resolves a battle in every hex where `faction` is fighting. */
export function resolveCombat(state: GameState, faction: FactionId): BattleReport[] {
  const reports: BattleReport[] = [];
  for (const hex of battleHexes(state, faction)) reports.push(resolveBattleAt(state, hex, faction));
  return reports;
}

/** A bounded, centered random number in (-1, 1), peaked at 0. */
function tri(rng: Rng): number {
  return rng.next() + rng.next() - 1;
}

function stateMod(u: Unit): number {
  if (u.kind !== 'ship') return 1;
  const f = u.hull / u.maxHull;
  return f < BALANCE.combat.crippledAt ? BALANCE.combat.crippledFire : f < BALANCE.combat.damagedAt ? BALANCE.combat.damagedFire : 1;
}

export function isCrippled(hull: number, maxHull: number): boolean {
  return hull / maxHull < BALANCE.combat.crippledAt;
}

export const xpMult = (u: Unit) => 1 + 0.05 * Math.max(0, u.xp - 1);

/** Shield and point-defense reductions a party faces against a set of enemy units. */
export function screening(p: Unit[], enemies: Unit[], env: number): { shieldFrac: number; pdFrac: number } {
  const ships = enemies.filter((u) => u.kind === 'ship' && !u.dead && !u.gone);
  const avgShield = ships.length ? ships.reduce((a, u) => a + (u.shieldsDown ? 0 : u.shields), 0) / ships.length : 0;
  const shieldFrac = Math.min(0.6, (avgShield * env) / 30);
  const myMissiles = p.reduce((a, u) => a + (u.dead || u.gone ? 0 : u.missile + u.fighters * 3), 0);
  const enemyPd = enemies.reduce((a, u) => a + (u.dead || u.gone ? 0 : u.pd), 0);
  const pdFrac = Math.min(0.6, (enemyPd / (myMissiles + 1)) * 0.5);
  return { shieldFrac, pdFrac };
}

/** A unit's fire for one combat round before luck and modifiers (range applies to ships only). */
export function unitFire(u: Unit, scr: { shieldFrac: number; pdFrac: number }, range: RangeBand | null, grounded = false): number {
  const rm = range && u.kind === 'ship' ? RANGE_MODS[range] : { beam: 1, missile: 1, fighter: 1 };
  const f = u.energy * rm.beam * (1 - scr.shieldFrac)
    + u.missile * rm.missile * (1 - scr.pdFrac) * (1 - scr.shieldFrac / 2)
    + (grounded ? 0 : u.fighters * 6 * rm.fighter * (1 - scr.pdFrac * 0.5));
  return f * xpMult(u) * stateMod(u) * (u.weaponsOut ? 0.5 : 1);
}

/** The range a party wants: from its fleets' doctrines, weighted by firepower. */
function preferredRange(units: Unit[], fleets: Map<string, FleetState>): number | null {
  let wsum = 0, isum = 0;
  for (const u of units) {
    if (u.kind !== 'ship' || u.dead || u.gone || !u.fleet) continue;
    const fs = fleets.get(u.fleet)!;
    const w = u.energy + u.missile + u.fighters * 6 + 0.1;
    let r: number;
    if (fs.doctrine.range === 'auto') {
      const beam = u.energy / (u.energy + u.missile + u.fighters * 6 || 1);
      r = beam > 0.55 ? 2 : beam < 0.35 ? 0 : 1;
    } else r = RANGES.indexOf(fs.doctrine.range);
    wsum += w;
    isum += w * r;
  }
  return wsum > 0 ? Math.round(isum / wsum) : null;
}

export function resolveBattleAt(state: GameState, hex: number, active: FactionId): BattleReport {
  void active;
  const rng = new Rng(state.rng);
  const C = BALANCE.combat;
  const parties = collectParties(state, hex);
  const env = shieldEnv(state, hex);
  const last = state.battles[hex];
  const firstRound = last === undefined || state.seq - last > state.turnOrder.length;
  state.battles[hex] = state.seq;
  const maxRounds = state.config.combatRounds ?? DEFAULT_COMBAT_ROUNDS;
  const h = state.map.hexes[hex];
  const place = h.system?.name ?? 'deep space';

  const hostileTo = new Map<FactionId, Set<FactionId>>();
  for (const p of parties) hostileTo.set(p.faction, new Set(parties.filter((q) => hostile(state, hex, p.faction, q.faction)).map((q) => q.faction)));
  const enemiesOf = (f: FactionId) => parties.filter((q) => hostileTo.get(f)!.has(q.faction));
  const enemyUnits = (f: FactionId) => enemiesOf(f).flatMap((q) => q.units).filter((u) => !u.dead && !u.gone);
  const notes = new Map<FactionId, Set<string>>(parties.map((p) => [p.faction, new Set<string>()]));
  const note = (f: FactionId, text: string) => notes.get(f)!.add(text);
  const before = snapshot(state, hex, parties);
  const allUnits = parties.flatMap((p) => p.units);
  const hullStart = new Map(allUnits.map((u) => [u.id, u.hull]));

  // Fleet doctrines and party fortunes.
  const fleets = new Map<string, FleetState>();
  for (const u of allUnits) {
    if (!u.fleet) continue;
    let fs = fleets.get(u.fleet);
    if (!fs) {
      const fl = state.fleets[u.fleet];
      fs = { id: u.fleet, party: u.party, doctrine: DOCTRINES[fleetDoctrine(fl)], startHP: 0, withdrawing: false, command: 1 };
      fleets.set(u.fleet, fs);
    }
    fs.startHP += startHP(u);
  }
  const ps = new Map<FactionId, PartyState>();
  for (const p of parties) {
    ps.set(p.faction, { fortune: Math.exp(C.battleFortune * rng.float(-1, 1)), battleMod: 1, roundMod: 1, noWithdraw: false, grounded: false, dealt: 0, taken: 0, crits: 0 });
  }
  const neverWithdraws = (f: FactionId) => hasAbility(f, 'wayOfTheBlade');
  for (const fs of fleets.values()) {
    if (fs.doctrine === DOCTRINES.retreat && !neverWithdraws(fs.party) && enemiesOf(fs.party).length) fs.withdrawing = true;
  }

  // Opening strikes.
  const rounds: BattleRoundLog[] = [];
  const opening: string[] = [];
  if (firstRound) {
    for (const q of parties) {
      if (!enemiesOf(q.faction).some((p) => hasAbility(p.faction, 'solarFlare'))) continue;
      for (const u of q.units) applyHit(u, startHP(u) * 0.1);
      note(q.faction, 'Hit by a Solar Flare as the battle opened: 10% damage to every unit.');
    }
  }

  // Lethality scale for this battle (see the header).
  let sumD = 0, sumA = 0;
  for (const p of parties) {
    const foes = enemyUnits(p.faction);
    if (!foes.length) continue;
    const scr = screening(p.units, foes, env);
    const tw = foes.reduce((a, u) => a + u.weight, 0) || 1;
    const hitRate = 1 - foes.reduce((a, u) => a + u.weight * u.evasion, 0) / tw;
    for (const u of p.units) {
      const f = unitFire(u, scr, null);
      if (f <= 0) continue;
      sumA += f * hitRate;
      sumD += startHP(u);
    }
  }
  const K = sumA > 0 ? (C.lethality * sumD) / sumA : 0;

  let range = 0;
  const dealtTotal = new Map<FactionId, number>();
  const takenTotal = new Map<FactionId, number>();
  const capturedBy = new Map<string, FactionId>();
  let fought = 0;

  const fighting = (): boolean => {
    for (const p of parties) {
      const mine = p.units.filter((u) => !u.dead && !u.gone);
      if (!mine.length) continue;
      const foes = enemyUnits(p.faction);
      if (!foes.length) continue;
      if (mine.some((u) => u.energy + u.missile + u.fighters > 0) || foes.some((u) => u.energy + u.missile + u.fighters > 0)) return true;
    }
    return false;
  };

  for (let n = 1; n <= maxRounds && fighting(); n++) {
    fought = n;
    const lines: string[] = n === 1 ? opening : [];
    for (const s of ps.values()) { s.roundMod = Math.exp(C.roundFortune * tri(rng)); s.noWithdraw = false; s.grounded = false; s.dealt = 0; s.taken = 0; }

    // 1. Maneuver for range.
    if (n > 1) {
      let best: { score: number; want: number } | null = null;
      for (const p of parties) {
        if (!enemyUnits(p.faction).length) continue;
        const want = preferredRange(p.units, fleets);
        if (want === null) continue;
        const mobile = p.units.filter((u) => u.kind === 'ship' && !u.dead && !u.gone && u.speed > 0);
        const speed = mobile.length ? mobile.reduce((a, u) => a + u.speed - (isCrippled(u.hull, u.maxHull) ? 1 : 0), 0) / mobile.length : 0;
        const xp = mobile.length ? mobile.reduce((a, u) => a + u.xp, 0) / mobile.length : 0;
        const score = speed + xp * 0.3 + rng.float(0, 3);
        if (!best || score > best.score) best = { score, want };
      }
      if (best && best.want !== range) {
        const closing = best.want > range;
        range += closing ? 1 : -1;
        lines.push(`The fleets ${closing ? 'close' : 'pull back'} to ${RANGE_MODS[RANGES[range]].name}.`);
      }
    }
    const band = RANGES[range];

    // 2. Battle events.
    battleEvent(state, rng, hex, parties, ps, fleets, enemyUnits, lines, capturedBy);

    // 3. Fire.
    const pending = new Map<Unit, number>();
    const critFx: { target: Unit; kind: 'weapons' | 'shields' | 'engines' | 'bridge'; by: FactionId }[] = [];
    for (const p of parties) {
      const foes = enemyUnits(p.faction);
      if (!foes.length) continue;
      const pst = ps.get(p.faction)!;
      const scr = screening(p.units, foes, env);
      const { mult, reasons } = partyMultiplier(state, hex, p, enemiesOf(p.faction), firstRound, foes);
      for (const r of reasons) note(p.faction, r);
      if (n === 1) {
        if (scr.shieldFrac >= 0.05) note(p.faction, `Enemy shields absorbed ${Math.round(scr.shieldFrac * 100)}% of its beam fire.`);
        const missiles = p.units.reduce((a, u) => a + u.missile + u.fighters, 0);
        if (scr.pdFrac >= 0.05 && missiles > 0) note(p.faction, `Enemy point defense stopped ${Math.round(scr.pdFrac * 100)}% of its missiles and fighters.`);
      }
      const pursuers = foes.filter((u) => u.kind === 'ship' && u.speed > 0 && u.energy + u.missile + u.fighters > 0);
      const chase = pursuers.length ? Math.max(...pursuers.map((u) => u.speed)) : -1;
      let focus: Unit | null = null;
      const doomed = (t: Unit) => (pending.get(t) ?? 0) >= effHP(t);
      for (const u of p.units) {
        if (u.dead || u.gone) continue;
        const fs = u.fleet ? fleets.get(u.fleet)! : null;
        const doc = fs?.doctrine;
        let fire = unitFire(u, scr, band, pst.grounded) * mult * (doc?.attack ?? 1) * (fs?.withdrawing ? 0.3 : 1) * (fs?.command ?? 1)
          * pst.fortune * pst.roundMod * pst.battleMod;
        if (fire <= 0) continue;
        const shots = (u.kind === 'ship' ? Math.max(1, Math.ceil(u.size / 2)) : 4) + (u.fighters > 0 && !pst.grounded ? 2 : 0);
        fire /= shots;
        for (let k = 0; k < shots; k++) {
          const live = foes.filter((t) => !t.dead && !t.gone);
          if (!live.length) break;
          const open = live.filter((t) => !doomed(t));
          const pool = open.length ? open : live;
          if (!focus || doomed(focus) || !pool.includes(focus)) focus = pickTarget(rng, pool, doc?.huntsSupport ?? false, fleets);
          const target = rng.chance(C.focus) ? focus : pickTarget(rng, pool, doc?.huntsSupport ?? false, fleets);
          const evade = target.evasion * (band === 'long' ? 1.2 : band === 'close' ? 0.8 : 1);
          if (rng.chance(evade)) continue;
          const tfs = target.fleet ? fleets.get(target.fleet)! : null;
          let dmg = fire * K * rng.float(C.shotLow, C.shotHigh) * (tfs?.doctrine.exposure ?? 1) * (target.shieldsDown ? 1.25 : 1);
          if (tfs?.withdrawing && !tfs.vanish) {
            const esc = Math.min(...target.fleet ? unitsOfFleet(allUnits, target.fleet).map((x) => x.speed - (isCrippled(x.hull, x.maxHull) ? 1 : 0)) : [0]);
            dmg *= chase < 0 ? 0.6 : esc > chase ? 0.5 : esc === chase ? 0.8 : 1.1;
            if (target.pinned) dmg *= 2;
          }
          if (rng.chance(C.critChance + 0.01 * u.xp)) {
            pst.crits++;
            const roll = rng.next();
            const kind = roll < 0.4 || target.kind === 'planet' ? 'direct'
              : roll < 0.6 ? 'weapons' : roll < 0.75 ? (target.shields > 0 ? 'shields' : 'direct')
              : roll < 0.9 ? (target.kind === 'ship' ? 'engines' : 'direct') : (target.fleet ? 'bridge' : 'direct');
            if (kind === 'direct') dmg *= 2;
            else critFx.push({ target, kind, by: p.faction });
          }
          pending.set(target, (pending.get(target) ?? 0) + dmg);
          pst.dealt += dmg;
          ps.get(target.party)!.taken += dmg;
        }
      }
    }

    // 4. Damage lands at once.
    const lostThisRound = new Map<FactionId, number>();
    const hpBefore = new Map<FactionId, number>(parties.map((p) => [p.faction, p.units.reduce((a, u) => a + effHP(u), 0)]));
    for (const [u, dmg] of pending) {
      const wasAlive = !u.dead;
      applyHit(u, dmg);
      if (wasAlive && u.dead) {
        lostThisRound.set(u.party, (lostThisRound.get(u.party) ?? 0) + 1);
        tryCapture(state, rng, u, band, enemiesOf(u.party).map((q) => q.faction), capturedBy);
      }
    }
    let critLines = 0;
    for (const fx of critFx) {
      const t = fx.target;
      if (t.dead) continue;
      if (fx.kind === 'weapons') t.weaponsOut = true;
      if (fx.kind === 'shields') { t.shieldsDown = true; t.shieldPool = 0; }
      if (fx.kind === 'engines') t.pinned = true;
      if (fx.kind === 'bridge' && t.fleet) fleets.get(t.fleet)!.command = Math.max(0.5, fleets.get(t.fleet)!.command * 0.8);
      if (critLines < 4 && t.size >= 4) {
        critLines++;
        const what = { weapons: 'weapons are knocked out', shields: 'shields collapse', engines: 'engines are crippled', bridge: 'bridge is hit, throwing its group into confusion' }[fx.kind];
        lines.push(`Critical hit: ${owned(t)} ${t.name}'s ${what}.`);
      }
    }
    // Carriers lose fighters with the damage their side takes.
    for (const p of parties) {
      const hp0 = hpBefore.get(p.faction) || 1;
      const frac = Math.min(1, ps.get(p.faction)!.taken / hp0);
      for (const u of p.units) if (u.fighters > 0 && !u.dead) u.fighters = u.fighters * (1 - frac);
    }

    // 5. Withdrawals: fleets that spent this round pulling out leave; others decide.
    for (const fs of fleets.values()) {
      const units = unitsOfFleet(allUnits, fs.id).filter((u) => !u.dead && !u.gone);
      if (!units.length) continue;
      if (fs.withdrawing) {
        const away = units.filter((u) => !u.pinned);
        if (!away.length) continue;
        const to = escapeHex(state, hex, fs.party);
        if (to === null) { fs.withdrawing = false; if (!fs.cornered) { fs.cornered = true; lines.push(`${owned(units[0])} ${state.fleets[fs.id]?.name ?? 'fleet'} is cornered and has to fight on.`); } continue; }
        for (const u of away) u.gone = true;
        fs.left = to;
        const stuck = units.length - away.length;
        lines.push(`${owned(units[0])} ${state.fleets[fs.id]?.name ?? 'fleet'} withdraws${stuck ? `, leaving ${stuck} ship${stuck > 1 ? 's' : ''} with damaged engines behind` : ''}.`);
        continue;
      }
      if (neverWithdraws(fs.party) || ps.get(fs.party)!.noWithdraw) continue;
      const d = fs.doctrine;
      const lossFrac = 1 - units.reduce((a, u) => a + effHP(u), 0) / (fs.startHP || 1);
      const guarding = d.standsAtHome && ((h.owner === fs.party && !!h.system && h.system.development > 0)
        || parties.find((p) => p.faction === fs.party)!.units.some((u) => u.kind === 'starbase' && !u.dead));
      let want = false;
      if (d.withdrawAt !== null && lossFrac >= d.withdrawAt && !guarding) want = true;
      if (d.withdrawAfter && n >= d.withdrawAfter) want = true;
      if (d.withdrawIfOutmatched && n === 1) {
        const mine = sidePower(parties.filter((p) => p.faction === fs.party || (!hostileTo.get(fs.party)!.has(p.faction) && friendly(state, fs.party, p.faction))).flatMap((p) => p.units));
        const theirs = sidePower(enemyUnits(fs.party));
        if (theirs > mine * d.withdrawIfOutmatched * d.withdrawIfOutmatched) want = true;
      }
      if (hasAbility(fs.party, 'elusive') && lossFrac >= 0.3 && rng.chance(0.5)) { want = true; fs.vanish = true; }
      if (want && n < maxRounds) fs.withdrawing = true;
      else if (want && fs.vanish) fs.withdrawing = true;
    }
    // Elusive fleets slip away at once.
    for (const fs of fleets.values()) {
      if (!fs.vanish || fs.left !== undefined) continue;
      const units = unitsOfFleet(allUnits, fs.id).filter((u) => !u.dead && !u.gone && !u.pinned);
      const to = escapeHex(state, hex, fs.party);
      if (!units.length || to === null) continue;
      for (const u of units) u.gone = true;
      fs.left = to;
      lines.push(`${owned(units[0])} ${state.fleets[fs.id]?.name ?? 'fleet'} vanishes into the dark.`);
    }

    for (const p of parties) {
      const s = ps.get(p.faction)!;
      dealtTotal.set(p.faction, (dealtTotal.get(p.faction) ?? 0) + s.dealt);
      takenTotal.set(p.faction, (takenTotal.get(p.faction) ?? 0) + s.taken);
    }
    rounds.push({
      n, range: band, lines,
      sides: parties.map((p) => ({ faction: p.faction, dealt: Math.round(ps.get(p.faction)!.dealt), taken: Math.round(ps.get(p.faction)!.taken), lost: lostThisRound.get(p.faction) ?? 0 })),
    });
  }

  // Write the results back to the game state.
  const report: BattleReport = { hex, firstRound, parties: [] };
  const lostShips = new Map<FactionId, number>();
  const capturedShips = new Map<FactionId, number>();
  for (const u of allUnits) {
    if (u.kind === 'ship') {
      const s = state.ships[u.id];
      if (!s) continue;
      if (!u.dead) { s.hull = Math.max(1, Math.round(u.hull)); s.fighters = Math.max(0, Math.round(u.fighters)); }
    } else if (u.kind === 'starbase') {
      if (u.dead) delete state.starbases[u.id];
      else if (state.starbases[u.id]) state.starbases[u.id].hull = Math.max(1, Math.round(u.hull));
    } else if (h.system) {
      h.system.defense = u.dead ? 0 : Math.max(0, Math.round(u.hull / 5));
    }
  }
  // Withdrawn fleets move; ships left behind with damaged engines form their own group.
  for (const fs of fleets.values()) {
    if (fs.left === undefined) continue;
    const fl = state.fleets[fs.id];
    if (!fl) continue;
    const behind = fl.ships.filter((sid) => { const u = allUnits.find((x) => x.id === sid)!; return !u.dead && !u.gone; });
    if (behind.length) {
      const nid = newId(state, 'f');
      state.fleets[nid] = { id: nid, owner: fl.owner, name: 'Stragglers', hex, ships: behind, movesLeft: 0, path: [], doctrine: 'engage' };
      for (const sid of behind) state.ships[sid].fleet = nid;
      fl.ships = fl.ships.filter((sid) => !behind.includes(sid));
    }
    fl.hex = fs.left;
    fl.path = [];
    fl.movesLeft = 0;
    for (const sid of fl.ships) for (const c of state.ships[sid]?.cargo ?? []) if (state.agents[c]) state.agents[c].hex = fs.left;
  }
  for (const u of allUnits) {
    if (u.kind !== 'ship' || !u.dead) continue;
    const ship = state.ships[u.id];
    if (!ship) continue;
    const captor = capturedBy.get(u.id);
    if (captor) {
      captureShip(state, ship.id, captor, hex);
      capturedShips.set(u.party, (capturedShips.get(u.party) ?? 0) + 1);
      continue;
    }
    lostShips.set(u.party, (lostShips.get(u.party) ?? 0) + 1);
    const enemies = enemiesOf(u.party).map((q) => q.faction);
    for (const e of enemies) if (hasAbility(e, 'salvagers')) state.factions[e].stock.metals += Math.round(u.cost * 0.25);
    const cryx = enemies.find((e) => hasAbility(e, 'cryxAssimilation'));
    if (cryx && rng.chance(0.2) && DESIGNS[ship.design]) {
      const fid = spawnShip(state, cryx, design(ship.design), hex);
      const ns = state.ships[state.fleets[fid].ships[0]];
      ns.hull = Math.max(1, Math.round(design(ship.design).stats.hull * 0.25));
      state.fleets[fid].name = 'Risen';
      state.fleets[fid].doctrine = 'engage';
    }
    removeShip(state, ship.id);
  }
  for (const p of parties) {
    report.parties.push({
      faction: p.faction, units: p.units.length, lost: lostShips.get(p.faction) ?? 0, captured: capturedShips.get(p.faction) ?? 0,
      damage: Math.round(dealtTotal.get(p.faction) ?? 0),
    });
  }

  // Aftermath: experience, Lattice learning, spores.
  for (const q of parties) {
    if (q.faction === INDEPENDENT) continue;
    if (hasAbility(q.faction, 'distributedCognition')) state.factions[q.faction].research.progress += 5 + q.units.length;
    for (const u of q.units) {
      const s = u.kind === 'ship' && !u.dead ? state.ships[u.id] : undefined;
      if (s && s.owner === q.faction && s.xp < 3 && rng.chance(0.3)) s.xp++;
    }
    const sys = h.system;
    if (sys && hasAbility(q.faction, 'sporePayload') && enemiesOf(q.faction).some((p) => p.faction === (h.owner ?? INDEPENDENT))) {
      const floor = h.owner && hasAbility(h.owner, 'deepShelters') ? 1 : 0;
      sys.population = Math.max(floor, sys.population - 1);
    }
  }

  // Who came out ahead: the side whose enemies lost more value than it did.
  const valueLost = new Map<FactionId, number>();
  for (const u of allUnits) {
    const start = hullStart.get(u.id)!;
    const frac = u.dead ? 1 : Math.max(0, (start - u.hull) / u.maxHull);
    valueLost.set(u.party, (valueLost.get(u.party) ?? 0) + u.cost * frac);
  }
  let winner: FactionId | null = null, bestMargin = 0;
  for (const q of parties) {
    const foes = enemiesOf(q.faction).map((p) => p.faction);
    if (!foes.length) continue;
    const theirs = foes.reduce((a, e) => a + (valueLost.get(e) ?? 0), 0);
    const mine = valueLost.get(q.faction) ?? 0;
    if (theirs <= mine || theirs <= 0) continue;
    if (theirs - mine > bestMargin) { bestMargin = theirs - mine; winner = q.faction; }
    if (q.faction !== INDEPENDENT && state.factions[q.faction].kind === 'major') {
      const fl = state.factions[q.faction].flags;
      fl.battleWins = (fl.battleWins ?? 0) + 1;
      for (const e of foes) if (e !== INDEPENDENT && state.factions[e]?.kind === 'major') fl[`beat:${e}`] = 1;
    }
  }

  const involved = parties.map((p) => p.faction).filter((f) => f !== INDEPENDENT);
  const summary = report.parties.map((p) => `${p.faction} lost ${p.lost}/${p.units}${p.captured ? ` (${p.captured} captured)` : ''}`).join(', ');
  const lost: Record<string, number> = {};
  for (const p of report.parties) if (p.faction !== INDEPENDENT) lost[p.faction] = p.lost + p.captured;
  const record = recordBattle(state, hex, firstRound, parties, before, notes, dealtTotal, takenTotal, env, hostileTo, {
    fought, maxRounds, rounds, winner, valueLost, crits: new Map([...ps].map(([f, s]) => [f, s.crits])), fleets,
  });
  const rnd = fought === 1 ? '1 round' : `${fought} rounds`;
  log(state, involved, 'battle', `Battle at ${place} (${rnd}): ${summary}.`, hex, lost, record.id);
  return report;
}

function fname(f: FactionId): string {
  return f === INDEPENDENT ? 'independent' : factionDef(f).short;
}

function owned(u: Unit): string {
  return `The ${fname(u.party)}`;
}

function unitsOfFleet(all: Unit[], fleet: string): Unit[] {
  return all.filter((u) => u.fleet === fleet);
}

/** Lanchester-style strength of a group of units: firepower × durability. */
export function sidePower(units: Unit[]): number {
  let a = 0, d = 0;
  for (const u of units) {
    if (u.dead || u.gone) continue;
    a += (u.energy + u.missile + u.fighters * 6) * xpMult(u) * stateMod(u);
    d += effHP(u);
  }
  return a * d;
}

function applyHit(u: Unit, dmg: number): void {
  if (u.dead || u.gone || dmg <= 0) return;
  const soak = Math.min(u.shieldPool, dmg);
  u.shieldPool -= soak;
  u.hull -= (dmg - soak) / u.tough;
  if (u.hull <= 0.5) { u.hull = 0; u.dead = true; }
}

function pickTarget(rng: Rng, units: Unit[], huntsSupport: boolean, fleets: Map<string, FleetState>): Unit {
  const w = units.map((u) => {
    let x = u.weight;
    if (u.fleet && fleets.get(u.fleet)?.doctrine.screens && u.role === 'escort') x *= 2;
    if (huntsSupport && u.role && SUPPORT_ROLES.has(u.role)) x *= 3;
    return x;
  });
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < units.length; i++) {
    r -= w[i];
    if (r < 0) return units[i];
  }
  return units[units.length - 1];
}

function tryCapture(state: GameState, rng: Rng, u: Unit, band: RangeBand, enemies: FactionId[], capturedBy: Map<string, FactionId>): void {
  if (u.kind !== 'ship') return;
  const ship = state.ships[u.id];
  if (!ship) return;
  if (design(ship.design).role === 'cargo' && hasAbility(ship.owner, 'smugglers')) return;
  const captor = enemies.find((e) => hasAbility(e, 'boardingActions') || hasAbility(e, 'boardingParties'));
  const chance = band === 'close' ? 0.35 : band === 'medium' ? 0.2 : 0;
  if (captor && rng.chance(chance)) capturedBy.set(u.id, captor);
}

/** The best neighboring hex to withdraw to: free of enemies, preferring friendly space near home. */
function escapeHex(state: GameState, hex: number, faction: FactionId): number | null {
  const home = state.factions[faction]?.home ?? hex;
  const exits = neighbors(state.map, hex).filter((n) => state.map.hexes[n].terrain !== 'blackHole' && !hostilesAt(state, faction, n));
  if (!exits.length) return null;
  const score = (n: number) => {
    const o = state.map.hexes[n].owner;
    return (o === faction ? -10 : o && friendly(state, faction, o) ? -5 : 0) + hexDistance(state.map, n, home) * 0.5;
  };
  return exits.sort((a, b) => score(a) - score(b) || a - b)[0];
}

/** Rare battle events: most nudge one round; a very few swing the whole battle. */
function battleEvent(
  state: GameState, rng: Rng, hex: number, parties: Party[], ps: Map<FactionId, PartyState>, fleets: Map<string, FleetState>,
  enemyUnits: (f: FactionId) => Unit[], lines: string[], capturedBy: Map<string, FactionId>,
): void {
  const C = BALANCE.combat;
  const roll = rng.next();
  if (roll >= C.majorEvent + C.minorEvent) return;
  const fleetParties = parties.filter((p) => p.faction !== INDEPENDENT && p.units.some((u) => u.kind === 'ship' && !u.dead && !u.gone) && enemyUnits(p.faction).length);
  if (!fleetParties.length) return;
  const p = rng.pick(fleetParties);
  const s = ps.get(p.faction)!;
  const ships = p.units.filter((u) => u.kind === 'ship' && !u.dead && !u.gone);
  const who = `the ${fname(p.faction)}`;
  if (roll < C.majorEvent) {
    const largest = [...ships].sort((a, b) => b.size - a.size || b.cost - a.cost)[0];
    const crippled = ships.filter((u) => isCrippled(u.hull, u.maxHull));
    const foeShips = enemyUnits(p.faction).filter((u) => u.kind === 'ship');
    const foeCrippled = foeShips.filter((u) => isCrippled(u.hull, u.maxHull) && u.party !== INDEPENDENT);
    const options: (() => void)[] = [
      () => {
        largest.hull = 0; largest.dead = true;
        for (const u of ships) if (u !== largest) applyHit(u, u.maxHull * u.tough * 0.15);
        lines.push(`★ Disaster: the reactor of ${who} ${largest.name} breaches! It is destroyed and the blast damages every ship nearby.`);
      },
      () => { s.battleMod *= 1.4; lines.push(`★ A brilliant ${fname(p.faction)} commander takes charge: +40% fire for the rest of the battle.`); },
      () => {
        s.battleMod *= 0.7;
        for (const fs of fleets.values()) if (fs.party === p.faction && fs.doctrine !== DOCTRINES.fullAttack && !hasAbility(p.faction, 'wayOfTheBlade')) fs.withdrawing = true;
        lines.push(`★ The ${fname(p.faction)} flagship's bridge is destroyed and the fleet commander killed: −30% fire, and their fleets fall back.`);
      },
    ];
    if (crippled.length && foeShips.length) {
      options.push(() => {
        const ram = crippled[0];
        const target = [...foeShips].sort((a, b) => b.size - a.size || b.cost - a.cost)[0];
        ram.hull = 0; ram.dead = true; target.hull = 0; target.dead = true;
        lines.push(`★ The crippled ${fname(p.faction)} ${ram.name} rams the enemy ${target.name}! Both ships are lost.`);
      });
    }
    if (state.map.hexes[hex].system) {
      options.push(() => {
        for (const q of parties) for (const u of q.units) if (u.kind === 'ship') applyHit(u, u.maxHull * u.tough * 0.2);
        lines.push('★ The star flares violently: every ship in the battle takes heavy damage.');
      });
    }
    if (foeCrippled.length) {
      options.push(() => {
        for (const u of foeCrippled) { u.dead = true; u.hull = 0; capturedBy.set(u.id, p.faction); }
        lines.push(`★ The crews of ${foeCrippled.length} crippled enemy ship${foeCrippled.length > 1 ? 's' : ''} surrender to the ${fname(p.faction)}.`);
      });
    }
    rng.pick(options)();
    return;
  }
  const damaged = ships.filter((u) => u.hull < u.maxHull * 0.75);
  const options: (() => void)[] = [
    () => { s.roundMod *= 0.85; lines.push(`Sensor ghosts confuse ${who} gunners: −15% fire this round.`); },
    () => { s.roundMod *= 1.15; lines.push(`Inspired gunnery: ${who} fire hits home, +15% this round.`); },
    () => { for (const x of ps.values()) x.roundMod *= 0.9; lines.push('Drifting wreckage fouls everyone\'s aim: −10% fire this round.'); },
    () => { s.noWithdraw = true; lines.push(`${who[0].toUpperCase()}${who.slice(1)} communications are jammed: none of their fleets can pull out after this round.`); },
  ];
  if (damaged.length) {
    options.push(() => {
      const u = rng.pick(damaged);
      u.hull = Math.min(u.maxHull, u.hull + u.maxHull * 0.15);
      lines.push(`Damage-control teams patch up ${who} ${u.name} mid-battle.`);
    });
  }
  if (p.units.some((u) => u.fighters > 0)) options.push(() => { s.grounded = true; lines.push(`${who[0].toUpperCase()}${who.slice(1)} fighters launch late and miss this round.`); });
  rng.pick(options)();
}

interface Snapshot {
  faction: FactionId;
  ships: { id: string; design: string; hull: number; fighters: number }[];
  starbase?: { id: string; tier: number; hull: number };
  planet?: number;
}

function snapshot(state: GameState, hex: number, parties: Party[]): Snapshot[] {
  return parties.map((p) => {
    const snap: Snapshot = { faction: p.faction, ships: [] };
    for (const u of p.units) {
      if (u.kind === 'ship') {
        const s = state.ships[u.id];
        snap.ships.push({ id: u.id, design: s.design, hull: s.hull, fighters: s.fighters });
      } else if (u.kind === 'starbase') {
        snap.starbase = { id: u.id, tier: state.starbases[u.id].tier, hull: state.starbases[u.id].hull };
      } else {
        snap.planet = state.map.hexes[hex].system?.defense ?? 0;
      }
    }
    return snap;
  });
}

interface RecordExtras {
  fought: number;
  maxRounds: number;
  rounds: BattleRoundLog[];
  winner: FactionId | null;
  valueLost: Map<FactionId, number>;
  crits: Map<FactionId, number>;
  fleets: Map<string, FleetState>;
}

/** Builds and stores the detailed record shown in the battle report dialog. */
function recordBattle(
  state: GameState, hex: number, firstRound: boolean, parties: Party[], before: Snapshot[], notes: Map<FactionId, Set<string>>,
  dealt: Map<FactionId, number>, taken: Map<FactionId, number>, env: number, hostileTo: Map<FactionId, Set<FactionId>>, x: RecordExtras,
): BattleRecord {
  const h = state.map.hexes[hex];
  const sides: BattleSide[] = before.map((snap) => {
    const byDesign = new Map<string, BattleSide['ships'][number]>();
    let fBefore = 0, fAfter = 0;
    for (const s of snap.ships) {
      const row = byDesign.get(s.design) ?? { design: s.design, before: 0, destroyed: 0, captured: 0, damaged: 0, crippled: 0, hullBefore: 0, hullAfter: 0 };
      byDesign.set(s.design, row);
      row.before++;
      row.hullBefore += s.hull;
      fBefore += s.fighters;
      const now = state.ships[s.id];
      if (!now) row.destroyed++;
      else if (now.owner !== snap.faction) row.captured++;
      else {
        row.hullAfter += now.hull;
        fAfter += now.fighters;
        const max = design(now.design).stats.hull;
        if (isCrippled(now.hull, max)) row.crippled!++;
        else if (now.hull < s.hull) row.damaged++;
      }
    }
    const party = parties.find((p) => p.faction === snap.faction)!;
    const myFleets = [...x.fleets.values()].filter((f) => f.party === snap.faction);
    const docs = [...new Set(myFleets.map((f) => f.doctrine.name))];
    const side: BattleSide = {
      faction: snap.faction, attack: Math.round(sidePowerParts(party.units).attack), durability: Math.round(sidePowerParts(party.units).durability),
      dealt: Math.round(dealt.get(snap.faction) ?? 0), taken: Math.round(taken.get(snap.faction) ?? 0),
      ships: [...byDesign.values()], fighters: { before: fBefore, after: fAfter }, notes: [...(notes.get(snap.faction) ?? [])],
      withdrew: myFleets.filter((f) => f.left !== undefined).length, valueLost: Math.round(x.valueLost.get(snap.faction) ?? 0), crits: x.crits.get(snap.faction) ?? 0,
    };
    if (docs.length) side.notes.unshift(`Doctrine: ${docs.join(', ')}.`);
    if (snap.starbase) side.starbase = { tier: snap.starbase.tier, hullBefore: snap.starbase.hull, hullAfter: state.starbases[snap.starbase.id]?.hull ?? 0 };
    if (snap.planet !== undefined) side.planet = { system: h.system?.name ?? '', defenseBefore: snap.planet, defenseAfter: h.system?.defense ?? 0 };
    if (!hostileTo.get(snap.faction)!.size) side.notes.push('Took no part in the fighting.');
    if (snap.ships.some((s) => ROLES[design(s.design).role].escort)) side.notes.push('Its escorts drew enemy fire away from the other ships.');
    return side;
  });
  const terrainNote = env === 0.5 ? 'Shields worked at half strength inside the nebula.' : env === 0 ? 'Shields failed inside the ion storm.' : '';
  if (terrainNote) for (const s of sides) s.notes.push(terrainNote);
  const record: BattleRecord = {
    id: newId(state, 'w'), turn: state.turn, seq: state.seq, hex, place: h.system?.name ?? 'deep space', terrain: h.terrain, firstRound, sides,
    fought: x.fought, maxRounds: x.maxRounds, rounds: x.rounds, winner: x.winner,
  };
  state.battleLog ??= [];
  state.battleLog.push(record);
  return record;
}

/** Starting firepower and durability of a set of units (before luck and doctrine). */
function sidePowerParts(units: Unit[]): { attack: number; durability: number } {
  let attack = 0, durability = 0;
  for (const u of units) {
    attack += (u.energy + u.missile + u.fighters * 6) * xpMult(u);
    durability += u.maxHull * u.tough;
  }
  return { attack, durability };
}

/** Faction, terrain and ability modifiers on a party's fire. Exported for the battle forecast. */
export function partyMultiplier(state: GameState, hex: number, p: { faction: FactionId }, enemies: { faction: FactionId }[], firstRound: boolean, foes: Unit[]): { mult: number; reasons: string[] } {
  if (p.faction === INDEPENDENT) return { mult: 1, reasons: [] };
  const f = p.faction;
  let m = 1;
  const reasons: string[] = [];
  const add = (d: number, why: string) => { m += d; reasons.push(`${why}: ${d > 0 ? '+' : ''}${Math.round(d * 100)}% attack.`); };
  if (state.factions[f].flags.unsupplied) add(-BALANCE.negativeEnergyCombatPenalty, 'Out of energy (unsupplied)');
  if (firstRound && hasAbility(f, 'wayOfTheBlade')) add(0.25, 'Way of the Blade, opening battle');
  if (firstRound && enemies.some((e) => hasAbility(e.faction, 'harmonicCalm'))) add(-0.2, 'Myrr Harmonic Calm, opening battle');
  const terrain = state.map.hexes[hex].terrain;
  if (hasAbility(f, 'ambush') && (terrain === 'nebula' || terrain === 'asteroids')) add(0.3, 'Ambush from cover');
  if (hasAbility(f, 'stampede') && state.map.hexes[hex].owner === f) add(0.2, 'Stampede on home ground');
  const owner = state.map.hexes[hex].owner;
  if (owner && owner !== f && hasAbility(owner, 'bribery') && enemies.some((e) => e.faction === owner)) add(-0.3, 'Crews bribed by the Ophidian Syndicate');
  if (hasAbility(f, 'grudge') && enemies.some((e) => e.faction === 'lattice')) add(0.25, 'Grudge against the Lattice');
  if (enemies.some((e) => state.factions[f].flags[`grudge:${e.faction}`])) add(0.1, 'Avenging a broken treaty');
  if (hasAbility(f, 'huntersInstinct')) {
    const hp = foes.reduce((a, u) => a + u.hull, 0), max = foes.reduce((a, u) => a + u.maxHull, 0);
    if (max > 0 && hp / max < 0.9) add(0.3, "Hunter's Instinct against damaged prey");
  }
  return { mult: Math.max(0.1, m), reasons };
}

function captureShip(state: GameState, shipId: string, captor: FactionId, hex: number): void {
  const s = state.ships[shipId];
  const d = design(s.design);
  const oldFleet = state.fleets[s.fleet];
  if (oldFleet) {
    oldFleet.ships = oldFleet.ships.filter((x) => x !== shipId);
    if (oldFleet.ships.length === 0) delete state.fleets[oldFleet.id];
  }
  for (const c of s.cargo) { delete state.armies[c]; delete state.agents[c]; }
  const fid = newId(state, 'f');
  state.fleets[fid] = { id: fid, owner: captor, name: `Prize ${d.name}`, hex, ships: [shipId], movesLeft: 0, path: [], doctrine: 'retreat' };
  s.owner = captor;
  s.fleet = fid;
  s.cargo = [];
  s.hull = Math.max(1, Math.round(d.stats.hull * 0.25));
  log(state, [captor, d.faction], 'captured', `${captor} boarded and captured a ${d.name}.`, hex);
}

/** Repairs and fighter restocking at the start of a faction's turn. */
export function repairFleets(state: GameState, faction: FactionId): void {
  const docks = new Set(Object.values(state.starbases).filter((b) => b.owner === faction).map((b) => b.hex));
  state.map.hexes.forEach((h, i) => { if (h.owner === faction && h.system?.improvements.some((x) => x === 'shipyard' || x === 'heavyShipyard')) docks.add(i); });
  let bonus = 0;
  if (hasAbility(faction, 'selfRepair') || hasAbility(faction, 'mechSelfRepair')) bonus += 0.15;
  if (hasAbility(faction, 'regrowth')) bonus += 0.1;
  if (hasAbility(faction, 'livingHulls')) bonus += 0.2;
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== faction) continue;
    const owned = state.map.hexes[f.hex].owner === faction;
    let rate = bonus;
    if (docks.has(f.hex)) rate += BALANCE.repairDock;
    else if (owned) rate += BALANCE.repairFriendly;
    for (const sid of f.ships) {
      const s = state.ships[sid];
      const d = design(s.design);
      if (rate > 0) s.hull = Math.min(d.stats.hull, Math.round(s.hull + d.stats.hull * rate));
      if (owned && s.fighters < d.stats.hangar) s.fighters = Math.min(d.stats.hangar, s.fighters + Math.max(1, Math.ceil(d.stats.hangar / 3)));
    }
  }
}
