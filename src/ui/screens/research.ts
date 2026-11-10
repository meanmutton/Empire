import { FIELDS, TECHS } from '../../data/techs';
import { canResearch, completedFields, techCost } from '../../engine/research';
import { button, h, modal } from '../dom';
import { num } from '../format';
import type { GameUI } from '../game-ui';

/**
 * The research tree. With `beforeEndTurn`, it was opened because the player pressed End Turn with nothing
 * being researched: it says so, and offers to end the turn once a project is picked.
 */
export function openResearch(ui: GameUI, opts: { beforeEndTurn?: boolean } = {}): void {
  const body = h('div');
  const m = modal('Research', body, { wide: true });
  const render = () => {
    const g = ui.game;
    const r = g.factions[ui.viewer].research;
    const known = new Set(r.known);
    body.innerHTML = '';
    if (opts.beforeEndTurn) {
      body.append(h('div', { class: 'card', style: 'margin-bottom:8px;border-color:var(--accent)' },
        h('div', { class: 'row' },
          h('span', { class: 'grow' }, r.current ? `Researching ${TECHS.find((t) => t.id === r.current)!.name}. Ready to end your turn.` : 'Nothing is being researched. Pick a project, then end your turn.'),
          r.current ? button('End turn', () => { m.close(); ui.endTurn(); }, { cls: 'primary' }) : null,
          button(r.current ? 'Keep playing' : 'End turn anyway', () => { m.close(); if (!r.current) ui.endTurn(true); }, { cls: 'small ghost' }))));
    }
    body.append(h('div', { class: 'row', style: 'margin-bottom:8px' },
      h('span', null, r.current ? `Researching ${TECHS.find((t) => t.id === r.current)!.name}: ${num(r.progress)} / ${techCost(r.current)}` : `Banked science: ${num(r.progress)}. Pick a project.`),
      h('span', { class: 'grow' }),
      h('span', { class: 'dim' }, `${known.size} / ${TECHS.length} known · fields complete: ${completedFields(g, ui.viewer).length}`)));
    const grid = h('div', { class: 'tech-grid' });
    for (const field of FIELDS) {
      const col = h('div', null, h('h3', null, field));
      for (const t of TECHS.filter((x) => x.field === field || (field === 'computing' && x.id === 'ascension' && false)).sort((a, b) => a.tier - b.tier)) {
        if (t.id === 'ascension') continue;
        col.append(techBox(ui, t.id, known, render));
      }
      grid.append(col);
    }
    body.append(grid, h('h3', null, 'Ascension'), techBox(ui, 'ascension', known, render));
  };
  render();
  void m;
}

function techBox(ui: GameUI, id: string, known: Set<string>, rerender: () => void): HTMLElement {
  const t = TECHS.find((x) => x.id === id)!;
  const g = ui.game;
  const r = g.factions[ui.viewer].research;
  const avail = canResearch(g, ui.viewer, id);
  const cls = known.has(id) ? 'known' : r.current === id ? 'current avail' : avail ? 'avail' : 'locked';
  const reqs = t.requires.length ? `Needs: ${t.requires.map((q) => TECHS.find((x) => x.id === q)!.name).join(', ')}` : '';
  return h('div', {
    class: `tech ${cls}`, title: `${t.text}\n${reqs}`,
    onclick: () => { if (avail && ui.act({ type: 'research', tech: id }, true)) rerender(); },
  }, h('div', { class: 'row' }, h('b', { class: 'grow' }, t.name), h('span', { class: 'dim' }, known.has(id) ? '✓' : `T${t.tier} · ${techCost(id)}`)),
  h('div', { class: 'dim', style: 'font-size:11px' }, t.text));
}

export { button };
