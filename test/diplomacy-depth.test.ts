import { describe, expect, it } from 'vitest';
import { adjustOpinion, opinionOf } from '../src/engine/agents';
import { ALLIANCE_AFTER_PACT, militaryStrength, proposalScore, runDiplomacy, statusObjection } from '../src/engine/diplomacy';
import { relation } from '../src/engine/query';
import type { GameState, Proposal, TradeItem } from '../src/engine/types';
import { firstDesign, fleetOf, newGame, setStatus } from './helpers';

const offer = (g: GameState, from: string, to: string, give: TradeItem[], receive: TradeItem[]): Proposal =>
  ({ id: 'x', from, to, turn: g.turn, give, receive, answer: null });
const bribe: TradeItem[] = [{ kind: 'resource', resource: 'energy', amount: 5000 }];

describe('alliances are earned, not bought', () => {
  it('needs a pact held for a while, real friendship and a common enemy, whatever is offered', () => {
    const g = newGame('ally');
    setStatus(g, 'concord', 'krasnyr', 'relations');
    // Friendly (+50), but short of the +60 at which diplomatic powers ally without a common enemy.
    adjustOpinion(g, 'krasnyr', 'concord', 50 - opinionOf(g, 'krasnyr', 'concord'));
    const p = offer(g, 'concord', 'krasnyr', [...bribe, { kind: 'status', status: 'alliance' }], []);
    expect(statusObjection(g, p)).toMatch(/non-aggression pact first/);
    expect(proposalScore(g, p)).toBeLessThan(0);
    setStatus(g, 'concord', 'krasnyr', 'nap');
    relation(g, 'concord', 'krasnyr').since = g.turn;
    expect(statusObjection(g, p)).toMatch(/has held 0/);
    g.turn += ALLIANCE_AFTER_PACT;
    // The Krasnyr are no idealists: without a shared enemy they still refuse.
    expect(statusObjection(g, p)).toMatch(/common enemy/);
    setStatus(g, 'concord', 'varrhen', 'war');
    setStatus(g, 'krasnyr', 'varrhen', 'war');
    expect(statusObjection(g, p)).toBeNull();
  });

  it('nobody completes your Grand Alliance unless they truly like you', () => {
    const g = newGame('ga');
    const majors = g.config.majors.filter((m) => m !== 'concord');
    const last = majors.pop()!;
    for (const m of majors) setStatus(g, 'concord', m, 'alliance');
    setStatus(g, 'concord', last, 'nap');
    relation(g, 'concord', last).since = 0;
    g.turn = 50;
    adjustOpinion(g, last, 'concord', 70);
    setStatus(g, 'concord', 'cryx', 'war');
    setStatus(g, last, 'cryx', 'war');
    const p = offer(g, 'concord', last, [{ kind: 'status', status: 'alliance' }], []);
    const why = statusObjection(g, p);
    if (last === 'rynkai' && militaryStrength(g, 'concord') < militaryStrength(g, 'rynkai') * 0.6) expect(why).toBeTruthy();
    else expect(why).toMatch(/Grand Alliance/);
    adjustOpinion(g, last, 'concord', 30);
    if (last !== 'rynkai') expect(statusObjection(g, p)).toBeNull();
  });
});

describe('vassalage needs strength, goodwill and a reason', () => {
  it('a minor will not sell its independence for a gift', () => {
    const g = newGame('vassal');
    const minor = g.config.minors[0];
    setStatus(g, 'concord', minor, 'relations');
    adjustOpinion(g, minor, 'concord', 80);
    const design = firstDesign('concord', (d) => d.cls === 'battleship' || d.cls === 'heavyCruiser');
    fleetOf(g, 'concord', design, g.factions.concord.home, 12);
    const p = offer(g, 'concord', minor, bribe, [{ kind: 'vassal' }]);
    expect(militaryStrength(g, 'concord')).toBeGreaterThan(militaryStrength(g, minor) * 3);
    expect(statusObjection(g, p)).toMatch(/no reason/);
    // A fleet at their door changes their mind.
    fleetOf(g, 'concord', design, g.factions[minor].home, 4);
    expect(statusObjection(g, p)).toBeNull();
    expect(proposalScore(g, p)).toBeGreaterThan(0);
  });
});

describe('alliances come with obligations', () => {
  it('an ally who stays out of your war is resented', () => {
    const g = newGame('oblige');
    setStatus(g, 'krasnyr', 'concord', 'alliance');
    setStatus(g, 'krasnyr', 'varrhen', 'war');
    relation(g, 'krasnyr', 'varrhen').since = 0;
    setStatus(g, 'concord', 'varrhen', 'relations');
    g.turn = 10;
    const before = opinionOf(g, 'krasnyr', 'concord');
    runDiplomacy(g, 'krasnyr');
    const after = opinionOf(g, 'krasnyr', 'concord');
    // Join the war and the resentment stops.
    setStatus(g, 'concord', 'varrhen', 'war');
    runDiplomacy(g, 'krasnyr');
    const joined = opinionOf(g, 'krasnyr', 'concord');
    expect(after).toBeLessThan(before);
    expect(joined).toBeGreaterThan(after);
  });
});
