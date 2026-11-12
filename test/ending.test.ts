import { describe, expect, it } from 'vitest';
import { endingOf } from '../src/ui/ending-text';
import { newGame } from './helpers';

describe('victory and defeat screens', () => {
  it('shows nothing while the game is on', () => {
    expect(endingOf(newGame('end0'), 'concord')).toBeNull();
  });

  it('is a victory for the winner and a defeat for everyone else', () => {
    const g = newGame('end1');
    g.winner = 'concord';
    g.over = { reason: 'economic supremacy', turn: 88 };
    const win = endingOf(g, 'concord')!;
    expect(win.kind).toBe('victory');
    expect(win.headline).toBe('Terran Concord · Economic supremacy');
    expect(win.detail).toBe('Turn 88');
    const lose = endingOf(g, 'rynkai')!;
    expect(lose.kind).toBe('defeat');
    expect(lose.headline).toBe('Terran Concord wins · Economic supremacy');
  });

  it('says so when your empire has fallen', () => {
    const g = newGame('end2');
    g.winner = 'rynkai';
    g.over = { reason: 'last empire standing', turn: 120 };
    g.factions.concord.alive = false;
    expect(endingOf(g, 'concord')!.headline).toBe('Terran Concord has fallen');
  });

  it('is a defeat when the game ends with no winner', () => {
    const g = newGame('end3');
    g.over = { reason: 'no great power survived, and no empire rules the galaxy', turn: 150 };
    const e = endingOf(g, 'concord')!;
    expect(e.kind).toBe('defeat');
    expect(e.headline).toMatch(/^No great power survived/);
  });

  it('on a shared screen, a win by any human is a victory', () => {
    const g = newGame('end4');
    g.factions.rynkai.controller = 'human';
    g.winner = 'rynkai';
    g.over = { reason: 'conquest', turn: 70 };
    expect(endingOf(g, 'concord', false)!.kind).toBe('defeat');
    expect(endingOf(g, 'concord', true)!.kind).toBe('victory');
  });
});
