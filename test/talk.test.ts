import { talkStart } from '../src/ai/talk';
import { line, VOICES, VOICE_TOPICS } from '../src/ai/voice';
import { MAJOR_IDS } from '../src/data/factions';
import { applyAction } from '../src/engine/actions';
import { adjustOpinion } from '../src/engine/agents';
import { relation } from '../src/engine/query';
import type { FactionId, GameState, Statement } from '../src/engine/types';
import { firstDesign, fleetOf, newGame, setStatus } from './helpers';
import { DESIGNS } from '../src/data/designs';

const from = (g: GameState, f: FactionId) => (g.dispatches ?? []).filter((d) => d.from === f);

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
    expect(from(g, 'lattice').at(-1)!.text).toMatch(/violation/i);
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
    expect(from(g, 'lattice').at(-1)!.text).toMatch(/Complying/);
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
    expect(from(g, 'rynkai').at(-1)!.text).toMatch(/threaten|insult/i);
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
    expect(from(g, 'lattice').at(-1)!.text).toMatch(/Joining/);
  });

  it('answers questions about intentions, and reacts to denunciations', () => {
    const g = newGame('talk');
    meet(g, 'krasnyr', 'concord');
    meet(g, 'krasnyr', 'varrhen');
    meet(g, 'concord', 'varrhen');
    setStatus(g, 'krasnyr', 'concord', 'war');
    tell(g, 'krasnyr', { kind: 'askIntentions' });
    expect(from(g, 'krasnyr').at(-1)!.text).toMatch(/liberation/);
    setStatus(g, 'krasnyr', 'concord', 'relations');
    adjustOpinion(g, 'krasnyr', 'varrhen', -50);
    const before = relation(g, 'krasnyr', 'concord');
    const op0 = before.a === 'krasnyr' ? before.opinionAB : before.opinionBA;
    tell(g, 'krasnyr', { kind: 'denounce', target: 'varrhen' });
    const after = relation(g, 'krasnyr', 'concord');
    expect(after.a === 'krasnyr' ? after.opinionAB : after.opinionBA).toBeGreaterThan(op0);
  });
});
