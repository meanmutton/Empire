/**
 * "Before you end your turn": what is still waiting for orders (research, colonies with nothing to build,
 * fleets without orders, proposals to answer), each with a button that takes you there. Players can turn
 * it off (per browser); the research reminder stays either way.
 */
import { button, h, modal } from '../dom';
import type { GameUI } from '../game-ui';
import { openDiplomacy } from './diplomacy';
import { openColonies, openFleets } from './manage';
import { openResearch } from './research';

const KEY = 'empire.endTurnCheck';

function localStorageGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}

function localStorageSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* private mode: the choice lasts this session only */ }
}

/** Whether to show the checklist before ending a turn (on unless the player turned it off). */
export function endTurnCheckOn(): boolean {
  return localStorageGet(KEY) !== 'off';
}

export interface TurnChecklist {
  research: boolean;
  idleSystems: { hex: number; name: string }[];
  idleFleets: { id: string; hex: number }[];
  proposals: number;
}

export function checklistEmpty(c: TurnChecklist): boolean {
  return !c.research && !c.idleSystems.length && !c.idleFleets.length && !c.proposals;
}

export function openEndTurnCheck(ui: GameUI, c: TurnChecklist): void {
  const body = h('div');
  const m = modal(`Before you end turn ${ui.game.turn}`, body);
  const go = (fn: () => void) => () => { m.close(); fn(); };
  const row = (icon: string, text: string, ...buttons: HTMLElement[]) =>
    body.append(h('div', { class: 'card row wrap', style: 'gap:8px' }, h('span', { style: 'font-size:18px' }, icon), h('span', { class: 'grow' }, text), ...buttons));
  if (c.research) row('🔬', 'Nothing is being researched.', button('Choose research', go(() => openResearch(ui, { beforeEndTurn: true })), { cls: 'small primary' }));
  if (c.idleSystems.length) {
    const names = c.idleSystems.slice(0, 4).map((s) => s.name).join(', ') + (c.idleSystems.length > 4 ? `, and ${c.idleSystems.length - 4} more` : '');
    row('🛠', `${c.idleSystems.length} ${c.idleSystems.length === 1 ? 'colony has' : 'colonies have'} nothing to build: ${names}.`,
      button('Show them', go(() => openColonies(ui, 'Idle')), { cls: 'small primary' }));
  }
  if (c.idleFleets.length) {
    row('🚀', `${c.idleFleets.length} ${c.idleFleets.length === 1 ? 'fleet has' : 'fleets have'} no orders.`,
      button('Go to the first', go(() => ui.nextIdle()), { cls: 'small primary' }),
      button('Show them', go(() => openFleets(ui, 'Idle')), { cls: 'small' }),
      button('Hold them all', () => {
        for (const f of c.idleFleets) ui.act({ type: 'hold', fleet: f.id, hold: true }, true);
        m.close();
        ui.endTurn();
      }, { cls: 'small', title: 'Mark them as holding position on purpose: they stop counting as waiting for orders until you move them' }));
  }
  if (c.proposals) {
    row('✉', `${c.proposals} ${c.proposals === 1 ? 'proposal is' : 'proposals are'} waiting for your answer.`,
      button('Answer', go(() => openDiplomacy(ui, 'overview')), { cls: 'small primary' }));
  }
  const check = h('input', { type: 'checkbox', checked: endTurnCheckOn(), onchange: (e: Event) => localStorageSet(KEY, (e.target as HTMLInputElement).checked ? 'on' : 'off') });
  body.append(h('div', { class: 'row wrap', style: 'margin-top:10px;gap:8px' },
    h('label', { class: 'row dim', style: 'gap:6px;font-size:12px' }, check, 'Check this before every turn (research is always checked)'),
    h('span', { class: 'grow' }),
    button('Keep playing', () => m.close(), { cls: 'small ghost' }),
    button('End turn', () => { m.close(); ui.endTurn(true); }, { cls: 'primary' })));
}
