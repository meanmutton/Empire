import { talkStart } from '../src/ai/talk';
import { line, VOICES, VOICE_TOPICS, type Topic } from '../src/ai/voice';
import { LEADER_VOICES } from '../src/ai/leader-voices';
import { defaultLeader } from '../src/data/leaders';
import { factionDef, MAJOR_IDS } from '../src/data/factions';
import { applyAction } from '../src/engine/actions';
import { adjustOpinion } from '../src/engine/agents';
import { relation } from '../src/engine/query';
import type { FactionId, GameState, Statement } from '../src/engine/types';
import { firstDesign, fleetOf, newGame, setStatus } from './helpers';
import { DESIGNS } from '../src/data/designs';

const from = (g: GameState, f: FactionId) => (g.dispatches ?? []).filter((d) => d.from === f);

/** Whether `text` is one of the things `f`'s leader says on `topic` (to the Concord, about `target`). */
function saidOn(g: GameState, f: FactionId, topic: Topic, text: string, target?: FactionId): boolean {
  const lines = LEADER_VOICES[`${f}-${g.factions[f].leader ?? defaultLeader(g.seed, f)}`]?.[topic] ?? VOICES[f][topic];
  return lines.some((l) => l.replace(/\{them\}/g, factionDef('concord').name)
    .replace(/\{target\}/g, target ? factionDef(target).name.replace(/^The /, '') : 'others') === text);
}

/** Lets concord (the human) make a statement, then lets the computer answer. */
function tell(g: GameState, to: FactionId, statement: Statement) {
  g.active = g.turnOrder.indexOf('concord');
  const r = applyAction(g, 'concord', { type: 'statement', to, statement });
  g.active = g.turnOrder.indexOf(to);
  talkStart(g, to);
  return r;
}

function meet(g: GameState, a: string, b: string) {
  relation(g, a, b).contact = true;
}

describe('computer voices', () => {
  it('every great power has a line for every topic, with placeholders filled', () => {
    const g = newGame('talk');
    for (const m of MAJOR_IDS) {
      for (const t of VOICE_TOPICS) {
        expect(VOICES[m][t]?.length, `${m} ${t}`).toBeGreaterThan(0);
        expect(line(g, m, 'concord', t, { target: 'varrhen', system: 'Sol' })).not.toMatch(/[{}]/);
      }
    }
  });
});

describe('computer powers react to events', () => {
  it('greet once on first contact', () => {
    const g = newGame('talk');
    meet(g, 'rynkai', 'concord');
    talkStart(g, 'rynkai');
    talkStart(g, 'rynkai');
    expect(from(g, 'rynkai')).toHaveLength(1);
    expect(from(g, 'rynkai')[0].to).toBe('concord');
  });

  it('call out betrayal and war', () => {
    const g = newGame('talk');
    meet(g, 'lattice', 'concord');
    setStatus(g, 'lattice', 'concord', 'nap');
    talkStart(g, 'lattice');
    g.active = g.turnOrder.indexOf('concord');
    applyAction(g, 'concord', { type: 'declareWar', target: 'lattice' });
    talkStart(g, 'lattice');
    expect(saidOn(g, 'lattice', 'betrayed', from(g, 'lattice').at(-1)!.text)).toBe(true);
  });

  it('warn trespassers, at most every few turns', () => {
    const g = newGame('talk');
    meet(g, 'varrhen', 'concord');
    talkStart(g, 'varrhen');
    const n = from(g, 'varrhen').length;
    const inside = g.map.hexes.findIndex((h) => h.owner === 'varrhen' && !h.system);
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], inside);
    talkStart(g, 'varrhen');
    talkStart(g, 'varrhen');
    expect(from(g, 'varrhen').length).toBe(n + 1);
  });

  it('do not talk to other computers', () => {
    const g = newGame('talk');
    meet(g, 'rynkai', 'lattice');
    talkStart(g, 'rynkai');
    expect(from(g, 'rynkai').filter((d) => d.to === 'lattice')).toHaveLength(0);
  });
});

describe('statements to computer powers', () => {
  it('are validated: computer great powers only, met, with a cooldown', () => {
    const g = newGame('talk');
    g.active = g.turnOrder.indexOf('concord');
    expect(applyAction(g, 'concord', { type: 'statement', to: 'lattice', statement: { kind: 'reassure' } }).ok).toBe(false);
    meet(g, 'lattice', 'concord');
    expect(applyAction(g, 'concord', { type: 'statement', to: 'lattice', statement: { kind: 'reassure' } }).ok).toBe(true);
    expect(applyAction(g, 'concord', { type: 'statement', to: 'lattice', statement: { kind: 'reassure' } }).ok).toBe(false);
    meet(g, 'myrr', 'concord');
    expect(applyAction(g, 'concord', { type: 'statement', to: 'myrr', statement: { kind: 'reassure' } }).ok).toBe(false);
  });

  it('a friendly power withdraws its fleets when asked', () => {
    const g = newGame('talk');
    meet(g, 'lattice', 'concord');
    adjustOpinion(g, 'lattice', 'concord', 40);
    const inside = g.map.hexes.findIndex((h, i) => h.owner === 'concord' && !h.system && i !== g.factions.concord.home);
    const fid = fleetOf(g, 'lattice', DESIGNS['lattice:tensor'], inside);
    expect(tell(g, 'lattice', { kind: 'withdraw' }).ok).toBe(true);
    expect(saidOn(g, 'lattice', 'withdrawYes', from(g, 'lattice').at(-1)!.text)).toBe(true);
    expect(g.fleets[fid].hex === inside && g.fleets[fid].path.length === 0).toBe(false);
    expect(g.dispatches!.find((d) => d.statement)!.answered).toBe(true);
  });

  it('threats cow the weak, but the Ryn\'kai never yield', () => {
    const g = newGame('talk');
    meet(g, 'lattice', 'concord');
    meet(g, 'rynkai', 'concord');
    const home = g.factions.concord.home;
    fleetOf(g, 'concord', firstDesign('lattice', (d) => d.cls === 'battleship' && d.role === 'line'), home, 6);
    tell(g, 'lattice', { kind: 'threaten' });
    expect(g.factions.lattice.flags['cowed:concord']).toBeGreaterThan(g.turn);
    tell(g, 'rynkai', { kind: 'threaten' });
    expect(g.factions.rynkai.flags['cowed:concord']).toBeUndefined();
    expect(saidOn(g, 'rynkai', 'threatDefy', from(g, 'rynkai').at(-1)!.text)).toBe(true);
  });

  it('a power that likes you and hates the target joins your war', () => {
    const g = newGame('talk');
    meet(g, 'lattice', 'concord');
    meet(g, 'lattice', 'varrhen');
    meet(g, 'concord', 'varrhen');
    adjustOpinion(g, 'lattice', 'concord', 60);
    adjustOpinion(g, 'lattice', 'varrhen', -80);
    tell(g, 'lattice', { kind: 'requestAid', target: 'varrhen' });
    expect(relation(g, 'lattice', 'varrhen').status).toBe('war');
    expect(saidOn(g, 'lattice', 'aidYes', from(g, 'lattice').at(-1)!.text, 'varrhen')).toBe(true);
  });

  it('answers questions about intentions, and reacts to denunciations', () => {
    const g = newGame('talk');
    meet(g, 'krasnyr', 'concord');
    meet(g, 'krasnyr', 'varrhen');
    meet(g, 'concord', 'varrhen');
    setStatus(g, 'krasnyr', 'concord', 'war');
    tell(g, 'krasnyr', { kind: 'askIntentions' });
    expect(saidOn(g, 'krasnyr', 'intentHostile', from(g, 'krasnyr').at(-1)!.text)).toBe(true);
    setStatus(g, 'krasnyr', 'concord', 'relations');
    adjustOpinion(g, 'krasnyr', 'varrhen', -50);
    const before = relation(g, 'krasnyr', 'concord');
    const op0 = before.a === 'krasnyr' ? before.opinionAB : before.opinionBA;
    tell(g, 'krasnyr', { kind: 'denounce', target: 'varrhen' });
    const after = relation(g, 'krasnyr', 'concord');
    expect(after.a === 'krasnyr' ? after.opinionAB : after.opinionBA).toBeGreaterThan(op0);
  });
});

describe('leader voices', () => {
  it('a computer power speaks in its leader’s words, and falls back to the faction voice', async () => {
    const { LEADER_VOICES } = await import('../src/ai/leader-voices');
    const { createGame } = await import('../src/engine/setup');
    const g = createGame({ seed: 'voices', seats: [{ faction: 'rynkai', name: 'Tester' }] });
    for (const leader of ['halvorsen-okafor', 'lindqvist', 'sutton']) {
      g.factions.concord.leader = leader;
      const text = line(g, 'concord', 'rynkai', 'declareWar');
      expect(LEADER_VOICES[`concord-${leader}`].declareWar!.map((l) => l.replace('{them}', 'Ryn\'kai Dominion'))).toContain(text);
    }
    g.factions.concord.leader = 'nobody';
    expect(VOICES.concord.declareWar.map((l) => l.replace(/\{them\}/g, 'Ryn\'kai Dominion'))).toContain(line(g, 'concord', 'rynkai', 'declareWar'));
  });

  it('every leader of every great power has a line for every occasion', async () => {
    const { LEADER_VOICES } = await import('../src/ai/leader-voices');
    const { LEADERS } = await import('../src/data/leaders');
    for (const [faction, leaders] of Object.entries(LEADERS)) {
      for (const l of leaders) {
        const v = LEADER_VOICES[`${faction}-${l.id}`];
        expect(v, `${faction}-${l.id}`).toBeTruthy();
        for (const t of VOICE_TOPICS) expect(v[t]?.length ?? 0, `${faction}-${l.id} ${t}`).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(LEADER_VOICES)).toHaveLength(15);
  });

  it('every leader line uses only known placeholders', async () => {
    const { LEADER_VOICES } = await import('../src/ai/leader-voices');
    for (const [key, lines] of Object.entries(LEADER_VOICES)) {
      for (const [topic, list] of Object.entries(lines)) {
        expect(VOICE_TOPICS, `${key} ${topic}`).toContain(topic);
        for (const l of list!) expect(l.replace(/\{(them|target|system)\}/g, ''), `${key} ${topic}`).not.toMatch(/[{}]/);
      }
    }
  });
});
