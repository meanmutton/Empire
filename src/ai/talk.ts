/**
 * Computer great powers talking to human players (§9.8): reacting to events in their own voice, and
 * answering statements humans make to them. Runs inside the computer's turn, so any action it takes
 * (declaring war, pulling back fleets) goes through the normal rules.
 */
import { hasAbility, factionDef } from '../data/factions';
import { design } from '../data/designs';
import { applyAction } from '../engine/actions';
import { adjustOpinion, hasEmbassy, opinionOf } from '../engine/agents';
import { militaryStrength } from '../engine/diplomacy';
import { atWar, relation } from '../engine/query';
import type { FactionId, GameState, RelationStatus, Statement } from '../engine/types';
import { say } from './voice';

const STATUSES: RelationStatus[] = ['war', 'hostile', 'neutral', 'relations', 'nap', 'alliance'];

function humans(state: GameState, me: FactionId): FactionId[] {
  return Object.keys(state.factions).filter((f) => f !== me && state.factions[f].controller === 'human' && state.factions[f].alive && relation(state, me, f).contact);
}

function talks(state: GameState, me: FactionId): boolean {
  const f = state.factions[me];
  return f.kind === 'major' && f.controller === 'ai' && f.alive;
}

/** Start of a computer power's turn: answer statements, react to what happened since its last turn. */
export function talkStart(state: GameState, me: FactionId): void {
  if (!talks(state, me)) return;
  react(state, me);
  answerStatements(state, me);
}

/** End of its turn: speak about what it just did (wars declared, offers sent). */
export function talkEnd(state: GameState, me: FactionId): void {
  if (!talks(state, me)) return;
  for (const p of Object.values(state.proposals)) {
    // Each computer power acts once per round, so proposals dated this turn were made just now.
    if (p.from === me && p.turn === state.turn && !p.answer && state.factions[p.to].controller === 'human') {
      say(state, me, p.to, 'offer');
    }
  }
  react(state, me);
}

function react(state: GameState, me: FactionId): void {
  const f = state.factions[me];
  for (const h of humans(state, me)) {
    if (!f.flags[`met:${h}`]) {
      f.flags[`met:${h}`] = 1;
      say(state, me, h, 'greet');
    }
    const r = relation(state, me, h);
    const cur = STATUSES.indexOf(r.status);
    const prevRaw = f.flags[`st:${h}`];
    const prev = prevRaw === undefined ? cur : prevRaw;
    if (cur !== prev) {
      const was = STATUSES[prev];
      if (r.status === 'war') {
        if (r.aggressor === me) say(state, me, h, 'declareWar');
        else if (was === 'nap' || was === 'alliance') say(state, me, h, 'betrayed');
        else say(state, me, h, 'warOnUs');
      } else if (was === 'war') {
        say(state, me, h, 'peace');
      } else if ((r.status === 'nap' || r.status === 'alliance') && cur > prev) {
        say(state, me, h, 'treaty');
      }
    }
    f.flags[`st:${h}`] = cur;
    const emb = hasEmbassy(state, h, me) ? 1 : 0;
    if (emb && !f.flags[`emb:${h}`]) say(state, me, h, 'embassy');
    f.flags[`emb:${h}`] = emb;
    // Trespassing warships, at most every 5 turns.
    if (r.status !== 'war' && r.status !== 'alliance' && !r.agreements.includes('openBorders') && state.turn - (f.flags[`tres:${h}`] ?? -99) >= 5) {
      const intruder = Object.values(state.fleets).find((fl) => fl.owner === h && state.map.hexes[fl.hex].owner === me && armed(state, fl.ships));
      if (intruder) {
        f.flags[`tres:${h}`] = state.turn;
        say(state, me, h, 'trespass', { system: state.map.hexes[intruder.hex].system?.name });
      }
    }
  }
  // Battles since the last time this power spoke.
  const since = f.flags.talkSeq ?? 0;
  const spoken = new Set<string>();
  for (const e of state.log) {
    if (e.kind !== 'battle' || (e.seq ?? 0) <= since || !e.data || e.data[me] === undefined) continue;
    for (const h of Object.keys(e.data)) {
      if (h === me || state.factions[h]?.controller !== 'human' || spoken.has(h) || !relation(state, me, h).contact) continue;
      const mine = e.data[me], theirs = e.data[h];
      if (mine === theirs) continue;
      spoken.add(h);
      say(state, me, h, mine < theirs ? 'victory' : 'defeat');
    }
  }
  f.flags.talkSeq = state.seq;
}

function armed(state: GameState, ships: string[]): boolean {
  return ships.some((s) => {
    const st = design(state.ships[s].design).stats;
    return st.energy + st.missile + st.hangar > 0;
  });
}

/** The empire this power is most likely to attack next (used to answer "what are your intentions?"). */
export function likelyTarget(state: GameState, me: FactionId): FactionId | null {
  const mine = militaryStrength(state, me);
  let best: FactionId | null = null, bestRatio = 1.2;
  for (const o of Object.keys(state.factions)) {
    if (o === me || !state.factions[o].alive || state.factions[o].kind !== 'major') continue;
    const r = relation(state, me, o);
    if (!r.contact || r.status === 'alliance' || r.status === 'war') continue;
    const ratio = (mine / Math.max(1, militaryStrength(state, o))) * (1 - opinionOf(state, me, o) / 200);
    if (ratio > bestRatio) { bestRatio = ratio; best = o; }
  }
  return best;
}

function answerStatements(state: GameState, me: FactionId): void {
  for (const d of state.dispatches ?? []) {
    if (d.to !== me || !d.statement || d.answered) continue;
    d.answered = true;
    if (!state.factions[d.from]?.alive) continue;
    answer(state, me, d.from, d.statement);
  }
}

function answer(state: GameState, me: FactionId, h: FactionId, s: Statement): void {
  const p = factionDef(me).personality;
  const f = state.factions[me];
  const op = opinionOf(state, me, h);
  const ratio = militaryStrength(state, h) / Math.max(1, militaryStrength(state, me));
  const status = relation(state, me, h).status;
  const treaty = status === 'nap' || status === 'alliance';
  switch (s.kind) {
    case 'withdraw': {
      const comply = op > 20 || (ratio >= 0.8 && p.aggression < 0.8) || (f.flags[`cowed:${h}`] ?? 0) > state.turn;
      if (comply) {
        f.flags[`withdraw:${h}`] = state.turn + 8;
        withdrawFrom(state, me, h);
        say(state, me, h, 'withdrawYes');
      } else {
        adjustOpinion(state, me, h, -3);
        say(state, me, h, 'withdrawNo');
      }
      return;
    }
    case 'requestAid': {
      const x = s.target;
      if (atWar(state, me, x)) {
        adjustOpinion(state, me, h, 5);
        say(state, me, h, 'aidAlready', { target: x });
        return;
      }
      const rx = relation(state, me, x);
      const blocked = status === 'war' || !rx.contact || rx.status === 'alliance' || state.factions[x].overlord === me
        || (hasAbility(me, 'honorBound') && rx.status === 'nap');
      const combined = (militaryStrength(state, me) + militaryStrength(state, h)) / Math.max(1, militaryStrength(state, x));
      const score = op / 50 - opinionOf(state, me, x) / 50 + p.aggression * 0.6 + (status === 'alliance' ? 1 : 0) + (combined > 1.5 ? 0.5 : -0.5);
      if (!blocked && score > 1 && applyAction(state, me, { type: 'declareWar', target: x }).ok) {
        adjustOpinion(state, me, h, 10);
        say(state, me, h, 'aidYes', { target: x });
      } else {
        say(state, me, h, 'aidNo', { target: x });
      }
      return;
    }
    case 'threaten': {
      adjustOpinion(state, me, h, -12);
      const honor = hasAbility(me, 'honorBound');
      const canWar = status !== 'war' && !(honor && treaty);
      if (!honor && ratio >= 1.5 && p.aggression < 0.85) {
        f.flags[`cowed:${h}`] = state.turn + 10;
        f.flags[`withdraw:${h}`] = state.turn + 10;
        withdrawFrom(state, me, h);
        say(state, me, h, 'threatYield');
      } else if (canWar && ratio < (honor ? 1.25 : 0.7) && p.aggression > 0.4 && applyAction(state, me, { type: 'declareWar', target: h }).ok) {
        f.flags[`st:${h}`] = 0;
        say(state, me, h, 'threatWar');
      } else {
        say(state, me, h, 'threatDefy');
      }
      return;
    }
    case 'reassure': {
      const distrust = op < -30 || f.flags[`grudge:${h}`] || status === 'war';
      if (distrust) {
        say(state, me, h, 'reassureDoubt');
      } else {
        if (op < 40) adjustOpinion(state, me, h, 5);
        say(state, me, h, 'reassureTrust');
      }
      return;
    }
    case 'askIntentions': {
      if (status === 'war') { say(state, me, h, 'intentHostile'); return; }
      const target = likelyTarget(state, me);
      if (target === h) {
        // Treacherous powers lie about it.
        say(state, me, h, p.treachery > 0.5 ? 'intentPeaceful' : 'intentWarning');
      } else if (target) {
        say(state, me, h, 'intentWatching', { target });
      } else {
        say(state, me, h, 'intentPeaceful');
      }
      return;
    }
    case 'denounce': {
      const x = s.target;
      const ox = opinionOf(state, me, x);
      if (ox < -10 || atWar(state, me, x)) {
        adjustOpinion(state, me, h, 5);
        adjustOpinion(state, me, x, -3);
        say(state, me, h, 'denounceAgree', { target: x });
      } else if (ox > 25 || relation(state, me, x).status === 'alliance') {
        adjustOpinion(state, me, h, -5);
        say(state, me, h, 'denounceDisagree', { target: x });
      } else {
        adjustOpinion(state, me, x, -2);
        say(state, me, h, 'denounceIndifferent', { target: x });
      }
      return;
    }
  }
}

/** Orders this power's fleets out of `owner`'s territory (they head home). */
export function withdrawFrom(state: GameState, me: FactionId, owner: FactionId): void {
  const home = state.factions[me].home;
  for (const fl of Object.values(state.fleets)) {
    if (fl.owner !== me || state.map.hexes[fl.hex].owner !== owner) continue;
    applyAction(state, me, { type: 'move', fleet: fl.id, to: home });
  }
}
