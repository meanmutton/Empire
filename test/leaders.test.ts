import { describe, expect, it } from 'vitest';
import { MAJOR_IDS } from '../src/data/factions';
import { defaultLeader, LEADER_TITLES, LEADERS, SELF_LEADER } from '../src/data/leaders';
import { createGame } from '../src/engine/setup';

describe('leaders', () => {
  it('every great power has three leaders and a title', () => {
    for (const id of MAJOR_IDS) {
      expect(LEADERS[id]).toHaveLength(3);
      expect(LEADER_TITLES[id]).toBeTruthy();
      expect(new Set(LEADERS[id].map((l) => l.id)).size).toBe(3);
    }
  });

  it('the seed picks the same leader every time, and different seeds vary', () => {
    expect(defaultLeader('Orion-1234', 'concord')).toBe(defaultLeader('Orion-1234', 'concord'));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => defaultLeader(`seed-${i}`, 'krasnyr')));
    expect(picks.size).toBe(3);
    expect(defaultLeader('x', 'myrr')).toBeUndefined();
  });

  it('new games give every great power a leader, and keep a human seat’s choice', () => {
    const g = createGame({ seed: 'leaders', seats: [{ faction: 'concord', name: 'Sean', leader: 'sutton' }, { faction: 'rynkai', name: 'Kim', leader: SELF_LEADER }] });
    expect(g.factions.concord.leader).toBe('sutton');
    expect(g.factions.rynkai.leader).toBe(SELF_LEADER);
    for (const id of g.config.majors.filter((m) => m !== 'concord' && m !== 'rynkai')) {
      expect(g.factions[id].leader).toBe(defaultLeader('leaders', id));
    }
    for (const id of g.config.minors) expect(g.factions[id].leader).toBeUndefined();
  });

  it('choosing leaders does not change the rest of the game', () => {
    const a = createGame({ seed: 'same', seats: [{ faction: 'concord', name: 'A', leader: 'lindqvist' }] });
    const b = createGame({ seed: 'same', seats: [{ faction: 'concord', name: 'A' }] });
    expect(a.rng).toEqual(b.rng);
    expect(a.map).toEqual(b.map);
  });
});
