/** Collapsible groups of things that can't be used right now. */
import { h } from './dom';

/**
 * The "unavailable" group under a list: collapsed to one line ("Show unavailable (n)") unless the player
 * opened it, which is remembered in this browser for every such list.
 */
export function collapsibleUnavailable(rows: HTMLElement[], rerender: () => void, noun = 'unavailable'): HTMLElement[] {
  if (!rows.length) return [];
  let open = false;
  try { open = localStorage.getItem('empire.showUnavailable') === 'on'; } catch { /* default closed */ }
  const toggle = h('button', { class: 'unavail-toggle', onclick: () => {
    try { localStorage.setItem('empire.showUnavailable', open ? 'off' : 'on'); } catch { /* this session only */ }
    rerender();
  } }, `${open ? '▾ Hide' : '▸ Show'} ${noun} (${rows.length})`);
  return open ? [toggle, h('div', { class: 'unavail-list' }, ...rows)] : [toggle];
}
