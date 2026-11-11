/** Relations, war and peace, treaties, trade proposals, agreements, vassals and opinion (§9). */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { factionDef, hasAbility, modifiersOf } from '../data/factions';
import { TECH_BY_ID, TECHS } from '../data/techs';
import { adjustOpinion, hasEmbassy, opinionOf, releaseAgent } from './agents';
import { setBits } from './bitset';
import { factionIncome } from './economy';
import { log } from './events';
import { newId } from './ids';
import { atWar, ownedHexes, relation } from './query';
import { hexDistance } from './hex';
import { grantTech, techCost, techEffects } from './research';
import type { FactionId, GameState, Proposal, Relation, RelationStatus, TradeItem } from './types';

export type Result = { ok: true; text?: string } | { ok: false; reason: string };

export const AGREEMENTS = {
  trade: { name: 'Trade Agreement', text: 'Each side gets energy equal to 10% of the other’s energy income.' },
  research: { name: 'Research Agreement', text: 'Each side gets 10% of the other’s science.' },
  economic: { name: 'Economic Agreement', text: 'Each side gets +10% metals.' },
  manufacturing: { name: 'Manufacturing Agreement', text: 'Ships cost 10% less for both sides.' },
  openBorders: { name: 'Open Borders', text: 'Fleets may pass through each other’s territory without tension.' },
} as const;
export type AgreementId = keyof typeof AGREEMENTS;

const TREATY_STATUSES: RelationStatus[] = ['nap', 'alliance'];

function setStatus(state: GameState, r: Relation, status: RelationStatus): void {
  r.status = status;
  r.since = state.turn;
  if (status !== 'war') r.aggressor = null;
}

export function hasAgreement(state: GameState, a: FactionId, b: FactionId, ag: AgreementId): boolean {
  return a !== b && relation(state, a, b).agreements.includes(ag);
}

/** Majors only declare war on factions they have met. Breaking a treaty costs opinion with everyone. */
export function declareWar(state: GameState, from: FactionId, to: FactionId): Result {
  if (from === to) return { ok: false, reason: 'You cannot declare war on yourself.' };
  const r = relation(state, from, to);
  if (!r.contact) return { ok: false, reason: 'You have not met them.' };
  if (r.status === 'war') return { ok: false, reason: 'Already at war.' };
  if (state.factions[to].overlord === from || state.factions[from].overlord === to) {
    return { ok: false, reason: 'Release the vassal first.' };
  }
  const breaking = TREATY_STATUSES.includes(r.status);
  if (breaking && hasAbility(from, 'honorBound')) {
    return { ok: false, reason: "The Ryn'kai never break a treaty first. Cancel it and wait 3 turns." };
  }
  if (breaking) breakTreatyPenalty(state, from, to);
  setStatus(state, r, 'war');
  r.aggressor = from;
  r.agreements = [];
  adjustOpinion(state, to, from, -30);
  if (hasAbility(from, 'lightningWar')) state.factions[from].flags.lightningUntil = state.turn + 3;
  log(state, [], 'war', `${factionDef(from).name} declared war on ${factionDef(to).name}.`);
  // Allies and vassals of the target join the war; so do the aggressor's vassals.
  for (const id of Object.keys(state.factions)) {
    if (id === from || id === to || !state.factions[id].alive) continue;
    const joinDefender = relation(state, id, to).status === 'alliance' || state.factions[id].overlord === to;
    const joinAttacker = state.factions[id].overlord === from;
    const rel = relation(state, id, from);
    if (joinDefender && rel.status !== 'war' && rel.status !== 'alliance' && state.factions[from].overlord !== id) {
      rel.contact = true;
      setStatus(state, rel, 'war');
      rel.aggressor = from;
      rel.agreements = [];
      log(state, [], 'war', `${factionDef(id).name} joined the war against ${factionDef(from).name}.`);
    }
    const rel2 = relation(state, id, to);
    if (joinAttacker && rel2.status !== 'war') {
      rel2.contact = true;
      setStatus(state, rel2, 'war');
      rel2.aggressor = from;
      rel2.agreements = [];
    }
  }
  return { ok: true };
}

function breakTreatyPenalty(state: GameState, breaker: FactionId, victim: FactionId): void {
  const mult = modifiersOf(breaker).treatyBreak;
  for (const id of Object.keys(state.factions)) if (id !== breaker) adjustOpinion(state, id, breaker, -BALANCE.treatyBreakPenalty * mult);
  adjustOpinion(state, victim, breaker, -20 * mult);
  if (hasAbility(victim, 'honorBound')) {
    adjustOpinion(state, victim, breaker, -50);
    state.factions[victim].flags[`grudge:${breaker}`] = 1;
  }
  log(state, [], 'treaty', `${factionDef(breaker).name} broke its treaty with ${factionDef(victim).name}.`);
}

/** Cancels a pact or alliance with notice: it lapses to plain relations after 3 turns, without penalty. */
export function cancelTreaty(state: GameState, from: FactionId, to: FactionId): Result {
  const r = relation(state, from, to);
  if (!TREATY_STATUSES.includes(r.status)) return { ok: false, reason: 'No treaty to cancel.' };
  state.factions[from].flags[`cancel:${to}`] = state.turn + 3;
  log(state, [from, to], 'treaty', `${factionDef(from).name} gave notice to end its treaty with ${factionDef(to).name}.`);
  return { ok: true };
}

/** Whether `from` may send proposals to `to` (needs an embassy, or the Haldane Free Port). */
export function canPropose(state: GameState, from: FactionId, to: FactionId): boolean {
  if (from === to || !state.factions[to]?.alive) return false;
  const r = relation(state, from, to);
  if (!r.contact) return false;
  if (hasAbility(to, 'freePort') || hasAbility(from, 'freePort')) return true;
  return hasEmbassy(state, from, to) || hasEmbassy(state, to, from);
}

export function propose(state: GameState, from: FactionId, to: FactionId, give: TradeItem[], receive: TradeItem[]): Result & { id?: string } {
  if (!canPropose(state, from, to)) return { ok: false, reason: 'You need an embassy to negotiate.' };
  if (give.length + receive.length === 0) return { ok: false, reason: 'Empty proposal.' };
  for (const item of give) {
    const v = validItem(state, from, to, item);
    if (!v.ok) return v;
  }
  for (const item of receive) {
    // Asking for "a technology of their choice" never reveals whether they have one: that shows on acceptance.
    if (item.kind === 'anyTech') continue;
    const v = validItem(state, to, from, item);
    if (!v.ok) return v;
  }
  const id = newId(state, 'p');
  state.proposals[id] = { id, from, to, turn: state.turn, give, receive, answer: null };
  log(state, [from, to], 'proposal', `${factionDef(from).name} sent a proposal to ${factionDef(to).name}.`);
  return { ok: true, id };
}

/**
 * The tech `giver` hands over for "a technology of your choice": the cheapest it knows that `taker` lacks
 * (lowest tier, then tree order). Null when it knows nothing the taker doesn't.
 */
export function anyTechChoice(state: GameState, giver: FactionId, taker: FactionId): string | null {
  const theirs = new Set(state.factions[taker].research.known);
  const options = state.factions[giver].research.known.filter((t) => !theirs.has(t) && t !== 'ascension' && TECH_BY_ID[t]);
  options.sort((a, b) => TECH_BY_ID[a].tier - TECH_BY_ID[b].tier || TECHS.indexOf(TECH_BY_ID[a]) - TECHS.indexOf(TECH_BY_ID[b]));
  return options[0] ?? null;
}

/** Can `giver` hand this item to `taker`? */
function validItem(state: GameState, giver: FactionId, taker: FactionId, item: TradeItem): Result {
  const g = state.factions[giver];
  const r = relation(state, giver, taker);
  switch (item.kind) {
    case 'resource':
      if (item.amount <= 0) return { ok: false, reason: 'Amounts must be positive.' };
      if (!item.perTurn && g.stock[item.resource] < item.amount) return { ok: false, reason: `Not enough ${item.resource}.` };
      return { ok: true };
    case 'anyTech':
      return anyTechChoice(state, giver, taker) ? { ok: true } : { ok: false, reason: 'No technology to give.' };
    case 'tech':
      if (!g.research.known.includes(item.tech)) return { ok: false, reason: 'They do not know that tech.' };
      if (state.factions[taker].research.known.includes(item.tech)) return { ok: false, reason: 'Already known.' };
      return { ok: true };
    case 'fleet': {
      const f = state.fleets[item.fleet];
      return f && f.owner === giver ? { ok: true } : { ok: false, reason: 'No such fleet.' };
    }
    case 'hex': {
      const h = state.map.hexes[item.hex];
      if (!h || h.owner !== giver) return { ok: false, reason: 'Not their territory.' };
      if (h.system?.homeOf === giver) return { ok: false, reason: 'A home system cannot be traded.' };
      return { ok: true };
    }
    case 'army': {
      const a = state.armies[item.army];
      if (!a || a.owner !== giver) return { ok: false, reason: 'No such army.' };
      if (a.hex === null) return { ok: false, reason: 'Armies aboard ships cannot be traded; land them first.' };
      if (a.rentedFrom) return { ok: false, reason: 'Hired armies are not yours to trade.' };
      return { ok: true };
    }
    case 'agreement':
      if (!(item.agreement in AGREEMENTS)) return { ok: false, reason: 'Unknown agreement.' };
      if (r.status === 'war') return { ok: false, reason: 'Make peace first.' };
      if (r.agreements.includes(item.agreement)) return { ok: false, reason: 'Already agreed.' };
      return { ok: true };
    case 'status':
      if (item.status === 'nap' || item.status === 'alliance') {
        if (r.status === 'war') return { ok: false, reason: 'Make peace first.' };
        if (r.status === item.status) return { ok: false, reason: 'Already in place.' };
        return { ok: true };
      }
      if (item.status === 'relations' || item.status === 'neutral') {
        return r.status === 'war' ? { ok: true } : { ok: false, reason: 'You are not at war.' };
      }
      return { ok: false, reason: 'Not negotiable.' };
    case 'vassal':
      if (g.kind !== 'minor' || state.factions[taker].kind !== 'major') return { ok: false, reason: 'Only minors can become vassals of majors.' };
      if (g.overlord) return { ok: false, reason: 'Already a vassal.' };
      return { ok: true };
    case 'returnAgent': {
      const a = state.agents[item.agent];
      return a && a.capturedBy === giver && a.owner === taker ? { ok: true } : { ok: false, reason: 'No such prisoner.' };
    }
    case 'map':
      return { ok: true };
    default:
      return { ok: false, reason: 'Unknown item.' };
  }
}

export function rejectProposal(state: GameState, id: string): Result {
  const p = state.proposals[id];
  if (!p || p.answer) return { ok: false, reason: 'No such proposal.' };
  p.answer = 'rejected';
  log(state, [p.from, p.to], 'proposal', `${factionDef(p.to).name} rejected the proposal from ${factionDef(p.from).name}.`);
  return { ok: true };
}

export function acceptProposal(state: GameState, id: string): Result {
  const p = state.proposals[id];
  if (!p || p.answer) return { ok: false, reason: 'No such proposal.' };
  for (const item of p.give) if (!validItem(state, p.from, p.to, item).ok) return rejectAsStale(state, p);
  for (const item of p.receive) if (!validItem(state, p.to, p.from, item).ok) return rejectAsStale(state, p);
  for (const item of p.give) transfer(state, p.from, p.to, item);
  for (const item of p.receive) transfer(state, p.to, p.from, item);
  p.answer = 'accepted';
  adjustOpinion(state, p.from, p.to, 5);
  adjustOpinion(state, p.to, p.from, 5);
  log(state, [p.from, p.to], 'proposal', `${factionDef(p.to).name} accepted the proposal from ${factionDef(p.from).name}.`);
  return { ok: true };
}

function rejectAsStale(state: GameState, p: Proposal): Result {
  p.answer = 'rejected';
  return { ok: false, reason: 'The proposal is no longer possible.' };
}

function transfer(state: GameState, giver: FactionId, taker: FactionId, item: TradeItem): void {
  const g = state.factions[giver], t = state.factions[taker];
  const r = relation(state, giver, taker);
  switch (item.kind) {
    case 'resource':
      if (item.perTurn) {
        state.payments.push({ from: giver, to: taker, resource: item.resource, amount: item.amount, until: state.turn + item.perTurn - 1 });
      } else {
        g.stock[item.resource] -= item.amount;
        t.stock[item.resource] += item.amount;
        adjustOpinion(state, taker, giver, Math.min(15, item.amount / 20));
      }
      break;
    case 'tech':
      grantTech(state, taker, item.tech);
      break;
    case 'anyTech': {
      const t = anyTechChoice(state, giver, taker);
      if (t) {
        grantTech(state, taker, t);
        log(state, [giver, taker], 'proposal', `${factionDef(giver).name} shared ${TECH_BY_ID[t].name} with ${factionDef(taker).name}.`);
      }
      break;
    }
    case 'fleet': {
      const f = state.fleets[item.fleet];
      f.owner = taker;
      f.path = [];
      f.movesLeft = 0;
      for (const sid of f.ships) {
        state.ships[sid].owner = taker;
        for (const c of state.ships[sid].cargo) {
          if (state.armies[c]) state.armies[c].owner = taker;
          if (state.agents[c]) { state.ships[sid].cargo = state.ships[sid].cargo.filter((x) => x !== c); delete state.agents[c]; }
        }
      }
      break;
    }
    case 'army': {
      const a = state.armies[item.army];
      a.owner = taker;
      a.ship = null;
      a.hex = t.home;
      break;
    }
    case 'hex':
      // The giver's garrison goes home; a starbase there changes hands with the territory.
      for (const a of Object.values(state.armies)) if (a.owner === giver && a.hex === item.hex) a.hex = g.home;
      for (const b of Object.values(state.starbases)) if (b.owner === giver && b.hex === item.hex) b.owner = taker;
      state.map.hexes[item.hex].owner = taker;
      state.map.hexes[item.hex].pendingClaim = null;
      if (state.map.hexes[item.hex].system) state.map.hexes[item.hex].system!.queue = [];
      break;
    case 'agreement':
      if (!r.agreements.includes(item.agreement)) r.agreements.push(item.agreement);
      if (r.status === 'neutral' || r.status === 'hostile') setStatus(state, r, 'relations');
      break;
    case 'status':
      if (item.status === 'relations' || item.status === 'neutral') {
        setStatus(state, r, hasEmbassy(state, giver, taker) || hasEmbassy(state, taker, giver) ? 'relations' : 'neutral');
        log(state, [], 'peace', `${factionDef(giver).name} and ${factionDef(taker).name} made peace.`);
      } else {
        setStatus(state, r, item.status);
        delete g.flags[`cancel:${taker}`];
        delete t.flags[`cancel:${giver}`];
        log(state, [], 'treaty', `${factionDef(giver).name} and ${factionDef(taker).name} signed a ${item.status === 'nap' ? 'non-aggression pact' : 'alliance'}.`);
      }
      break;
    case 'vassal':
      g.overlord = taker;
      setStatus(state, r, 'alliance');
      log(state, [], 'vassal', `${factionDef(giver).name} became a vassal of ${factionDef(taker).name}.`);
      break;
    case 'returnAgent':
      releaseAgent(state, item.agent);
      break;
    case 'map':
      t.explored = setBits(t.explored, bitsToIndices(g.explored, state.map.hexes.length));
      break;
  }
}

function bitsToIndices(bits: string, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = bits.charCodeAt(i >> 2);
    const v = c <= 57 ? c - 48 : c - 87;
    if ((v >> (i & 3)) & 1) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Valuation (used by computer players to judge proposals, and by abilities that change acceptance)

/** Value of an item to `to` when handed over by `from`, in rough energy-equivalent points. */
export function itemValue(state: GameState, from: FactionId, to: FactionId, item: TradeItem): number {
  switch (item.kind) {
    case 'resource': {
      const per = item.resource === 'exotics' ? 4 : item.resource === 'metals' ? 1.2 : 1;
      return item.amount * per * (item.perTurn ?? 1);
    }
    case 'tech': {
      const disc = hasAbility(from, 'prototypeLab') || hasAbility(to, 'prototypeLab') ? 0.7 : 1;
      return techCost(item.tech) * 1.2 * disc;
    }
    case 'anyTech': {
      const t = anyTechChoice(state, from, to);
      return t ? itemValue(state, from, to, { kind: 'tech', tech: t }) : 0;
    }
    case 'fleet': {
      const f = state.fleets[item.fleet];
      return f ? f.ships.reduce((a, s) => a + design(state.ships[s].design).cost.metals * 1.2 + design(state.ships[s].design).cost.energy, 0) : 0;
    }
    case 'hex': {
      const sys = state.map.hexes[item.hex].system;
      return sys ? 80 + sys.development * 60 + sys.population * 10 : 15;
    }
    case 'army': {
      const a = state.armies[item.army];
      return a ? a.strength * 4 * (1 + 0.1 * a.xp) : 0;
    }
    case 'agreement': {
      const theirs = factionIncome(state, from).gross;
      const hub = hasAbility(from, 'tradeHub') || hasAbility(to, 'tradeHub') ? 1.5 : 1;
      if (item.agreement === 'trade') return theirs.energy * 0.1 * 20 * hub;
      if (item.agreement === 'research') return theirs.science * 0.1 * 20;
      if (item.agreement === 'economic') return factionIncome(state, to).gross.metals * 0.1 * 20;
      if (item.agreement === 'manufacturing') return 40;
      return 10;
    }
    case 'status':
      return 0;
    case 'vassal':
      return 400;
    case 'returnAgent':
      return 40;
    case 'map':
      return 30;
    default:
      return 0;
  }
}

/** Military strength (sum of combat value) of a faction. */
export function militaryStrength(state: GameState, faction: FactionId): number {
  let s = 0;
  for (const ship of Object.values(state.ships)) {
    if (ship.owner !== faction) continue;
    const d = design(ship.design).stats;
    s += (d.energy + d.missile + d.hangar * 4) * Math.sqrt(ship.hull + d.shields * 3);
  }
  return s;
}

/** Positive means the recipient (computer) would accept. */
/** Turns a pact has to hold before the two sides will talk about an alliance. */
export const ALLIANCE_AFTER_PACT = 10;

/**
 * Why `p.to` (a computer power) refuses a proposal's pact, alliance or vassalage outright, however much
 * else is offered: these are decisions, not purchases. Null when there is no such objection.
 */
export function statusObjection(state: GameState, p: Proposal): string | null {
  const to = p.to, from = p.from;
  const r = relation(state, from, to);
  const op = Math.round(opinionOf(state, to, from));
  const pers = factionDef(to).personality;
  const name = factionDef(to).short;
  const items = [...p.give, ...p.receive];
  for (const s of items) {
    if (s.kind !== 'status') continue;
    if (s.status === 'nap' && op < 10) return `The ${name} don't trust you enough for a pact yet: their opinion of you is ${op}, and needs to be at least +10.`;
    if (s.status === 'alliance') {
      const held = r.status === 'nap' ? state.turn - r.since : 0;
      if (held < ALLIANCE_AFTER_PACT) {
        return r.status === 'nap'
          ? `An alliance needs a non-aggression pact that has held for ${ALLIANCE_AFTER_PACT} turns. Yours has held ${held}.`
          : `An alliance needs a non-aggression pact first, held for ${ALLIANCE_AFTER_PACT} turns.`;
      }
      if (op < 40) return `Their opinion of you is ${op}. An ally's needs to be at least +40.`;
      if (sharedEnemies(state, from, to) === 0 && !(pers.diplomacy >= 0.6 && op >= 60)) {
        return `The ${name} see no common enemy to fight together. Be at war with someone they are at war with${pers.diplomacy >= 0.6 ? ', or win their opinion to +60' : ''}.`;
      }
      if (hasAbility(to, 'honorBound') && militaryStrength(state, from) < militaryStrength(state, to) * 0.6) return 'The Ryn\'kai ally only with the strong. Build up your fleet.';
      if (hasAbility(to, 'distributedCognition') && militaryStrength(state, from) < militaryStrength(state, to) * 0.4) return 'The Lattice calculates that you would add too little to an alliance.';
      // Nobody wants to be the last piece of someone else's Grand Alliance.
      const others = Object.values(state.factions).filter((f) => f.kind === 'major' && f.alive && f.id !== from && f.id !== to);
      if (state.factions[from].kind === 'major' && others.every((o) => relation(state, from, o.id).status === 'alliance') && op < 80) {
        return `Every other great power is already your ally. The ${name} will not complete your Grand Alliance unless their opinion of you reaches +80 (it is ${op}).`;
      }
    }
  }
  // Becoming a vassal: only to a much stronger power they like, and only with a reason.
  const vassalOf = p.receive.some((i) => i.kind === 'vassal') ? from : p.give.some((i) => i.kind === 'vassal') ? null : undefined;
  if (vassalOf) {
    const mine = militaryStrength(state, to), theirs = militaryStrength(state, vassalOf);
    if (theirs < mine * 3) return `The ${name} will only bow to a power at least three times as strong as they are.`;
    const held = Object.values(state.factions).filter((f) => f.overlord === vassalOf).length;
    const need = 40 + held * 10;
    if (op < need && !atWar(state, to, vassalOf)) return `Their opinion of you is ${op}; it needs to be at least +${need}${held ? ` (each vassal you already hold makes the others warier)` : ''}.`;
    const home = state.factions[to].home;
    const nearby = Object.values(state.fleets).filter((f) => f.owner === vassalOf && hexDistance(state.map, f.hex, home) <= 3)
      .reduce((a, f) => a + f.ships.length, 0);
    const threatened = Object.keys(state.factions).some((x) => x !== vassalOf && atWar(state, to, x) && militaryStrength(state, x) > mine);
    if (nearby < 3 && !threatened && !atWar(state, to, vassalOf)) {
      return `The ${name} see no reason to give up their independence: bring a fleet (at least 3 ships) within 3 hexes of their home, or wait until an enemy they can't face alone threatens them.`;
    }
  }
  return null;
}

export function proposalScore(state: GameState, p: Proposal): number {
  const to = p.to, from = p.from;
  if (statusObjection(state, p)) return -1000;
  const pers = factionDef(to).personality;
  const gain = p.give.reduce((a, i) => a + itemValue(state, from, to, i), 0);
  const cost = p.receive.reduce((a, i) => a + itemValue(state, to, from, i), 0);
  const opinion = opinionOf(state, to, from);
  let score = gain - cost + opinion * 2;
  const r = relation(state, from, to);
  const statusItems = [...p.give, ...p.receive].filter((i) => i.kind === 'status');
  for (const s of statusItems) {
    if (s.kind !== 'status') continue;
    if (s.status === 'nap') score += (pers.diplomacy - pers.aggression) * 60 + (opinion > 0 ? 20 : -20);
    if (s.status === 'alliance') score += (pers.diplomacy - 0.5) * 80 + opinion - 40 + sharedEnemies(state, from, to) * 40;
    if (s.status === 'relations' || s.status === 'neutral') {
      // Peace: likelier when losing or after a long war.
      const mine = militaryStrength(state, to), theirs = militaryStrength(state, from);
      score += (theirs - mine) / Math.max(1, mine + theirs) * 120 + (state.turn - r.since) * 3 - pers.aggression * 50;
    }
  }
  if ([...p.give, ...p.receive].some((i) => i.kind === 'vassal')) {
    const mine = militaryStrength(state, to), theirs = militaryStrength(state, from);
    score += (theirs >= mine * 3 ? 150 : -150) + opinion * 2 - 120;
  }
  const agreements = [...p.give, ...p.receive].filter((i) => i.kind === 'agreement').length;
  if (agreements && r.status === 'war') score -= 1000;
  // Ability-driven acceptance modifiers.
  let mult = 1 + modifiersOf(from).diplomacy + techEffects(state, from).diplomacy;
  if (hasAbility(from, 'openSociety')) mult += 0.5;
  if (hasAbility(from, 'calculatedDiplomacy') && weakerThanAverage(state, from)) mult += 0.4;
  if (hasAbility(from, 'royalMarriage') || hasAbility(to, 'royalMarriage')) {
    if ([...p.give, ...p.receive].some((i) => i.kind === 'vassal' || (i.kind === 'status' && i.status === 'alliance'))) mult += 0.5;
  }
  return score + (mult - 1) * Math.max(20, Math.abs(score) * 0.5);
}

function weakerThanAverage(state: GameState, f: FactionId): boolean {
  const majors = Object.values(state.factions).filter((x) => x.kind === 'major' && x.alive);
  const avg = majors.reduce((a, m) => a + militaryStrength(state, m.id), 0) / Math.max(1, majors.length);
  return militaryStrength(state, f) < avg;
}

export function sharedEnemies(state: GameState, a: FactionId, b: FactionId): number {
  let n = 0;
  for (const id of Object.keys(state.factions)) if (id !== a && id !== b && atWar(state, a, id) && atWar(state, b, id)) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------------------
// Per-turn upkeep

/** Agreement income and payments for a faction this turn (applied at start of turn). */
export function diplomacyIncome(state: GameState, faction: FactionId): { energy: number; metals: number; science: number } {
  let energy = 0, metals = 0, science = 0;
  const mine = factionIncome(state, faction).gross;
  const ports = ownedHexes(state, faction).filter((h) => state.map.hexes[h].system?.improvements.includes('tradePort')).length;
  for (const r of Object.values(state.relations)) {
    if (r.a !== faction && r.b !== faction) continue;
    const other = r.a === faction ? r.b : r.a;
    if (!state.factions[other].alive || r.status === 'war') continue;
    const theirs = factionIncome(state, other).gross;
    const hub = hasAbility(other, 'tradeHub') || hasAbility(faction, 'tradeHub') ? 1.5 : 1;
    if (r.agreements.includes('trade')) energy += theirs.energy * 0.1 * hub + ports * 2;
    if (r.agreements.includes('research')) {
      const concord = hasAbility(faction, 'openSociety') || hasAbility(other, 'openSociety') ? 0.1 : 0;
      science += theirs.science * 0.1 + mine.science * concord;
    }
    if (r.agreements.includes('economic')) metals += mine.metals * 0.1;
  }
  return { energy: Math.round(energy * 10) / 10, metals: Math.round(metals * 10) / 10, science: Math.round(science * 10) / 10 };
}

/** Start-of-turn diplomacy for a faction: income, payments, tribute, opinion drift, expiring notices. */
export function runDiplomacy(state: GameState, faction: FactionId): void {
  const f = state.factions[faction];
  const inc = diplomacyIncome(state, faction);
  f.stock.energy += inc.energy;
  f.stock.metals += inc.metals;
  f.research.progress += inc.science;

  // Recurring payments this faction owes.
  state.payments = state.payments.filter((p) => p.until >= state.turn);
  for (const p of state.payments) {
    if (p.from !== faction) continue;
    const amt = Math.min(p.amount, Math.max(0, state.factions[faction].stock[p.resource]));
    state.factions[faction].stock[p.resource] -= amt;
    state.factions[p.to].stock[p.resource] += amt;
  }

  // Vassal tribute: 20% of energy and metal income goes to the overlord.
  if (f.overlord) {
    const ov = state.factions[f.overlord];
    const lostHome = !ov.alive || state.map.hexes[ov.home].system?.homeOf !== f.overlord;
    if (lostHome || atWar(state, faction, f.overlord)) {
      log(state, [], 'vassal', `${factionDef(faction).name} broke free of ${factionDef(f.overlord).name}.`);
      f.overlord = null;
    } else {
      const g = factionIncome(state, faction).gross;
      const e = Math.min(f.stock.energy, g.energy * 0.2), m = Math.min(f.stock.metals, g.metals * 0.2);
      f.stock.energy -= e; f.stock.metals -= m;
      ov.stock.energy += e; ov.stock.metals += m;
    }
  }

  // Treaty notices that have run out.
  for (const key of Object.keys(f.flags)) {
    if (!key.startsWith('cancel:')) continue;
    if (state.turn >= f.flags[key]) {
      const other = key.slice(7);
      const r = relation(state, faction, other);
      if (TREATY_STATUSES.includes(r.status)) setStatus(state, r, hasEmbassy(state, faction, other) || hasEmbassy(state, other, faction) ? 'relations' : 'neutral');
      delete f.flags[key];
      log(state, [faction, other], 'treaty', `The treaty between ${factionDef(faction).name} and ${factionDef(other).name} has ended.`);
    }
  }

  // Opinion drift: toward 0, worse at war, better with agreements and shared enemies, border tension.
  const borderFleets = new Map<FactionId, number>();
  for (const fl of Object.values(state.fleets)) {
    if (fl.owner === faction) continue;
    if (state.map.hexes[fl.hex].owner === faction) borderFleets.set(fl.owner, (borderFleets.get(fl.owner) ?? 0) + 1);
  }
  for (const other of Object.keys(state.factions)) {
    if (other === faction || !state.factions[other].alive) continue;
    const r = relation(state, faction, other);
    if (!r.contact) continue;
    const op = opinionOf(state, faction, other);
    let d = op > 0 ? -0.5 : op < 0 ? 0.5 : 0;
    if (r.status === 'war') d -= 2;
    d += r.agreements.length * 0.5;
    if (r.status === 'alliance') d += 1;
    d += sharedEnemies(state, faction, other);
    if ((borderFleets.get(other) ?? 0) > 0 && !r.agreements.includes('openBorders') && r.status !== 'alliance') d -= 2;
    // Alliances come with obligations: an ally who stays out of our wars (more than 3 turns old, against a
    // power they know and are not allied with) is resented a little more every turn.
    if (r.status === 'alliance' && state.factions[other].kind === 'major') {
      for (const x of Object.keys(state.factions)) {
        if (x === faction || x === other || !state.factions[x].alive) continue;
        const war = relation(state, faction, x);
        if (war.status !== 'war' || state.turn - war.since <= 3) continue;
        const theirs = relation(state, other, x);
        if (theirs.contact && theirs.status !== 'war' && theirs.status !== 'alliance') { d -= 5; break; }
      }
    }
    adjustOpinion(state, faction, other, d);
  }

  // Unanswered proposals older than a round lapse.
  for (const p of Object.values(state.proposals)) {
    if (!p.answer && state.turn - p.turn > 1) p.answer = 'rejected';
    if (p.answer && state.turn - p.turn > 3) delete state.proposals[p.id];
  }
}

/** Marks contact between factions whose forces or territory see each other. */
export function updateContacts(state: GameState, faction: FactionId, visible: Set<number>): void {
  const seen = new Set<FactionId>();
  for (const hex of visible) {
    const o = state.map.hexes[hex].owner;
    if (o && o !== faction) seen.add(o);
  }
  for (const fl of Object.values(state.fleets)) if (fl.owner !== faction && visible.has(fl.hex)) seen.add(fl.owner);
  for (const other of seen) {
    const r = relation(state, faction, other);
    if (!r.contact) {
      r.contact = true;
      log(state, [faction, other], 'contact', `First contact between ${factionDef(faction).name} and ${factionDef(other).name}.`);
    }
  }
}

/** A minor whose home is occupied by a major it is at war with submits as a vassal. */
export function checkForcedVassalage(state: GameState, major: FactionId): void {
  if (state.factions[major].kind !== 'major') return;
  for (const f of Object.values(state.factions)) {
    if (f.kind !== 'minor' || !f.alive || f.overlord || !atWar(state, major, f.id)) continue;
    const homeHex = f.home;
    const sys = state.map.hexes[homeHex].system;
    const occupied = Object.values(state.fleets).some((fl) => fl.owner === major && fl.hex === homeHex);
    const defenders = Object.values(state.fleets).some((fl) => fl.owner === f.id && fl.hex === homeHex);
    if (occupied && !defenders && sys && sys.defense === 0) {
      f.overlord = major;
      const r = relation(state, major, f.id);
      setStatus(state, r, 'alliance');
      r.agreements = [];
      log(state, [], 'vassal', `${factionDef(f.id).name} surrendered and became a vassal of ${factionDef(major).name}.`);
    }
  }
}

export { TECH_BY_ID };
