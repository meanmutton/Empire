/** Title and new-game setup screen. */
import { DEFAULT_COMBAT_ROUNDS, MAX_COMBAT_ROUNDS, MIN_COMBAT_ROUNDS } from '../../data/doctrines';
import { ABILITIES } from '../../data/abilities';
import { factionDef } from '../../data/factions';
import { AVAILABILITY, DEFAULT_TURN_LIMIT, PRESETS, VICTORIES, type PresetId } from '../../data/victories';
import { MAP_SIZES, type NewGameOptions } from '../../engine/setup';
import { VERSION } from '../../version';
import { button, clear, h } from '../dom';
import { rosterStrip } from '../gallery';
import { injectStyles } from '../styles';
import { LEADER_TITLES, LEADERS, SELF_LEADER } from '../../data/leaders';
import { leaderById, portraitElement } from '../portraits';
import { openHelp } from './help';
import { openOptions } from './options';
import { openGuide } from './guide';

export interface SetupChoice extends NewGameOptions {
  online: boolean;
  /** Online: hours before others may play a caretaker turn for a silent player (0 = never). */
  timeoutHours: number;
}

export interface TitleActions {
  start(choice: SetupChoice): void;
  /** Saved local games to offer, newest first. */
  saves(): { id: string; label: string }[];
  load(id: string): void;
  deleteSave(id: string): void;
  /** Join an online game by code (phase 16). */
  join?(code: string, name: string): void;
  /** Online games this browser has joined. */
  onlineGames?(): { code: string; label: string }[];
  resumeOnline?(code: string): void;
}

export function showTitle(root: HTMLElement, actions: TitleActions): void {
  injectStyles();
  const screen = h('div', { class: 'screen' });
  clear(root).append(screen);
  const seats: { faction: string; name: string; leader?: string }[] = [{ faction: 'concord', name: 'Player 1' }];
  let size: keyof typeof MAP_SIZES = 'standard';
  let seed = randomSeed();
  let turnLimit = String(DEFAULT_TURN_LIMIT);
  let online = false;
  let timeoutHours = '24';
  let preset: PresetId = 'classic';
  let combatRounds = DEFAULT_COMBAT_ROUNDS;
  const majors = () => PRESETS[preset].majors;

  const render = () => {
    clear(screen);
    screen.append(h('div', { class: 'title' }, 'EMPIRE'), h('div', { class: 'subtitle' }, `A game of galactic conquest · v${VERSION} · `,
      h('a', { href: '#', style: 'color:var(--accent)', onclick: (e: Event) => { e.preventDefault(); openHelp(); } }, 'How to play'), ' · ',
      h('a', { href: '#', style: 'color:var(--accent)', onclick: (e: Event) => { e.preventDefault(); openGuide(); } }, 'Faction guide'), ' · ',
      h('a', { href: '#', style: 'color:var(--accent)', onclick: (e: Event) => { e.preventDefault(); openOptions(render); } }, 'Options')));
    const cols = h('div', { class: 'setup-cols' });
    const left = h('div');
    const saves = actions.saves();
    const onlineGames = actions.onlineGames?.() ?? [];
    if (saves.length || onlineGames.length) {
      left.append(h('h3', null, 'Continue'));
      for (const s of saves) left.append(h('div', { class: 'row' }, button(s.label, () => actions.load(s.id), { cls: 'list-btn grow' }),
        button('✕', () => { if (confirm('Delete this saved game?')) { actions.deleteSave(s.id); render(); } }, { cls: 'small ghost' })));
      for (const o of onlineGames) left.append(button(`Online ${o.code}: ${o.label}`, () => actions.resumeOnline?.(o.code), { cls: 'list-btn' }));
    }
    if (actions.join) {
      left.append(h('h3', null, 'Join an online game'));
      const code = h('input', { placeholder: 'Game code', maxlength: '6', value: new URLSearchParams(location.search).get('join') ?? '', style: 'width:110px;text-transform:uppercase' });
      const name = h('input', { placeholder: 'Your name', value: localStorageGet('empire.name') ?? '' , style: 'width:140px' });
      left.append(h('div', { class: 'row' }, code, name, button('Join', () => {
        localStorageSet('empire.name', name.value);
        actions.join!(code.value.trim().toUpperCase(), name.value.trim() || 'Player');
      }, { cls: 'primary' })));
    }
    left.append(h('h3', null, 'New game'));
    if (actions.join) {
      left.append(h('div', { class: 'row' },
        button('On this device', () => { online = false; render(); }, { cls: `small ${!online ? 'on primary' : ''}` }),
        button('Online (async)', () => { online = true; seats.splice(1); render(); }, { cls: `small ${online ? 'on primary' : ''}` })));
      left.append(h('div', { class: 'dim', style: 'margin:4px 0 8px' }, online
        ? 'You host. Others join with the game code and pick a free empire. Turns are taken one after another; nobody has to be online at the same time.'
        : 'Up to five players share this device and take turns (hot seat). The computer plays everyone else.'));
    }
    seats.forEach((s, i) => {
      const taken = new Set(seats.filter((_, j) => j !== i).map((x) => x.faction));
      const sel = h('select', { onchange: (e: Event) => { s.faction = (e.target as HTMLSelectElement).value; s.leader = undefined; render(); } },
        ...majors().filter((m) => !taken.has(m)).map((m) => h('option', { value: m, selected: m === s.faction }, factionDef(m).name)));
      // Who leads: one of the power's three leaders, the player themselves, or (by default) whoever the seed picks.
      const leader = h('select', { title: 'Your leader', onchange: (e: Event) => { s.leader = (e.target as HTMLSelectElement).value || undefined; render(); } },
        h('option', { value: '', selected: !s.leader }, 'Random leader'),
        ...(LEADERS[s.faction] ?? []).map((l) => h('option', { value: l.id, selected: s.leader === l.id }, `${LEADER_TITLES[s.faction]} ${l.name}`)),
        h('option', { value: SELF_LEADER, selected: s.leader === SELF_LEADER }, 'Lead as yourself'));
      const name = h('input', { value: s.name, style: 'width:120px', oninput: (e: Event) => { s.name = (e.target as HTMLInputElement).value; } });
      left.append(h('div', { class: 'row wrap', style: 'margin:4px 0' }, name, sel, leader,
        seats.length > 1 ? button('✕', () => { seats.splice(i, 1); render(); }, { cls: 'small ghost' }) : null));
    });
    if (!online && seats.length < majors().length) {
      left.append(button('+ Add player', () => {
        const free = majors().find((m) => !seats.some((x) => x.faction === m))!;
        seats.push({ faction: free, name: `Player ${seats.length + 1}` });
        render();
      }, { cls: 'small' }));
    }
    const sizeSel = h('select', { onchange: (e: Event) => { size = (e.target as HTMLSelectElement).value as typeof size; } },
      ...Object.entries(MAP_SIZES).map(([k, v]) => h('option', { value: k, selected: k === size }, `${k[0].toUpperCase() + k.slice(1)} (${v.width}×${v.height})`)));
    const seedIn = h('input', {
      value: seed, style: 'width:120px', placeholder: 'random',
      title: 'Any word or number. The same seed with the same settings makes the same galaxy (map, minor factions and starting luck), so you can replay a map or share one with friends. Leave it blank for a new random galaxy.',
      oninput: (e: Event) => { seed = (e.target as HTMLInputElement).value; },
    });
    const limit = h('input', { value: turnLimit, placeholder: 'none', style: 'width:70px', oninput: (e: Event) => { turnLimit = (e.target as HTMLInputElement).value; } });
    left.append(h('h3', null, 'Galaxy'), h('div', { class: 'kv' },
      h('span', { class: 'k' }, 'Map size'), sizeSel,
      h('span', { class: 'k', title: 'The same seed makes the same galaxy' }, 'Galaxy seed'), seedIn,
      h('span', { class: 'k' }, 'Turn limit'), limit,
      h('span', { class: 'k' }, 'Combat rounds per battle'), h('select', {
        title: 'How long each battle lasts. More rounds: bloodier battles, since fleets that fight to the end keep fighting.',
        onchange: (e: Event) => { combatRounds = Number((e.target as HTMLSelectElement).value); },
      }, ...Array.from({ length: MAX_COMBAT_ROUNDS - MIN_COMBAT_ROUNDS + 1 }, (_, i) => MIN_COMBAT_ROUNDS + i).map((n) =>
        h('option', { value: String(n), selected: n === combatRounds }, `${n}${n === DEFAULT_COMBAT_ROUNDS ? ' (standard)' : n === MIN_COMBAT_ROUNDS ? ' (skirmishes)' : n === MAX_COMBAT_ROUNDS ? ' (brutal)' : ''}`))),
      online ? h('span', { class: 'k' }, 'Turn timeout (hours)') : null,
      online ? h('input', { value: timeoutHours, style: 'width:70px', title: 'After this long, another player may let the computer play a caretaker turn. 0 = never.', oninput: (e: Event) => { timeoutHours = (e.target as HTMLInputElement).value; } }) : null));
    left.append(h('h3', null, 'Game type'), h('div', { class: 'row wrap' }, ...(Object.keys(PRESETS) as PresetId[]).map((k) =>
      button(PRESETS[k].name, () => {
        preset = k;
        // Peaceful games leave the Ryn'kai out: move anyone who picked them.
        for (const s of seats) if (!majors().includes(s.faction)) s.faction = majors().find((m) => !seats.some((x) => x.faction === m))!;
        render();
      }, { cls: `small ${preset === k ? 'on primary' : ''}` }))),
      h('div', { class: 'dim', style: 'margin-top:4px' }, PRESETS[preset].text, ' Each great power can only win in the ways listed on its card.'));
    left.append(h('div', { style: 'margin-top:16px' }, button(online ? 'Create online game' : 'Start game', () => {
      actions.start({
        seed: seed || randomSeed(), seats: seats.map((s, i) => ({ ...s, name: s.name.trim() || `Player ${i + 1}` })),
        ...MAP_SIZES[size], turnLimit: turnLimit ? Math.max(10, Number(turnLimit)) : null, preset, online, combatRounds,
        timeoutHours: Math.max(0, Number(timeoutHours) || 0),
      });
    }, { cls: 'primary' })));

    const right = h('div', null, h('h3', null, 'The great powers'));
    for (const id of majors()) {
      const d = factionDef(id);
      const picked = seats.find((s) => s.faction === id);
      const paths = [...new Set([...AVAILABILITY[id], ...(PRESETS[preset].extra?.[id] ?? [])])].filter((v) => PRESETS[preset].victories.includes(v));
      right.append(h('div', { class: `faction-card ${picked ? 'taken' : ''}` },
        h('div', { class: 'row' }, h('b', { style: `color:${d.color};font-size:15px` }, d.name), h('span', { class: 'grow' }),
          picked ? h('span', { class: 'good' }, picked.name) : h('span', { class: 'dim' }, 'computer'),
          button('Lore ›', () => openGuide(id), { cls: 'small ghost', title: `The story of the ${d.short}, their leaders and how they see the others` })),
        h('div', { class: 'dim' }, `${d.species} · ${d.government}${d.inspiration ? ` · inspired by ${d.inspiration}` : ''}`),
        h('div', null, d.text),
        leaderStrip(id, picked, render),
        ...d.abilities.map((a) => h('div', { style: 'margin-top:3px' }, h('b', null, ABILITIES[a].name), ': ', h('span', { class: 'dim' }, ABILITIES[a].text))),
        h('div', { style: 'margin-top:4px' }, h('b', null, 'Ways to win: '),
          ...paths.map((v, i) => h('span', { title: VICTORIES[v].text, style: VICTORIES[v].unique ? 'color:var(--accent)' : '' }, `${i ? ', ' : ''}${VICTORIES[v].name}${VICTORIES[v].unique ? ' ★' : ''}`))),
        id === 'rynkai' ? h('div', { class: 'good', style: 'font-size:12px' }, 'Good for new players: a straightforward warrior empire.') : null,
        rosterStrip(id, 34)));
    }
    right.append(h('div', { class: 'dim' }, 'Ten of thirty minor factions join every game, always played by the computer.'));
    cols.append(left, right);
    screen.append(cols);
  };
  render();
}

/** A power's three leaders with their portraits; a player's pick is highlighted, and clicking one picks it. */
function leaderStrip(faction: string, seat: { leader?: string } | undefined, rerender: () => void): HTMLElement {
  const strip = h('div', { class: 'leader-strip' });
  for (const l of LEADERS[faction] ?? []) {
    const info = leaderById(faction, l.id);
    const on = seat?.leader === l.id;
    const item = h('div', { class: `leader-pick ${on ? 'on' : ''} ${seat ? 'can' : ''}`, title: `${info.full}: ${l.text}` },
      portraitElement(faction, info.portrait, 52, info.full), h('div', { class: 'leader-name' }, l.name));
    if (seat) item.addEventListener('click', () => { seat.leader = on ? undefined : l.id; rerender(); });
    strip.append(item);
  }
  return strip;
}

export function randomSeed(): string {
  const words = ['Orion', 'Lyra', 'Draco', 'Vela', 'Carina', 'Cygnus', 'Hydra', 'Aquila', 'Lupus', 'Pavo', 'Corvus', 'Fornax'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function localStorageGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localStorageSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}
