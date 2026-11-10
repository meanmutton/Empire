/**
 * The faction guide: the story of the Meridian Reach and every faction in it, from docs/LORE.md, with the
 * leaders' and envoys' portraits and what each faction does in the game. Opens from the title screen, the
 * in-game Menu (More on phones) and each power's page in Diplomacy.
 */
import { ABILITIES } from '../../data/abilities';
import { FACTIONS, factionDef, MAJOR_IDS, MINOR_IDS } from '../../data/factions';
import { LEADER_TITLES, LEADERS } from '../../data/leaders';
import { AVAILABILITY, PRESETS, VICTORIES } from '../../data/victories';
import type { GameState } from '../../engine/types';
import { presetOf } from '../../engine/victory';
import { clear, h, modal } from '../dom';
import { factionChip } from '../format';
import { rosterStrip } from '../gallery';
import { lore, type LoreBlock, type LoreItem } from '../lore';
import { leaderById, portraitElement } from '../portraits';

const REACH = 'reach';

/** Inline markup: **bold** and *italic*. */
function inline(text: string): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h('b', null, m[1]) : h('i', null, m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function list(items: LoreItem[]): HTMLElement {
  return h('ul', { class: 'guide-ul' }, ...items.map((i) => h('li', null, ...inline(i.text), i.children.length ? list(i.children) : null)));
}

function renderBlocks(bs: LoreBlock[]): HTMLElement[] {
  return bs.map((b) => (b.kind === 'p' ? h('p', null, ...inline(b.text)) : list(b.items)));
}

/** Opens the guide at a faction (or the Reach). In a game, it marks who is in this galaxy and who leads them. */
export function openGuide(focus: string = REACH, game?: GameState): void {
  let current = focus;
  const body = h('div', { class: 'guide-grid' });
  modal('Faction guide', body, { wide: true });
  const inGame = (id: string) => !game || !!game.factions[id];
  const render = () => {
    clear(body);
    // Left: the Reach, the great powers, then the minor factions (in a game: those in this galaxy first).
    const nav = h('div', { class: 'guide-list' });
    const pick = h('select', { class: 'guide-pick', onchange: (e: Event) => { current = (e.target as HTMLSelectElement).value; render(); } });
    const entry = (key: string, label: HTMLElement | string, sub = '') => {
      nav.append(h('button', { class: `btn list-btn small ${key === current ? 'on' : ''}`, onclick: () => { current = key; render(); } },
        h('span', { class: 'row grow', style: 'gap:6px' }, label, sub ? h('span', { class: 'dim', style: 'font-size:11px' }, sub) : '')));
      pick.append(h('option', { value: key, selected: key === current }, key === REACH ? 'The Meridian Reach' : factionDef(key).name));
    };
    const heading = (t: string) => { nav.append(h('div', { class: 'guide-head' }, t)); pick.append(h('option', { disabled: true }, `— ${t} —`)); };
    entry(REACH, h('b', null, 'The Meridian Reach'));
    heading('Great powers');
    for (const id of MAJOR_IDS) entry(id, factionChip(id, true), game && !inGame(id) ? 'not in this galaxy' : '');
    const minors = [...MINOR_IDS].sort((a, b) => factionDef(a).name.localeCompare(factionDef(b).name));
    if (game) {
      heading('Minor factions in this galaxy');
      for (const id of minors.filter(inGame)) entry(id, factionChip(id, true));
      heading('Elsewhere in the Reach');
      for (const id of minors.filter((m) => !inGame(m))) entry(id, factionChip(id, true));
    } else {
      heading('Minor factions');
      for (const id of minors) entry(id, factionChip(id, true));
    }
    const pane = h('div', { class: 'guide-pane' });
    pane.append(...(current === REACH ? reachPane() : factionPane(current, game)));
    body.append(h('div', null, pick, nav), pane);
  };
  render();
}

function reachPane(): HTMLElement[] {
  const out: HTMLElement[] = [h('h2', { class: 'guide-title' }, 'The Meridian Reach'),
    h('div', { class: 'dim' }, 'The year is 4026. Read the great powers and minor factions on the left.')];
  for (const s of lore().reach) {
    if (s.title) out.push(h('h3', null, s.title));
    out.push(...renderBlocks(s.blocks));
  }
  return out;
}

function factionPane(id: string, game?: GameState): HTMLElement[] {
  const def = factionDef(id);
  const l = lore();
  const out: HTMLElement[] = [];
  const status = game ? (game.factions[id] ? (game.factions[id].alive ? 'In this galaxy' : 'In this galaxy (fallen)') : 'Not in this galaxy') : '';
  const head = h('div', { class: 'guide-top' });
  if (def.kind === 'minor') head.append(portraitElement(id, `minor-${id}`, 120, `${def.short} envoy`));
  head.append(h('div', { class: 'grow', style: 'min-width:0' },
    h('h2', { class: 'guide-title', style: `color:${def.color}` }, def.name),
    h('div', { class: 'dim' }, `${def.kind === 'major' ? 'Great power' : `Minor faction · ${def.strength}`} · ${def.government}${status ? ` · ${status}` : ''}`),
    def.kind === 'major' && l.majors[id]?.tagline ? h('div', { style: 'margin-top:4px' }, h('i', null, ...inline(l.majors[id].tagline))) : null,
    h('div', { style: 'margin-top:4px' }, def.text)));
  out.push(head);

  if (def.kind === 'major') {
    const m = l.majors[id];
    out.push(...(m?.paragraphs ?? []).map((p) => h('p', null, ...inline(p))));
    if (m?.appearance) out.push(h('p', null, h('b', null, 'Appearance: '), ...inline(m.appearance)));
    out.push(h('h3', null, LEADER_TITLES[id] === 'Instance' ? 'Speaking instances' : `Leaders (title: ${LEADER_TITLES[id]})`));
    const leading = game?.factions[id]?.leader;
    for (const leader of LEADERS[id] ?? []) {
      const info = leaderById(id, leader.id);
      out.push(h('div', { class: `card guide-leader ${leading === leader.id ? 'on' : ''}` },
        portraitElement(id, info.portrait, 84, info.full),
        h('div', { class: 'grow', style: 'min-width:0' },
          h('div', { class: 'row' }, h('b', null, info.full), h('span', { class: 'grow' }), leading === leader.id ? h('span', { class: 'good', style: 'font-size:12px' }, 'leads in this game') : ''),
          h('div', { style: 'margin-top:3px' }, ...inline(m?.leaders[leader.name] ?? leader.text)))));
    }
    if (m?.views.length) {
      out.push(h('h3', null, 'How they see the others'));
      out.push(h('div', { class: 'kv' }, ...m.views.flatMap(([who, view]) => {
        const other = FACTIONS.find((f) => f.kind === 'major' && (f.short === who || f.name === who));
        return [h('span', { class: 'k', style: other ? `color:${other.color}` : '' }, who), h('span', null, ...inline(view))];
      })));
    }
  } else {
    out.push(h('p', null, ...inline(l.minors[id] ?? '')));
  }

  // What they do in the game.
  out.push(h('h3', null, 'In the game'));
  for (const a of def.abilities) out.push(h('div', { style: 'margin:3px 0' }, h('b', null, ABILITIES[a].name), ': ', h('span', { class: 'dim' }, ABILITIES[a].text)));
  if (def.kind === 'major') {
    const preset = game ? presetOf(game) : 'classic';
    const paths = [...new Set([...AVAILABILITY[id], ...(PRESETS[preset].extra?.[id] ?? [])])].filter((v) => PRESETS[preset].victories.includes(v));
    out.push(h('div', { style: 'margin-top:4px' }, h('b', null, `Ways to win${game ? ' in this game' : ''}: `),
      ...paths.map((v, i) => h('span', { title: VICTORIES[v].text, style: VICTORIES[v].unique ? 'color:var(--accent)' : '' }, `${i ? ', ' : ''}${VICTORIES[v].name}${VICTORIES[v].unique ? ' ★' : ''}`))));
  } else {
    out.push(h('div', { class: 'dim', style: 'margin-top:4px;font-size:12px' }, 'Minor factions never expand far from home, are always played by the computer, and can become a great power’s vassal.'));
  }
  out.push(h('div', { style: 'margin-top:8px' }, h('b', null, 'Ships')), rosterStrip(id, 34));
  return out;
}
