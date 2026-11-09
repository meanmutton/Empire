import { MAJOR_IDS } from '../src/data/factions';
import { applyAction } from '../src/engine/actions';
import { relocateHome } from '../src/engine/ground';
import { activeFaction } from '../src/engine/query';
import { createGame } from '../src/engine/setup';
import { beginGame, endTurn, runUntilHuman } from '../src/engine/turn';
import type { GameState } from '../src/engine/types';
import { checkVictory, isGameOver } from '../src/engine/victory';
import { newGame } from './helpers';

/** Takes every system from a faction, so relocateHome eliminates it. */
function eliminate(g: GameState, f: string) {
  for (const h of g.map.hexes) if (h.owner === f) h.owner = null;
  relocateHome(g, f);
}

describe('game endings', () => {
  for (const limit of [null, 5]) {
    describe(limit ? 'with a turn limit' : 'without a turn limit', () => {
      it('ends with no winner when every great power is eliminated', () => {
        const g = newGame('end');
        g.config.turnLimit = limit;
        for (const m of MAJOR_IDS) eliminate(g, m);
        expect(checkVictory(g, true)).toBeNull();
        expect(isGameOver(g)).toBe(true);
        expect(g.winner).toBeNull();
        expect(g.over!.reason).toMatch(/no great power/);
        expect(applyAction(g, activeFaction(g), { type: 'endTurn' }).ok).toBe(false);
      });

      it('the last great power standing wins', () => {
        const g = newGame('end');
        g.config.turnLimit = limit;
        for (const m of MAJOR_IDS) if (m !== 'varrhen') eliminate(g, m);
        expect(checkVictory(g, false)).toBe('varrhen');
        expect(isGameOver(g)).toBe(true);
      });
    });
  }

  it('reaching the turn limit picks the highest score, never throwing', () => {
    const g = newGame('end');
    g.config.turnLimit = 1;
    g.config.victory.domination = false;
    g.config.victory.alliance = false;
    const w = checkVictory(g, true);
    expect(w).not.toBeNull();
    expect(MAJOR_IDS).toContain(w);
  });

  it('when every human is eliminated, the leading computer power wins', () => {
    const g = newGame('end');
    eliminate(g, 'concord');
    const w = checkVictory(g, false);
    expect(w).not.toBeNull();
    expect(w).not.toBe('concord');
    expect(g.over!.reason).toMatch(/human/);
  });

  it('the turn loop stops when the game ends without a winner', () => {
    const g = createGame({ seed: 'end-loop', seats: [{ faction: 'concord', name: 'A' }], turnLimit: 3 });
    beginGame(g, () => {});
    for (const m of MAJOR_IDS) eliminate(g, m);
    endTurn(g);
    expect(isGameOver(g)).toBe(true);
    const turn = g.turn, active = g.active;
    runUntilHuman(g, () => {});
    expect([g.turn, g.active]).toEqual([turn, active]);
  });
});
