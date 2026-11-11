/**
 * Turn briefing: what happened since your last turn, as a dialog like the other screens
 * rather than a dialog in the way. Counters at the top (battles, wars, proposals, builds, idle colonies and
 * fleets) jump to the right place; events are grouped into Military, Diplomacy, Empire and Galaxy, each
 * line jumps to the map, and battles link to their reports.
 *
 * The game state only keeps a few rounds of events, so this browser keeps its own archive per game and
 * player (localStorage, capped): the History tab pages back through every turn you have seen here.
 */
import { factionDef } from '../../data/factions';
import type { GameEvent, GameState } from '../../engine/types';
import { eventsFor } from '../../engine/events';
import { button, clear, h, isTouch, modal } from '../dom';
import { sfx } from '../sound';
import { infoTip } from '../tooltip';
import type { GameUI } from '../game-ui';
import { openBattle } from './battle';
import { victoryView } from './victory';
import { openDiplomacy } from './diplomacy';
import { openColonies, openFleets } from './manage';

type Section = 'military' | 'diplomacy' | 'empire' | 'galaxy';

const SECTION_NAMES: Record<Section, string> = { military: 'Military', diplomacy: 'Diplomacy', empire: 'Empire', galaxy: 'Galaxy' };

const KIND_SECTION: Record<string, Section> = {
  battle: 'military', captured: 'military', invasion: 'military', blockade: 'military', raid: 'military',
  war: 'diplomacy', peace: 'diplomacy', treaty: 'diplomacy', embassy: 'diplomacy', proposal: 'diplomacy', contact: 'diplomacy',
  vassal: 'diplomacy', spy: 'diplomacy', expelled: 'diplomacy', executed: 'diplomacy',
  victory: 'galaxy', eliminated: 'galaxy', council: 'galaxy',
};

/** Kinds that are routine bookkeeping: on their own, they don't open the briefing at turn start. */
const ROUTINE = new Set(['built', 'developed', 'claim', 'exchange', 'route', 'contract', 'mercenary']);

const ICONS: Record<string, string> = {
  battle: '⚔', war: '🔥', peace: '🕊', treaty: '📜', built: '🛠', research: '🔬', colonized: '🌍', captured: '⛓', invasion: '🪖',
  embassy: '🏛', proposal: '✉', contact: '👁', spy: '🕵', vassal: '👑', victory: '🏆', eliminated: '☠', ruins: '⌂', developed: '⬆',
  defection: '🚩', blockade: '🚫', raid: '🏴', council: '🗳', capital: '🏛', wonder: '✨', route: '🚚', exchange: '💱',
  mercenary: '🗡', contract: '📦', claim: '⬡', expelled: '🚪', executed: '⚰',
};

export function iconFor(kind: string): string {
  return ICONS[kind] ?? '•';
}

function sectionOf(kind: string): Section {
  return KIND_SECTION[kind] ?? 'empire';
}

// -------------------------------------------------------------------------------------------------------
// Archive

interface Entry { k: string; b: number; turn: number; kind: string; text: string; hex?: number; ref?: string }
interface Archive { last: number; lastTurn: number; items: Entry[] }

const CAP = 2000;
const archiveKey = (game: string, viewer: string) => `empire.brief.${game}.${viewer}`;
const entryKey = (e: GameEvent) => `${e.turn}|${e.seq ?? 0}|${e.kind}|${e.text}`;

function loadArchive(game: string, viewer: string): Archive {
  try {
    const raw = localStorage.getItem(archiveKey(game, viewer));
    if (raw) return JSON.parse(raw) as Archive;
  } catch { /* unreadable or blocked: start afresh */ }
  return { last: 0, lastTurn: 0, items: [] };
}

function saveArchive(game: string, viewer: string, a: Archive): void {
  if (a.items.length > CAP) a.items = a.items.slice(a.items.length - CAP);
  try { localStorage.setItem(archiveKey(game, viewer), JSON.stringify(a)); } catch { /* full or blocked: keep it for this session only */ }
}

/**
 * Adds events the archive hasn't seen. With `newBriefing` (the start of your turn) they start a new
 * briefing; otherwise they join the current one (things that happened since it opened).
 */
function sync(game: string, g: GameState, viewer: string, newBriefing: boolean): Archive {
  const a = loadArchive(game, viewer);
  const known = new Set(a.items.map((i) => i.k));
  const fresh = eventsFor(g, viewer).filter((e) => !known.has(entryKey(e)));
  if (newBriefing && (fresh.length || a.lastTurn !== g.turn)) { a.last++; a.lastTurn = g.turn; }
  for (const e of fresh) a.items.push({ k: entryKey(e), b: a.last, turn: e.turn, kind: e.kind, text: e.text, ...(e.hex !== undefined ? { hex: e.hex } : {}), ...(e.ref ? { ref: e.ref } : {}) });
  saveArchive(game, viewer, a);
  return a;
}

// -------------------------------------------------------------------------------------------------------
// The dialog

let current: { close: () => void } | null = null;

/**
 * Opens the briefing. `auto` (the start of your turn) starts a new briefing and opens only if something
 * worth reading happened; otherwise it opens on the current briefing (or History).
 */
export function openBriefing(ui: GameUI, opts: { auto?: boolean; tab?: 'turn' | 'history' | 'victory' } = {}): void {
  const g = ui.game;
  const a = sync(ui.gameKey, g, ui.viewer, !!opts.auto);
  const items = a.items.filter((i) => i.b === a.last);
  const pending = Object.values(g.proposals).filter((p) => p.to === ui.viewer && !p.answer).length;
  if (opts.auto && !pending && !items.some((i) => !ROUTINE.has(i.kind))) return;
  // The start of your turn sounds like what happened: a battle, a war, or simply news.
  if (opts.auto) sfx(items.some((i) => i.kind === 'battle') ? 'battle' : items.some((i) => i.kind === 'war') ? 'war' : 'message');
  current?.close();
  let tab: 'turn' | 'history' | 'victory' = opts.tab ?? 'turn';
  let page = 0;
  // A dialog like the other screens (also when it opens by itself at the start of your turn).
  const body = h('div', { class: 'briefing-body' });
  const m = modal('Briefing', body, { wide: true, onClose: () => { if (current?.close === close) current = null; } });
  const close = () => m.close();
  current = { close };
  // Showing something on the map closes the briefing, so the map can be seen.
  const jump = (hex: number | undefined) => {
    if (hex === undefined) return;
    close();
    ui.view.centerOn(hex);
    ui.select(hex);
  };
  const render = () => {
    clear(body);
    const turnLabel = a.lastTurn ? `Turn ${a.lastTurn}` : `Turn ${g.turn}`;
    const tabs: ['turn' | 'history' | 'victory', string][] = [['turn', turnLabel], ['history', 'History'], ['victory', 'Victory']];
    body.append(h('div', { class: 'tabs', style: 'margin:0 0 8px' }, ...tabs.map(([k, label]) =>
      button(label, () => { tab = k; page = 0; render(); }, { cls: `small ${tab === k ? 'on' : ''}` }))));
    body.append(tab === 'turn' ? turnView(ui, items, pending, jump, close)
      : tab === 'history' ? historyView(ui, a, page, (p) => { page = p; render(); }, jump)
      : victoryView(ui));
  };
  render();
}

/** Closes the briefing if it is open (e.g. when the turn passes to another player). */
export function closeBriefing(): void {
  current?.close();
}

function lineFor(ui: GameUI, e: Entry, jump: (hex?: number) => void): HTMLElement {
  const row = h('div', { class: `brief-line ${e.hex !== undefined ? 'link' : ''}`, title: e.hex !== undefined ? 'Show on the map' : '' },
    h('span', { class: 'brief-icon' }, iconFor(e.kind)), h('span', { class: 'grow' }, e.text));
  if (e.kind === 'battle' && e.ref) {
    const have = ui.game.battleLog?.some((b) => b.id === e.ref);
    row.append(have ? button('Report', () => openBattle(ui, e.ref!), { cls: 'small' }) : h('span', { class: 'dim', style: 'font-size:11px' }, 'report expired'));
  }
  if (e.hex !== undefined) row.addEventListener('click', (ev) => { if ((ev.target as HTMLElement).closest('button')) return; jump(e.hex); });
  return row;
}

/** Repeated "X completed at Y" lines become one line per system. */
function collapseBuilds(items: Entry[]): Entry[] {
  const out: Entry[] = [];
  const bySystem = new Map<string, { e: Entry; names: string[] }>();
  for (const e of items) {
    const m = e.kind === 'built' ? /^(.*) completed at (.*)\.$/.exec(e.text) : null;
    if (!m) { out.push(e); continue; }
    const [, what, where] = m;
    const g = bySystem.get(where);
    if (g) { g.names.push(what); continue; }
    const entry = { ...e };
    bySystem.set(where, { e: entry, names: [what] });
    out.push(entry);
  }
  for (const [where, { e, names }] of bySystem) {
    if (names.length < 2) continue;
    const counts = new Map<string, number>();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    e.text = `${where} completed ${[...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ')}.`;
  }
  return out;
}

function turnView(ui: GameUI, items: Entry[], pending: number, jump: (hex?: number) => void, close: () => void): HTMLElement {
  const g = ui.game;
  const wrap = h('div');
  const c = ui.turnChecklist();
  const count = (k: string) => items.filter((i) => i.kind === k).length;
  const chip = (icon: string, n: number, label: string, onClick?: () => void, bad = false) =>
    n ? h('button', { class: `brief-chip ${bad ? 'bad' : ''}`, onclick: () => onClick?.(), disabled: !onClick }, `${icon} ${n} ${label}`) : null;
  const goSection = (s: Section) => () => wrap.querySelector(`[data-section="${s}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const chips = [
    chip('⚔', count('battle'), count('battle') === 1 ? 'battle' : 'battles', goSection('military'), true),
    chip('🔥', count('war'), count('war') === 1 ? 'war declared' : 'wars declared', goSection('diplomacy'), true),
    chip('✉', pending, pending === 1 ? 'proposal' : 'proposals', () => { close(); openDiplomacy(ui, 'overview'); }, true),
    chip('🛠', count('built'), 'built', goSection('empire')),
    chip('🔬', count('research'), 'researched', goSection('empire')),
    chip('💤', c.idleSystems.length, c.idleSystems.length === 1 ? 'idle colony' : 'idle colonies', () => { close(); openColonies(ui, 'Idle'); }),
    chip('🚀', c.idleFleets.length, c.idleFleets.length === 1 ? 'idle fleet' : 'idle fleets', () => { close(); openFleets(ui, 'Idle'); }),
  ].filter((x): x is HTMLButtonElement => x !== null);
  if (chips.length) wrap.append(h('div', { class: 'brief-chips' }, ...chips));
  if (c.research) wrap.append(h('div', { class: 'brief-line bad' }, h('span', { class: 'brief-icon' }, '🔬'), h('span', { class: 'grow' }, 'Nothing is being researched.')));
  if (!items.length) wrap.append(h('div', { class: 'dim', style: 'margin:8px 0' }, 'Nothing new happened since your last turn.'));
  const bySection = new Map<Section, Entry[]>();
  for (const e of items.slice().reverse()) {
    const s = sectionOf(e.kind);
    bySection.set(s, [...(bySection.get(s) ?? []), e]);
  }
  for (const s of ['military', 'diplomacy', 'empire', 'galaxy'] as Section[]) {
    const list = bySection.get(s);
    if (!list?.length) continue;
    wrap.append(h('h3', { 'data-section': s }, SECTION_NAMES[s]));
    for (const e of s === 'empire' ? collapseBuilds(list) : list) wrap.append(lineFor(ui, e, jump));
  }
  wrap.append(h('div', { class: 'dim', style: 'font-size:11px;margin-top:10px' }, `${isTouch() ? 'Tap' : 'Click'} a line to see it on the map.`,
    infoTip(`Your ${factionDef(ui.viewer).short} history is kept in this browser: see History.`)));
  void g;
  return wrap;
}

function historyView(ui: GameUI, a: Archive, page: number, setPage: (p: number) => void, jump: (hex?: number) => void): HTMLElement {
  const wrap = h('div');
  const turns = [...new Set(a.items.map((i) => i.turn))].sort((x, y) => y - x);
  const PER = 8;
  const pages = Math.max(1, Math.ceil(turns.length / PER));
  const shown = turns.slice(page * PER, page * PER + PER);
  if (!turns.length) wrap.append(h('div', { class: 'dim' }, 'Nothing recorded yet.'));
  for (const t of shown) {
    wrap.append(h('h3', null, `Turn ${t}`));
    for (const e of collapseBuilds(a.items.filter((i) => i.turn === t).reverse())) wrap.append(lineFor(ui, e, jump));
  }
  if (pages > 1) {
    wrap.append(h('div', { class: 'row', style: 'margin-top:10px' },
      button('‹ Newer', () => setPage(page - 1), { cls: 'small', disabled: page === 0 }),
      h('span', { class: 'grow dim', style: 'text-align:center' }, `Page ${page + 1} of ${pages}`),
      button('Older ›', () => setPage(page + 1), { cls: 'small', disabled: page >= pages - 1 })));
  }
  return wrap;
}
