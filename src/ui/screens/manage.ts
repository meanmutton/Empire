/**
 * Management screens: every colony, fleet and agent of the viewer in one sortable list, with the same
 * controls as the side panel for the one picked. Picking a row also selects it on the map, so "Show on map"
 * (or pressing Move) just closes the screen.
 */
import { design } from '../../data/designs';
import { DOCTRINE_IDS, DOCTRINES, type DoctrineId } from '../../data/doctrines';
import { factionDef, hasAbility } from '../../data/factions';
import { IMPROVEMENTS } from '../../data/improvements';
import { CLASSES } from '../../data/ships';
import { blockadedHexes } from '../../engine/blockade';
import { isCrippled } from '../../engine/combat';
import { popCapOf, productionOf, systemYield } from '../../engine/economy';
import { hostilesAt } from '../../engine/movement';
import { relation } from '../../engine/query';
import type { Agent, Fleet } from '../../engine/types';
import { bar, button, clear, h, modal } from '../dom';
import { factionChip, num } from '../format';
import { DEV_NAMES, type GameUI } from '../game-ui';

interface Column<T> {
  name: string;
  /** Sort key (numbers sort high first, strings A–Z). */
  key: (row: T) => number | string;
  cell: (row: T) => HTMLElement | string;
  title?: string;
}

/**
 * A two-pane screen: a sortable, filterable table on the left and a detail pane on the right. Re-renders
 * whenever the game view refreshes; closes itself when the player starts choosing a destination on the map.
 */
function managementScreen<T>(ui: GameUI, opts: {
  title: string;
  rows: () => T[];
  id: (row: T) => string;
  columns: Column<T>[];
  filters: [string, (row: T) => boolean][];
  detail: (row: T) => HTMLElement;
  select: (row: T) => void;
  hexOf: (row: T) => number;
  empty: string;
  summary?: (rows: T[]) => HTMLElement | string;
  /** Name of the filter tab to open on (e.g. 'Idle'). */
  initialFilter?: string;
}): void {
  const body = h('div');
  let sortCol = 0, desc = false, picked: string | null = null;
  let filter = Math.max(0, opts.filters.findIndex(([name]) => name === opts.initialFilter));
  const m = modal(opts.title, body, { wide: true, onClose: () => unsubscribe() });
  const render = () => {
    const all = opts.rows();
    const rows = all.filter(opts.filters[filter][1]);
    const col = opts.columns[sortCol];
    rows.sort((a, b) => {
      const x = col.key(a), y = col.key(b);
      const c = typeof x === 'number' && typeof y === 'number' ? y - x : String(x).localeCompare(String(y));
      return desc ? -c : c;
    });
    if (picked && !all.some((r) => opts.id(r) === picked)) picked = null;
    clear(body);
    if (opts.summary) body.append(h('div', { class: 'dim', style: 'margin-bottom:6px' }, opts.summary(all)));
    body.append(h('div', { class: 'tabs' }, ...opts.filters.map(([name, test], i) =>
      button(`${name} (${all.filter(test).length})`, () => { filter = i; render(); }, { cls: `small ${filter === i ? 'on' : ''}` }))));
    const table = h('table', { class: 't manage' },
      h('thead', null, h('tr', null, ...opts.columns.map((c, i) => h('th', {
        title: c.title ?? 'Sort', style: 'cursor:pointer;white-space:nowrap',
        onclick: () => { if (sortCol === i) desc = !desc; else { sortCol = i; desc = false; } render(); },
      }, c.name + (sortCol === i ? (desc ? ' ▴' : ' ▾') : ''))))));
    const tbody = h('tbody');
    for (const r of rows) {
      const id = opts.id(r);
      tbody.append(h('tr', {
        class: id === picked ? 'sel' : '', style: 'cursor:pointer',
        onclick: () => { picked = id; opts.select(r); render(); },
      }, ...opts.columns.map((c) => h('td', null, c.cell(r)))));
    }
    table.append(tbody);
    const left = h('div', { style: 'overflow-x:auto' }, rows.length ? table : h('div', { class: 'dim' }, opts.empty));
    const pickedRow = picked ? all.find((r) => opts.id(r) === picked) : undefined;
    const right = h('div');
    if (pickedRow) {
      right.append(h('div', { class: 'row', style: 'margin-bottom:6px' },
        button('Show on map', () => { m.close(); ui.view.centerOn(opts.hexOf(pickedRow)); }, { cls: 'small' })),
      opts.detail(pickedRow));
    } else right.append(h('div', { class: 'dim' }, 'Pick a row to manage it here.'));
    body.append(h('div', { class: 'manage-grid' }, left, right));
  };
  const unsubscribe = ui.onRefresh(() => {
    // Choosing a destination happens on the map: get out of the way.
    if (ui.moving) { const hex = picked ? opts.hexOf(opts.rows().find((r) => opts.id(r) === picked)!) : null; m.close(); if (hex !== null) ui.view.centerOn(hex); return; }
    render();
  });
  render();
}

// -------------------------------------------------------------------------------------------------------
// Colonies

export function openColonies(ui: GameUI, initialFilter?: string): void {
  const g = () => ui.game;
  const name = (hex: number) => g().map.hexes[hex].system!.name;
  managementScreen<number>(ui, {
    title: 'Colonies',
    initialFilter,
    rows: () => g().map.hexes.map((x, i) => (x.owner === ui.viewer && x.system && x.system.development > 0 ? i : -1)).filter((i) => i >= 0),
    id: (hex) => String(hex),
    hexOf: (hex) => hex,
    select: (hex) => ui.select(hex),
    empty: 'No colonies.',
    summary: (rows) => {
      const idle = rows.filter((hex) => g().map.hexes[hex].system!.queue.length === 0).length;
      const pop = rows.reduce((a, hex) => a + g().map.hexes[hex].system!.population, 0);
      return `${rows.length} colonies, population ${num(pop)}. ${idle ? `${idle} with nothing to build.` : 'Every colony is building something.'}`;
    },
    filters: [
      ['All', () => true],
      ['Idle', (hex) => g().map.hexes[hex].system!.queue.length === 0],
      ['Shipyards', (hex) => g().map.hexes[hex].system!.improvements.some((i) => i === 'shipyard' || i === 'heavyShipyard')],
      ['Trouble', (hex) => { const s = g().map.hexes[hex].system!; return s.unrest > 0 || blockadedHexes(g(), ui.viewer).has(hex) || hostilesAt(g(), ui.viewer, hex); }],
    ],
    columns: [
      { name: 'System', key: name, cell: (hex) => h('b', null, name(hex) + (g().map.hexes[hex].system!.homeOf ? ' ★' : '')) },
      { name: 'Dev', title: 'Development level', key: (hex) => g().map.hexes[hex].system!.development, cell: (hex) => { const d = g().map.hexes[hex].system!.development; return h('span', { title: DEV_NAMES[d] }, String(d)); } },
      { name: 'Pop', title: 'Population / capacity', key: (hex) => g().map.hexes[hex].system!.population, cell: (hex) => { const s = g().map.hexes[hex].system!; return `${num(s.population)}/${num(popCapOf(g(), s, ui.viewer))}`; } },
      { name: '⚡', title: 'Energy per turn', key: (hex) => systemYield(g(), hex).energy, cell: (hex) => num(systemYield(g(), hex).energy) },
      { name: '⛏', title: 'Metals per turn', key: (hex) => systemYield(g(), hex).metals, cell: (hex) => num(systemYield(g(), hex).metals) },
      { name: '🔬', title: 'Science per turn', key: (hex) => systemYield(g(), hex).science, cell: (hex) => num(systemYield(g(), hex).science) },
      { name: 'Prod', title: 'Production points per turn', key: (hex) => productionOf(g(), hex), cell: (hex) => num(productionOf(g(), hex)) },
      {
        name: 'Building', key: (hex) => g().map.hexes[hex].system!.queue.length,
        cell: (hex) => {
          const q = g().map.hexes[hex].system!.queue;
          if (!q.length) return h('span', { class: 'bad' }, 'idle');
          const head = q[0];
          const label = head.kind === 'ship' ? design(head.item).name : head.kind === 'improvement' ? IMPROVEMENTS[head.item]?.name ?? head.item : head.kind === 'develop' ? 'Develop' : head.kind;
          const turns = Math.ceil(head.remaining / Math.max(0.1, productionOf(g(), hex)));
          return `${label} (${turns}t)${q.length > 1 ? ` +${q.length - 1}` : ''}`;
        },
      },
      { name: 'Def', title: 'Planetary defense', key: (hex) => g().map.hexes[hex].system!.defense, cell: (hex) => num(g().map.hexes[hex].system!.defense) },
      {
        name: 'Status', key: (hex) => g().map.hexes[hex].system!.unrest,
        cell: (hex) => {
          const s = g().map.hexes[hex].system!;
          const notes: string[] = [];
          if (hostilesAt(g(), ui.viewer, hex)) notes.push('enemies here');
          if (blockadedHexes(g(), ui.viewer).has(hex)) notes.push('blockaded');
          if (s.unrest > 0) notes.push(`unrest ${num(s.unrest)}`);
          return notes.length ? h('span', { class: 'bad' }, notes.join(', ')) : h('span', { class: 'dim' }, 'ok');
        },
      },
    ],
    detail: (hex) => h('div', null, h('h3', null, name(hex)), ui.systemPanel(hex)),
  });
}

// -------------------------------------------------------------------------------------------------------
// Fleets

function placeName(ui: GameUI, hex: number): string {
  const sys = ui.game.map.hexes[hex].system;
  return sys ? sys.name : `deep space (${hex % ui.game.map.width}, ${Math.floor(hex / ui.game.map.width)})`;
}

function hullFrac(ui: GameUI, f: Fleet): number {
  let hull = 0, max = 0;
  for (const sid of f.ships) { const s = ui.game.ships[sid]; hull += s.hull; max += design(s.design).stats.hull; }
  return max ? hull / max : 1;
}

export function openFleets(ui: GameUI, initialFilter?: string): void {
  const g = () => ui.game;
  const fleets = () => Object.values(g().fleets).filter((f) => f.owner === ui.viewer);
  const atWarHere = (f: Fleet) => hostilesAt(g(), ui.viewer, f.hex);
  const armed = (f: Fleet) => f.ships.some((s) => { const d = design(g().ships[s].design).stats; return d.energy + d.missile + d.hangar > 0; });
  const rynkai = hasAbility(ui.viewer, 'wayOfTheBlade');
  managementScreen<Fleet>(ui, {
    title: 'Fleets',
    initialFilter,
    rows: fleets,
    id: (f) => f.id,
    hexOf: (f) => f.hex,
    select: (f) => ui.select(f.hex, f.id),
    empty: 'No fleets match.',
    summary: (rows) => `${rows.length} fleets, ${rows.reduce((a, f) => a + f.ships.length, 0)} ships. ${rows.filter((f) => f.movesLeft > 0 && !f.path.length && !f.hold).length} without orders this turn.`,
    filters: [
      ['All', () => true],
      ['Warships', armed],
      ['Idle', (f) => f.movesLeft > 0 && f.path.length === 0 && !f.hold],
      ['Holding', (f) => !!f.hold],
      ['Damaged', (f) => hullFrac(ui, f) < 0.95],
      ['In battle', atWarHere],
      ['Support', (f) => !armed(f)],
    ],
    columns: [
      { name: 'Fleet', key: (f) => f.name || 'Fleet', cell: (f) => h('b', null, f.name || 'Fleet') },
      { name: 'Where', key: (f) => placeName(ui, f.hex), cell: (f) => placeName(ui, f.hex) },
      {
        name: 'Ships', key: (f) => f.ships.length,
        cell: (f) => {
          const counts = new Map<string, number>();
          for (const s of f.ships) { const c = CLASSES[design(g().ships[s].design).cls].name; counts.set(c, (counts.get(c) ?? 0) + 1); }
          return h('span', { title: [...counts].map(([c, n]) => `${n} ${c}`).join(', ') }, `${f.ships.length} · ${[...counts].map(([c, n]) => `${n} ${c}`).join(', ')}`);
        },
      },
      {
        name: 'Hull', key: (f) => hullFrac(ui, f),
        cell: (f) => {
          const fr = hullFrac(ui, f);
          const crippled = f.ships.filter((s) => { const x = g().ships[s]; return isCrippled(x.hull, design(x.design).stats.hull); }).length;
          return h('div', { style: 'min-width:80px', title: crippled ? `${crippled} crippled` : '' }, bar(fr, fr > 0.5 ? '#7cfc9a' : '#ff6b6b'), crippled ? h('span', { class: 'bad', style: 'font-size:11px' }, `${crippled} crippled`) : '');
        },
      },
      {
        name: 'Orders', title: 'Battle orders (change them here)', key: (f) => DOCTRINES[f.doctrine].name,
        cell: (f) => h('select', {
          title: DOCTRINES[f.doctrine].text, disabled: !ui.myTurn,
          onclick: (e: Event) => e.stopPropagation(),
          onchange: (e: Event) => ui.act({ type: 'doctrine', fleet: f.id, doctrine: (e.target as HTMLSelectElement).value as DoctrineId }),
        }, ...DOCTRINE_IDS.filter((d) => !(rynkai && DOCTRINES[d].withdrawAt === 0)).map((d) => h('option', { value: d, selected: f.doctrine === d }, DOCTRINES[d].name))),
      },
      { name: 'Moves', key: (f) => f.movesLeft, cell: (f) => String(f.movesLeft) },
      {
        name: 'Heading', key: (f) => (f.path.length ? placeName(ui, f.path[f.path.length - 1]) : ''),
        cell: (f) => atWarHere(f) ? h('span', { class: 'bad' }, 'in battle')
          : f.hold ? h('span', { class: 'dim' }, 'holding')
          : f.path.length ? `${placeName(ui, f.path[f.path.length - 1])} (${f.path.length} hexes)` : h('span', { class: 'dim' }, f.movesLeft > 0 ? 'no orders' : '—'),
      },
      {
        name: 'Aboard', key: (f) => f.ships.reduce((a, s) => a + g().ships[s].cargo.length, 0),
        cell: (f) => {
          const cargo = f.ships.flatMap((s) => g().ships[s].cargo);
          const armies = cargo.filter((c) => g().armies[c]).length, agents = cargo.filter((c) => g().agents[c]).length;
          return [armies ? `${armies} armies` : '', agents ? `${agents} agents` : ''].filter(Boolean).join(', ') || '';
        },
      },
    ],
    detail: (f) => ui.fleetCard(f),
  });
}

// -------------------------------------------------------------------------------------------------------
// Agents (diplomats and spies)

export function openAgents(ui: GameUI): void {
  const g = () => ui.game;
  const mine = () => Object.values(g().agents).filter((a) => a.owner === ui.viewer);
  const where = (a: Agent) => (a.ship ? 'aboard ship' : placeName(ui, a.hex));
  managementScreen<Agent>(ui, {
    title: 'Diplomats and spies',
    rows: mine,
    id: (a) => a.id,
    hexOf: (a) => a.hex,
    select: (a) => ui.select(a.hex, null, a.id),
    empty: 'No agents match. Any colony of level 2 or more trains diplomats and spies (Build → Other).',
    summary: () => embassySummary(ui),
    filters: [
      ['All', () => true],
      ['Diplomats', (a) => a.kind === 'diplomat'],
      ['Spies', (a) => a.kind === 'spy'],
      ['Idle', (a) => !a.resident && !a.mission && !a.path.length && !a.ship && !a.capturedBy],
      ['Captured', (a) => !!a.capturedBy],
    ],
    columns: [
      { name: 'Agent', key: (a) => a.kind, cell: (a) => h('b', null, a.kind === 'diplomat' ? '⚑ Diplomat' : '◆ Spy') },
      { name: 'Where', key: where, cell: where },
      { name: 'Doing', key: (a) => ui.agentStatus(a.id), cell: (a) => ui.agentStatus(a.id) },
      {
        name: 'With', title: 'The power it is posted to or working against', key: (a) => a.target ?? '',
        cell: (a) => (a.target && g().factions[a.target] ? factionChip(a.target, true) : ''),
      },
    ],
    detail: (a) => (a.capturedBy ? h('div', { class: 'card' }, `Held prisoner by the ${factionDef(a.capturedBy).name}. Prisoners can be traded back in Diplomacy.`) : ui.agentCard(a.id)),
  });
}

/** Which powers you have an embassy with, and which you could still send a diplomat to. */
function embassySummary(ui: GameUI): HTMLElement {
  const g = ui.game;
  const others = Object.values(g.factions).filter((f) => f.id !== ui.viewer && f.alive && relation(g, ui.viewer, f.id).contact);
  const posted = new Set(Object.values(g.agents).filter((a) => a.owner === ui.viewer && a.kind === 'diplomat' && a.resident).map((a) => a.target));
  const on = others.filter((f) => posted.has(f.id)), off = others.filter((f) => !posted.has(f.id));
  return h('div', null,
    h('div', null, h('b', null, 'Embassies: '), on.length ? '' : h('span', { class: 'dim' }, 'none yet. '), ...on.map((f) => factionChip(f.id, true))),
    off.length ? h('div', { style: 'margin-top:2px' }, h('span', { class: 'dim' }, 'No embassy with: '), ...off.map((f) => factionChip(f.id, true))) : '',
    h('div', { class: 'dim', style: 'font-size:12px;margin-top:2px' }, 'You need an embassy with a power to trade or sign treaties with it. Send a diplomat to its home system.'));
}
