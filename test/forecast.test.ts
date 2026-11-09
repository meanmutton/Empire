import { DESIGNS } from '../src/data/designs';
import { battleForecast, forecastFor } from '../src/engine/forecast';
import { intelLevel } from '../src/engine/intel';
import { ring } from '../src/engine/hex';
import { deserializeState, serializeState } from '../src/engine/serialize';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';
import { emptyHex, firstDesign, fleetOf, newGame, setStatus } from './helpers';

function arena(): { g: GameState; hex: number } {
  const g = newGame('fc');
  const hex = emptyHex(g);
  for (const h of [hex, ...ring(g.map, hex, 1)]) { g.map.hexes[h].terrain = 'space'; g.map.hexes[h].wormhole = null; }
  setStatus(g, 'concord', 'krasnyr', 'war');
  return { g, hex };
}

describe('battle forecast', () => {
  it('labels force ratios from overwhelming victory to hopeless cause', () => {
    expect(forecastFor(3)).toBe('overwhelming');
    expect(forecastFor(1.5)).toBe('likely');
    expect(forecastFor(1)).toBe('even');
    expect(forecastFor(0.6)).toBe('unlikely');
    expect(forecastFor(0.3)).toBe('hopeless');
  });

  it('reads twice the ships as about twice the force, and sees nothing where no enemy is', () => {
    const { g, hex } = arena();
    const d = DESIGNS['lattice:tensor'];
    fleetOf(g, 'concord', d, hex, 6);
    expect(battleForecast(g, 'concord', hex)).toBeNull();
    fleetOf(g, 'krasnyr', d, hex, 3);
    const fc = battleForecast(g, 'concord', hex)!;
    expect(fc.ratio).toBeGreaterThan(1.6);
    expect(fc.ratio).toBeLessThan(2.5);
    expect(fc.label).toBe('likely');
  });

  it('forecasts a fleet that would join from elsewhere', () => {
    const { g, hex } = arena();
    const d = DESIGNS['lattice:tensor'];
    fleetOf(g, 'krasnyr', d, hex, 2);
    const away = ring(g.map, hex, 2)[0];
    const mine = fleetOf(g, 'concord', d, away, 6);
    const fc = battleForecast(g, 'concord', hex, [mine])!;
    expect(fc.label).toBe('overwhelming');
  });

  it('is only as good as your intelligence: scouts reveal designs, spies reveal technology', () => {
    const { g, hex } = arena();
    const big = firstDesign('krasnyr', (d) => d.role === 'line' && d.cls === 'battleship');
    fleetOf(g, 'krasnyr', big, hex, 2);
    // Concord watches from next door with a warship (not a scout): only classes are known.
    const far = ring(g.map, hex, 1)[0];
    const watcher = fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'line'), far, 1);
    const poor = battleForecast(g, 'concord', hex, [watcher])!;
    expect(poor.intel).toBe('poor');
    expect(poor.notes.join(' ')).toMatch(/guessed from their ship classes/);
    expect(poor.notes.join(' ')).toMatch(/assumed equal to yours/);
    // A scout nearby reveals the actual designs.
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'scout'), ring(g.map, hex, 1)[1], 1);
    const fair = battleForecast(g, 'concord', hex, [watcher])!;
    expect(fair.intel).toBe('fair');
    // A spy at the Krasnyr capital reveals their technology.
    const home = g.factions.krasnyr.home;
    for (const id of ['spy1', 'spy2', 'spy3', 'spy4']) g.agents[id] = { id, owner: 'concord', kind: 'spy', hex: home, ship: null, path: [], target: null, mission: null, progress: 0, resident: false, capturedBy: null };
    expect(intelLevel(g, 'concord', 'krasnyr')).toBeGreaterThanOrEqual(1);
    const good = battleForecast(g, 'concord', hex, [watcher])!;
    expect(good.intel).toBe('good');
  });

  it('cannot count fleets it cannot see', () => {
    const { g, hex } = arena();
    const d = DESIGNS['lattice:tensor'];
    fleetOf(g, 'krasnyr', d, hex, 1);
    const far = ring(g.map, hex, 1)[0];
    const mine = fleetOf(g, 'concord', d, far, 2);
    const before = battleForecast(g, 'concord', hex, [mine]);
    // A nebula hides the defenders from sensors outside the hex.
    g.map.hexes[hex].terrain = 'nebula';
    const after = battleForecast(g, 'concord', hex, [mine]);
    expect(before).not.toBeNull();
    expect(after).toBeNull();
  });
});

describe('game settings and old saves', () => {
  it('keeps combat rounds within 3–10', () => {
    const seats = [{ faction: 'concord', name: 'A' }];
    expect(createGame({ seed: 'cr', seats, combatRounds: 1, width: 30, height: 20 }).config.combatRounds).toBe(3);
    expect(createGame({ seed: 'cr', seats, combatRounds: 20, width: 30, height: 20 }).config.combatRounds).toBe(10);
    expect(createGame({ seed: 'cr', seats, width: 30, height: 20 }).config.combatRounds).toBe(5);
  });

  it('turns old fleet stances into doctrines when loading', () => {
    const g = newGame('old');
    const fl = Object.values(g.fleets);
    const raw = JSON.parse(serializeState(g));
    const stances = ['aggressive', 'defensive', 'passive'];
    Object.values(raw.fleets).forEach((f: any, i) => { delete f.doctrine; f.stance = stances[i % 3]; });
    const back = deserializeState(JSON.stringify(raw));
    const docs = Object.values(back.fleets).map((f) => f.doctrine);
    expect(docs.slice(0, 3)).toEqual(['engage', 'holdLine', 'retreat']);
    expect(Object.values(back.fleets).every((f) => !('stance' in f))).toBe(true);
    expect(fl.length).toBe(docs.length);
  });
});
