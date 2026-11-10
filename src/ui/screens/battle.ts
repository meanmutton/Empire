/** Battle report: what each side brought, what it lost, and why the battle went the way it did. */
import { design } from '../../data/designs';
import { factionDef } from '../../data/factions';
import { DEFAULT_COMBAT_ROUNDS, RANGE_MODS } from '../../data/doctrines';
import { TERRAIN_INFO } from '../../data/improvements';
import { CLASSES, ROLES } from '../../data/ships';
import type { BattleRecord, BattleSide } from '../../engine/types';
import { bar, h, modal } from '../dom';
import { factionChip, num } from '../format';
import type { GameUI } from '../game-ui';
import { tokenElement } from '../tokens';

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
  const rounds = b.fought ? `${b.fought} of ${b.maxRounds} combat round${b.maxRounds === 1 ? '' : 's'}` : '';
  body.append(h('div', { class: 'dim' }, `Turn ${b.turn} · ${TERRAIN_INFO[b.terrain].name}${b.firstRound ? ' · opening battle' : ' · the fighting continues'}${rounds ? ` · ${rounds}` : ''}`,
    ' · ', h('a', { href: '#', style: 'color:var(--accent)', onclick: (e: Event) => { e.preventDefault(); ui.view.centerOn(b.hex); ui.select(b.hex); } }, 'show on map')));
  if (b.winner !== undefined) {
    body.append(h('div', { style: 'margin-top:6px;font-size:15px' }, b.winner
      ? h('span', null, sideName(b.winner), b.winner === ui.viewer ? h('span', { class: 'good' }, ' came out ahead.') : ' came out ahead.')
      : h('span', { class: 'dim' }, 'A draw: neither side came out ahead.')));
  }
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:10px;margin-top:8px' });
  for (const s of b.sides) grid.append(sideCard(ui, s));
  body.append(grid);

  if (b.rounds?.length) {
    const log = h('div', { class: 'card' }, h('b', null, 'Round by round'));
    for (const r of b.rounds) {
      const line = r.sides.filter((s) => s.dealt > 0 || s.taken > 0)
        .map((s) => `${s.faction === INDEPENDENT ? 'Independents' : factionDef(s.faction).short} dealt ${num(s.dealt)}${s.lost ? `, lost ${s.lost} ship${s.lost > 1 ? 's' : ''}` : ''}`).join(' · ');
      log.append(h('div', { style: 'margin-top:6px' }, h('b', null, `Round ${r.n}`), h('span', { class: 'dim' }, ` · ${RANGE_MODS[r.range].name}`)),
        h('div', { style: 'font-size:12px' }, line || 'No damage.'),
        ...r.lines.map((l) => h('div', { class: l.startsWith('★') ? 'bad' : 'dim', style: `font-size:12px${l.startsWith('★') ? ';font-weight:bold' : ''}` }, l)));
    }
    body.append(log);
  }

  const fighting = b.sides.filter((s) => s.attack > 0 || s.taken > 0);
  if (fighting.length >= 2) {
    const total = fighting.reduce((a, s) => a + strength(s), 0) || 1;
    const why = h('div', { class: 'card' }, h('b', null, 'How battles work'),
      h('div', { class: 'dim', style: 'font-size:12px;margin:4px 0' },
        `A battle lasts up to ${b.maxRounds ?? DEFAULT_COMBAT_ROUNDS} combat rounds. Each round the fleets maneuver for range (beams hit hardest at close quarters, missiles and fighters at long range), `
        + 'then every ship fires: each shot can miss, does 50–150% of its usual damage, and sometimes lands a critical hit. Each side also has its fortunes of war for the battle. '
        + 'Ships below half hull are damaged and fire less; below a quarter they are crippled. Fleets withdraw when their battle orders say so, taking fire as they go. '
        + 'The side whose enemies lost more (by build value) comes out ahead. Starting strength, firepower × durability:'));
    for (const s of fighting) {
      const share = strength(s) / total;
      why.append(h('div', { class: 'row', style: 'margin-top:4px' }, h('span', { style: 'min-width:170px' }, sideName(s.faction)),
        h('div', { class: 'grow' }, bar(share, s.faction === INDEPENDENT ? '#999' : factionDef(s.faction).color)),
        h('span', { class: 'dim', style: 'min-width:220px;text-align:right' }, `attack ${num(s.attack)} × durability ${num(s.durability)} = ${Math.round(share * 100)}%`)));
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
    h('div', { class: 'dim', style: 'font-size:12px' }, `Dealt ${num(s.dealt)} damage, took ${num(s.taken)}.`
      + `${s.crits ? ` ${s.crits} critical hit${s.crits > 1 ? 's' : ''}.` : ''}${s.withdrew ? ` ${s.withdrew} fleet${s.withdrew > 1 ? 's' : ''} withdrew.` : ''}`
      + `${s.valueLost !== undefined ? ` Lost ${num(s.valueLost)} in value.` : ''}`));
  for (const r of s.ships) {
    const d = design(r.design);
    const img = tokenElement(d.id, 56);
    img.style.cssText = 'width:28px;height:28px';
    const survived = r.before - r.destroyed - r.captured;
    const fate: string[] = [];
    if (r.destroyed) fate.push(`${r.destroyed} destroyed`);
    if (r.captured) fate.push(`${r.captured} captured`);
    if (r.crippled) fate.push(`${r.crippled} crippled`);
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
