/** Options kept in this browser (not in the game, so every player chooses for themselves). */
import { h, modal } from '../dom';

const REVEALING = 'empire.revealingPortraits';

function get(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function set(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* private mode: lasts this session only */ }
}

/** Whether to show the revealing versions of portraits that have a modest one. Off unless turned on. */
export function revealingPortraits(): boolean {
  return get(REVEALING) === 'on';
}

/** The options dialog. `changed` runs after a change, so open screens can redraw. */
export function openOptions(changed?: () => void): void {
  const box = h('input', { type: 'checkbox', checked: revealingPortraits(), onchange: (e: Event) => {
    set(REVEALING, (e.target as HTMLInputElement).checked ? 'on' : 'off');
    changed?.();
  } });
  modal('Options', h('div', null,
    h('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, box,
      h('span', null, h('b', null, 'Show revealing portraits'),
        h('div', { class: 'dim', style: 'font-size:12px' }, 'Some envoys have a more revealing portrait as well as the standard one. Off shows the standard one. Saved in this browser only.')))));
}
