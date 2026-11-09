import { MAJOR_IDS } from '../src/data/factions';
import { applyAction } from '../src/engine/actions';
import { productionOf } from '../src/engine/economy';
import { ring } from '../src/engine/hex';
import { activeFaction } from '../src/engine/query';
import { stateHash } from '../src/engine/serialize';
import { createGame } from '../src/engine/setup';
import { beginGame, endTurn, runUntilHuman } from '../src/engine/turn';
import { newGame } from './helpers';

const idle = () => {};

describe('turn engine', () => {
  it('begins and stops at the first human', () => {
    const g = newGame('turns');
    beginGame(g, idle);
    expect(activeFaction(g)).toBe('concord');
    expect(g.factions.concord.controller).toBe('human');
  });

  it('cycles every faction once per round', () => {
    const g = newGame('turns');
    beginGame(g, idle);
    const t = g.turn;
    const seen = new Set<string>();
    for (let i = 0; i < g.turnOrder.length; i++) {
      seen.add(activeFaction(g));
      endTurn(g);
    }
    expect(seen.size).toBe(15);
    expect(g.turn).toBe(t + 1);
    expect(activeFaction(g)).toBe('concord');
  });

  it('only the active faction can act', () => {
    const g = newGame('turns');
    beginGame(g, idle);
    const fleet = Object.values(g.fleets).find((f) => f.owner === 'rynkai')!;
    expect(applyAction(g, 'rynkai', { type: 'move', fleet: fleet.id, to: fleet.hex + 1 }).ok).toBe(false);
    const mine = Object.values(g.fleets).find((f) => f.owner === 'concord')!;
    expect(applyAction(g, 'concord', { type: 'move', fleet: fleet.id, to: mine.hex }).ok).toBe(false);
  });

  it('claims hexes across a full round', () => {
    const g = newGame('turns');
    beginGame(g, idle);
    const scout = Object.values(g.fleets).find((f) => f.owner === 'concord' && f.stance === 'passive' && f.movesLeft >= 4)!;
    const target = ring(g.map, g.factions.concord.home, 4).find((h) => !g.map.hexes[h].owner && g.map.hexes[h].terrain === 'space')!;
    expect(applyAction(g, 'concord', { type: 'move', fleet: scout.id, to: target }).ok).toBe(true);
    expect(g.fleets[scout.id].hex).toBe(target);
    applyAction(g, 'concord', { type: 'endTurn' });
    runUntilHuman(g, idle);
    expect(activeFaction(g)).toBe('concord');
    expect(g.map.hexes[target].owner).toBe('concord');
  });

  it('is deterministic', () => {
    const a = newGame('det'), b = newGame('det');
    for (const g of [a, b]) {
      beginGame(g, idle);
      for (let r = 0; r < 3; r++) { applyAction(g, 'concord', { type: 'endTurn' }); runUntilHuman(g, idle); }
    }
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('runs 25 rounds without errors', () => {
    const g = newGame('long');
    beginGame(g, idle);
    for (let r = 0; r < 25; r++) { applyAction(g, 'concord', { type: 'endTurn' }); runUntilHuman(g, idle); }
    expect(g.turn).toBe(26);
    expect(g.factions.concord.stock.energy).toBeGreaterThan(0);
  });

  it('runs a game with five humans in turn order', () => {
    const g = createGame({ seed: 'hot', seats: MAJOR_IDS.map((f, i) => ({ faction: f, name: `P${i}` })) });
    beginGame(g, idle);
    const humans: string[] = [];
    for (let i = 0; i < 5; i++) {
      humans.push(activeFaction(g));
      applyAction(g, activeFaction(g), { type: 'endTurn' });
      runUntilHuman(g, idle);
    }
    expect(new Set(humans).size).toBe(5);
  });
});

describe('faction powers', () => {
  it('Five-Year Plan and Mobilization', () => {
    const g = newGame('powers');
    g.active = g.turnOrder.indexOf('krasnyr');
    expect(applyAction(g, 'krasnyr', { type: 'fiveYearPlan', resource: 'metals' }).ok).toBe(true);
    expect(applyAction(g, 'krasnyr', { type: 'fiveYearPlan', resource: 'metals' }).ok).toBe(false);
    g.active = g.turnOrder.indexOf('varrhen');
    const home = g.factions.varrhen.home;
    const p0 = productionOf(g, home);
    expect(applyAction(g, 'varrhen', { type: 'mobilize', on: true }).ok).toBe(true);
    expect(productionOf(g, home)).toBeGreaterThan(p0);
    expect(applyAction(g, 'concord', { type: 'mobilize', on: true }).ok).toBe(false);
  });
});
