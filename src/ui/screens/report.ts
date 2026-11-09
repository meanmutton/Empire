import { eventsFor } from '../../engine/events';
import { button, h, modal } from '../dom';
import { openBattle } from './battle';
import type { GameUI } from '../game-ui';

/** Turn report: everything this faction was told about in the last couple of rounds. */
export function openReport(ui: GameUI, sinceTurn?: number): void {
  const g = ui.game;
  const events = eventsFor(g, ui.viewer, sinceTurn ?? g.turn - 1).slice().reverse();
  const body = h('div');
  if (events.length === 0) body.append(h('div', { class: 'dim' }, 'Nothing to report.'));
  let lastTurn = -1;
  for (const e of events) {
    if (e.turn !== lastTurn) {
      body.append(h('h3', null, `Turn ${e.turn}`));
      lastTurn = e.turn;
    }
    const row = h('div', { class: 'event row', style: e.hex !== undefined ? 'cursor:pointer' : '' }, h('span', { class: 'grow' }, `${iconFor(e.kind)} ${e.text}`),
      e.kind === 'battle' && e.ref ? button('Battle report', () => openBattle(ui, e.ref!), { cls: 'small' }) : null);
    if (e.hex !== undefined) row.addEventListener('click', () => { m.close(); ui.view.centerOn(e.hex!); ui.select(e.hex!); });
    body.append(row);
  }
  const m = modal(sinceTurn !== undefined ? 'While you were away' : 'Reports', body);
}

function iconFor(kind: string): string {
  return ({ battle: '⚔', war: '🔥', peace: '🕊', treaty: '📜', built: '🛠', research: '🔬', colonized: '🌍', captured: '⛓', invasion: '🪖',
    embassy: '🏛', proposal: '✉', contact: '👁', spy: '🕵', vassal: '👑', victory: '🏆', eliminated: '☠', ruins: '⌂', developed: '⬆', defection: '🚩', blockade: '🚫', raid: '🏴' } as Record<string, string>)[kind] ?? '•';
}
