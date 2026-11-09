/** Conversations with computer powers (§9.8): dispatches in the game state, and statements humans make. */
import { factionDef } from '../data/factions';
import { relation } from './query';
import type { FactionId, GameState, Statement } from './types';

/** Rounds of conversation kept in the state. */
const KEEP_TURNS = 30;
/** A human may make each kind of statement to a power once per this many turns. */
export const STATEMENT_COOLDOWN = 3;

export const STATEMENTS: Record<Statement['kind'], { name: string; text: string; needsTarget?: boolean }> = {
  withdraw: { name: 'Demand they withdraw', text: 'Withdraw your fleets from our territory.' },
  requestAid: { name: 'Ask for help against…', text: 'Join us against a common enemy.', needsTarget: true },
  threaten: { name: 'Threaten', text: 'Our patience is at an end. Do not test us.' },
  reassure: { name: 'Reassure', text: 'We mean you no harm. Let there be peace between us.' },
  askIntentions: { name: 'Ask their intentions', text: 'What are your intentions?' },
  denounce: { name: 'Denounce…', text: 'We denounce a faction before you.', needsTarget: true },
};

export function addDispatch(state: GameState, from: FactionId, to: FactionId, text: string, statement?: Statement): void {
  state.nextId += 1;
  state.dispatches ??= [];
  state.dispatches.push({ n: state.nextId, turn: state.turn, from, to, text, ...(statement ? { statement, answered: false } : {}) });
}

export function pruneDispatches(state: GameState): void {
  if (!state.dispatches?.length) return;
  const keepFrom = state.turn - KEEP_TURNS;
  if (state.dispatches[0].turn < keepFrom) state.dispatches = state.dispatches.filter((d) => d.turn >= keepFrom || (d.statement && !d.answered));
}

/** The text a human's statement is shown with. */
export function statementText(s: Statement): string {
  if (s.kind === 'requestAid') return `Join us against the ${factionDef(s.target).name}.`;
  if (s.kind === 'denounce') return `We denounce the ${factionDef(s.target).name}. They cannot be trusted.`;
  return STATEMENTS[s.kind].text;
}

export type Result = { ok: true } | { ok: false; reason: string };

/** A human addresses a computer power. It answers at the start of its next turn. */
export function makeStatement(state: GameState, from: FactionId, to: FactionId, s: Statement): Result {
  const target = state.factions[to];
  if (!target?.alive || target.controller !== 'ai' || target.kind !== 'major') return { ok: false, reason: 'Statements are for computer-run great powers.' };
  if (!relation(state, from, to).contact) return { ok: false, reason: 'You have not met them.' };
  if (!(s.kind in STATEMENTS)) return { ok: false, reason: 'Unknown statement.' };
  if (s.kind === 'requestAid' || s.kind === 'denounce') {
    if (!state.factions[s.target]?.alive || s.target === from || s.target === to) return { ok: false, reason: 'Pick another faction.' };
    if (!relation(state, from, s.target).contact) return { ok: false, reason: 'You have not met that faction.' };
  }
  if (s.kind === 'withdraw' && relation(state, from, to).status === 'war') return { ok: false, reason: 'You are at war: demands mean nothing now.' };
  const recent = (state.dispatches ?? []).find((d) => d.from === from && d.to === to && d.statement?.kind === s.kind && state.turn - d.turn < STATEMENT_COOLDOWN);
  if (recent) return { ok: false, reason: `You told them that on turn ${recent.turn}. Give them time.` };
  addDispatch(state, from, to, statementText(s), s);
  return { ok: true };
}
