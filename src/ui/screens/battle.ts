/** Battle report: what each side brought, what it lost, and why the battle went the way it did. */
import { design } from '../../data/designs';
import { factionDef } from '../../data/factions';
import { BALANCE } from '../../data/balance';
import { TERRAIN_INFO } from '../../data/improvements';
import { CLASSES, ROLES } from '../../data/ships';
import type { BattleRecord, BattleSide } from '../../engine/types';
import { bar, h, modal } from '../dom';
import { factionChip, num } from '../format';
import type { GameUI } from '../game-ui';
import { tokenImage } from '../tokens';

const INDEPENDENT = '@independent';

function sideName(f: string): HTMLElement {
  return f === INDEPENDENT ? h('b', null, 'Independent defenders') : factionChip(f);
}

function strength(s: BattleSide): number {
  return s.attack * s.durability;
}

export function openBattle(ui: GameUI, id: string): void {
  const b = ui.game.battleLog?.find((x) => x.id === id);
  if (!b) {
    modal('Battle report', h('div', { class: 'dim' }, 'This battle is too old: reports are kept for a few rounds.'));
    return;
  }
  modal(`Battle at ${b.place}`, battleBody(ui, b), { wide: true });
}

function battleBody(ui: GameUI, b: BattleRecord): HTMLElement {
  const body = h('div');
  body.append(h('div', { class: 'dim' }, `Turn ${b.turn} · ${TERRAIN_INFO[b.terrain].name}${b.firstRound ? ' · opening round' : ' · the fighting continues'}`,
    ' · ', h('a', { href: '#', style: 'color:var(--accent)', onclick: (e: Event) => { e.preventDefault(); ui.view.centerOn(b.hex); ui.select(b.hex); } }, 'show on map')));
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:10px;margin-top:8px' });
  for (const s of b.sides) grid.append(sideCard(ui, s));
  body.append(grid);

  // How it was decided.
  const fighting = b.sides.filter((s) => s.attack > 0 || s.taken > 0);
  if (fighting.length >= 2) {
    const total = fighting.reduce((a, s) => a + strength(s), 0) || 1;
    const why = h('div', { class: 'card' }, h('b', null, 'How it was decided'),
      h('div', { class: 'dim', style: 'font-size:12px;margin:4px 0' },
        `Combat is simultaneous. Each side's strength is its attack (after enemy shields, point defense and bonuses) times its durability (hull plus shields). `
        + `A side loses about half its force each round against an equal enemy: losses are 50% × (enemy strength ÷ own strength)^0.75, give or take ${Math.round((BALANCE.combatRandomHigh - 1) * 100)}%, and bigger ships and escorts draw more fire.`));
    for (const s of fighting) {
      const share = strength(s) / total;
      why.append(h('div', { class: 'row', style: 'margin-top:4px' }, h('span', { style: 'min-width:170px' }, sideName(s.faction)),
        h('div', { class: 'grow' }, bar(share, s.faction === INDEPENDENT ? '#999' : factionDef(s.faction).color)),
        h('span', { class: 'dim', style: 'min-width:220px;text-align:right' }, `attack ${num(s.attack)} × durability ${num(s.durability)} = ${Math.round(share * 100)}% of the strength`)));
    }
    body.append(why);
  }
  return body;
}

function sideCard(ui: GameUI, s: BattleSide): HTMLElement {
  const lostShips = s.ships.reduce((a, r) => a + r.destroyed + r.captured, 0);
  const totalShips = s.ships.reduce((a, r) => a + r.before, 0);
  const mine = s.faction === ui.viewer;
  const card = h('div', { class: `card ${mine ? 'sel' : ''}` },
    h('div', { class: 'row' }, sideName(s.faction), h('span', { class: 'grow' }),
      totalShips ? h('span', { class: lostShips ? 'bad' : 'good' }, `lost ${lostShips} of ${totalShips} ships`) : ''),
    h('div', { class: 'dim', style: 'font-size:12px' }, `Dealt ${num(s.dealt)} damage, took ${num(s.taken)}.`));
  for (const r of s.ships) {
    const d = design(r.design);
    const img = tokenImage(d.id, 56);
    img.style.cssText = 'width:28px;height:28px';
    const survived = r.before - r.destroyed - r.captured;
    const fate: string[] = [];
    if (r.destroyed) fate.push(`${r.destroyed} destroyed`);
    if (r.captured) fate.push(`${r.captured} captured`);
    if (r.damaged) fate.push(`${r.damaged} damaged`);
    if (!fate.length) fate.push('unharmed');
    card.append(h('div', { class: 'ship-row' }, img,
      h('div', { class: 'grow' }, h('div', null, `${r.before}× ${d.name} `, h('span', { class: 'dim' }, `${CLASSES[d.cls].name} ${ROLES[d.role].name}`),
        d.faction !== s.faction ? h('span', { class: 'dim', style: 'font-size:11px' }, ` (a ${factionDef(d.faction).short} ship, captured or bought)`) : ''),
        h('div', { class: 'row' }, bar(survived ? r.hullAfter / Math.max(1, r.hullBefore) : 0, survived ? '#7cfc9a' : '#ff6b6b'),
          h('span', { class: r.destroyed || r.captured ? 'bad' : 'dim', style: 'font-size:11px' }, fate.join(', '))))));
  }
  if (s.fighters.before) card.append(h('div', { style: 'font-size:12px' }, `Fighters: ${s.fighters.before} → ${s.fighters.after}`));
  if (s.starbase) card.append(h('div', { style: 'font-size:12px' }, `Starbase: hull ${s.starbase.hullBefore} → ${s.starbase.hullAfter}${s.starbase.hullAfter <= 0 ? ' (destroyed)' : ''}`));
  if (s.planet) card.append(h('div', { style: 'font-size:12px' }, `${s.planet.system} planetary defense: ${s.planet.defenseBefore} → ${s.planet.defenseAfter}${s.planet.defenseAfter === 0 ? ' (down: armies can now invade)' : ''}`));
  if (s.notes.length) card.append(h('div', { style: 'margin-top:4px' }, ...s.notes.map((n) => h('div', { class: 'dim', style: 'font-size:12px' }, `• ${n}`))));
  return card;
}
