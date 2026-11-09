import { intelLevel, intelScore, rivalReport } from '../src/engine/intel';
import { grantTech } from '../src/engine/research';
import type { GameState } from '../src/engine/types';
import { newGame } from './helpers';

function spy(g: GameState, owner: string, hex: number, mission: string | null = null) {
  const id = `spy${Object.keys(g.agents).length}`;
  g.agents[id] = { id, owner, kind: 'spy', hex, ship: null, path: [], target: null, mission, progress: 0, resident: false, capturedBy: null };
  return id;
}

describe('spy intelligence on victory progress', () => {
  it('you always know your own progress; nothing about rivals without spies', () => {
    const g = newGame('intel');
    expect(intelLevel(g, 'concord', 'concord')).toBe(3);
    expect(intelLevel(g, 'concord', 'varrhen')).toBe(0);
    expect(rivalReport(g, 'concord', 'varrhen').victories).toEqual([]);
  });

  it('one spy shows their victories, two a range, three the exact progress', () => {
    const g = newGame('intel');
    const home = g.factions.varrhen.home;
    spy(g, 'concord', home);
    let r = rivalReport(g, 'concord', 'varrhen');
    expect(r.level).toBe(1);
    expect(r.victories.map((v) => v.victory)).toContain('hegemony');
    expect(r.victories.every((v) => v.range === undefined && v.fraction === undefined)).toBe(true);
    spy(g, 'concord', home);
    r = rivalReport(g, 'concord', 'varrhen');
    expect(r.level).toBe(2);
    for (const v of r.victories) expect(v.range![1] - v.range![0]).toBeCloseTo(0.2);
    spy(g, 'concord', home);
    r = rivalReport(g, 'concord', 'varrhen');
    expect(r.level).toBe(3);
    expect(r.victories.every((v) => v.fraction !== undefined && v.detail)).toBe(true);
  });

  it('guards at home and counter-intelligence cancel spies; missions elsewhere do not guard', () => {
    const g = newGame('intel');
    const home = g.factions.varrhen.home;
    spy(g, 'concord', home); spy(g, 'concord', home); spy(g, 'concord', home);
    spy(g, 'varrhen', home, 'stealTech');
    expect(intelLevel(g, 'concord', 'varrhen')).toBe(3);
    spy(g, 'varrhen', home);
    expect(intelLevel(g, 'concord', 'varrhen')).toBe(2);
    grantTech(g, 'varrhen', 'counterIntel');
    expect(intelLevel(g, 'concord', 'varrhen')).toBe(1);
  });

  it('Krasnyr spies and Espionage Networks are worth more', () => {
    const g = newGame('intel');
    const home = g.factions.lattice.home;
    spy(g, 'krasnyr', home);
    spy(g, 'krasnyr', home);
    expect(intelScore(g, 'krasnyr', 'lattice')).toBe(3);
    grantTech(g, 'concord', 'espionageNet');
    spy(g, 'concord', home);
    expect(intelScore(g, 'concord', 'lattice')).toBe(1.5);
  });

  it('prisoners and spies aboard ships do not count', () => {
    const g = newGame('intel');
    const home = g.factions.varrhen.home;
    const a = spy(g, 'concord', home);
    g.agents[a].capturedBy = 'varrhen';
    expect(intelLevel(g, 'concord', 'varrhen')).toBe(0);
  });
});
