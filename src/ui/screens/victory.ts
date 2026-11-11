/** Victory: your progress toward each way you can win, and what your spies have learned about rivals. */
import { factionDef } from '../../data/factions';
import { PRESETS, VICTORIES } from '../../data/victories';
import { intelLevel, intelScore, rivalReport, spyQuality } from '../../engine/intel';
import { availableVictories, presetOf, progress } from '../../engine/victory';
import { bar, h } from '../dom';
import { factionChip } from '../format';
import { infoTip } from '../tooltip';
import type { GameUI } from '../game-ui';

const LEVEL_TEXT = [
  'No intelligence. Station spies at their home system.',
  'Your spies know which victories they can pursue.',
  'Your spies know roughly how far along they are.',
  'Your spies know their exact progress.',
];

/** Victory progress (yours and what your spies know of rivals'): the Victory tab of the briefing. */
export function victoryView(ui: GameUI): HTMLElement {
  const g = ui.game;
  const me = ui.viewer;
  const body = h('div');
  body.append(h('div', { class: 'dim' }, `${PRESETS[presetOf(g)].name} game${g.config.turnLimit ? `, turn ${g.turn} of ${g.config.turnLimit}` : `, turn ${g.turn}, no turn limit`}.`));
  body.append(h('h3', null, 'Your ways to win'));
  for (const v of availableVictories(g, me)) {
    const p = progress(g, me, v);
    const def = VICTORIES[v];
    body.append(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('b', { style: def.unique ? 'color:var(--accent)' : '' }, `${def.name}${def.unique ? ' ★' : ''}`), h('span', { class: 'grow' }), h('span', null, `${Math.round(p.fraction * 100)}%`)),
      bar(p.fraction, p.fraction > 0.75 ? '#7cfc9a' : '#6c8cff'),
      h('div', { class: 'dim', style: 'font-size:12px;margin-top:3px' }, def.text),
      h('div', { style: 'font-size:12px' }, p.detail)));
  }
  body.append(h('h3', null, 'Rival great powers'));
  const guards = Object.values(g.agents).filter((a) => a.owner === me && a.kind === 'spy' && a.hex === g.factions[me].home && !a.mission && !a.ship && !a.capturedBy).length;
  body.append(h('div', { class: 'row dim', style: 'font-size:12px;margin-bottom:6px;gap:2px' }, 'Spies at a rival’s capital reveal its progress.', infoTip(
    `Spies stationed at a rival's home system reveal its progress: 1 point of intelligence shows its victories, 2 a rough range, 3 the exact figures. Each spy is worth ${spyQuality(g, me)} point${spyQuality(g, me) === 1 ? '' : 's'} for you. Their own idle spies at home, counter-intelligence tech and Court Intrigue take points away. You have ${guards} ${guards === 1 ? 'spy' : 'spies'} guarding your own home.`)));
  for (const f of Object.values(g.factions)) {
    if (f.kind !== 'major' || f.id === me) continue;
    const met = g.relations[[me, f.id].sort().join('|')]?.contact;
    const card = h('div', { class: 'card' }, h('div', { class: 'row' }, met ? factionChip(f.id) : h('b', null, 'An unknown great power'), h('span', { class: 'grow' }), f.alive ? '' : h('span', { class: 'bad' }, 'eliminated')));
    if (!f.alive) { body.append(card); continue; }
    const level = intelLevel(g, me, f.id);
    const score = intelScore(g, me, f.id);
    card.append(h('div', { class: 'dim', style: 'font-size:12px' }, LEVEL_TEXT[level], score > 0 && level < 3 ? ` (intelligence ${score.toFixed(1)})` : ''));
    const r = rivalReport(g, me, f.id);
    for (const v of r.victories) {
      const def = VICTORIES[v.victory];
      if (v.fraction !== undefined) {
        card.append(h('div', { style: 'margin-top:4px' }, h('div', { class: 'row' }, `${def.name}`, h('span', { class: 'grow' }), `${Math.round(v.fraction * 100)}%`),
          bar(v.fraction, v.fraction > 0.75 ? '#ff6b6b' : '#6c8cff'), h('div', { class: 'dim', style: 'font-size:11px' }, v.detail ?? '')));
      } else if (v.range) {
        card.append(h('div', { class: 'row', style: 'margin-top:2px' }, def.name, h('span', { class: 'grow' }), h('span', { class: v.range[1] > 0.8 ? 'bad' : 'dim' }, `${Math.round(v.range[0] * 100)}–${Math.round(v.range[1] * 100)}%`)));
      } else {
        card.append(h('div', { style: 'margin-top:2px' }, def.name, h('span', { class: 'dim', style: 'font-size:11px' }, ` – ${def.text}`)));
      }
    }
    body.append(card);
  }
  void factionDef;
  return body;
}
