/**
 * The visual colony view: the planet drawn by its type and size, with its improvement slots arranged in a
 * ring around it. Built slots show the improvement's icon, slots taken by queued improvements show their
 * progress, empty slots are a "+" that opens a picker, and the slots the next development level would add
 * are shown locked. Icons come from icons.ts, so any can be swapped for artwork.
 */
import { IMPROVEMENTS, PLANET_YIELDS, STAR_YIELDS } from '../data/improvements';
import { checkBuild, productionOf, REPEAT_FALLOFF, slotsOf, systemYield } from '../engine/economy';
import type { PlanetKind, StarKind } from '../engine/types';
import { collapsibleUnavailable } from './collapse';
import { h, modal } from './dom';
import { costText, num } from './format';
import type { GameUI } from './game-ui';
import { iconColor, iconElement } from './icons';
import { setTip } from './tooltip';

/** Surface colours (light, dark) for each planet type. */
const PLANET_COLORS: Record<PlanetKind, [string, string]> = {
  terran: ['#6fb3e8', '#1f5c3a'], ocean: ['#5fa8ff', '#123a7a'], jungle: ['#7bd36a', '#1d4a22'],
  desert: ['#f0c27b', '#8a5a2b'], arctic: ['#eef6ff', '#7d93b5'], barren: ['#b9b2a8', '#4d4842'],
  volcanic: ['#ff7a3d', '#3a1410'], gasGiant: ['#f2c38b', '#8a5130'], asteroidBelt: ['#a59a8c', '#3e3833'],
};
const STAR_GLOW: Record<StarKind, string> = {
  yellow: '#ffd76a', orange: '#ffa64d', red: '#ff6b5a', blue: '#8fb8ff', white: '#f2f5ff', neutron: '#c7e6ff', pulsar: '#c58bff',
};

/** The planet as SVG, `px` across. */
function planetSvg(planet: PlanetKind, star: StarKind, size: number, px: number): string {
  const [light, dark] = PLANET_COLORS[planet];
  const r = 22 + size * 5; // in a 100 box (size 5 reaches 47)
  const id = `pl${Math.random().toString(36).slice(2, 8)}`;
  const glow = STAR_GLOW[star];
  let body: string;
  if (planet === 'asteroidBelt') {
    const rocks = [[50, 50, 9], [32, 40, 6], [68, 42, 7], [40, 64, 5], [62, 63, 6], [26, 56, 4], [76, 55, 4], [52, 30, 4], [50, 72, 4]];
    body = rocks.map(([x, y, s]) => `<ellipse cx="${x}" cy="${y}" rx="${s * 1.2}" ry="${s}" fill="url(#${id}g)" transform="rotate(${(x * 7) % 50} ${x} ${y})"/>`).join('');
  } else {
    body = `<circle cx="50" cy="50" r="${r}" fill="url(#${id}g)"/>`;
    if (planet === 'gasGiant') {
      body += [-.45, -.15, .15, .45].map((k, i) => `<ellipse cx="50" cy="${50 + k * r}" rx="${r * Math.sqrt(1 - k * k)}" ry="${r * 0.09}" fill="${i % 2 ? dark : light}" opacity=".35" clip-path="url(#${id}c)"/>`).join('');
      body += `<ellipse cx="50" cy="50" rx="${r * 1.55}" ry="${r * 0.32}" fill="none" stroke="${light}" stroke-opacity=".45" stroke-width="2" transform="rotate(-18 50 50)"/>`;
    }
    body += surface(planet, r, light, dark, id);
    body += `<circle cx="50" cy="50" r="${r}" fill="url(#${id}s)"/><circle cx="50" cy="50" r="${r + 1.5}" fill="none" stroke="${light}" stroke-opacity=".35" stroke-width="1.5"/>`;
  }
  return `<svg viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true"><defs>
    <radialGradient id="${id}g" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
    <radialGradient id="${id}s" cx="70%" cy="70%" r="75%"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <radialGradient id="${id}h" cx="50%" cy="50%" r="50%"><stop offset=".5" stop-color="${glow}" stop-opacity=".22"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}c"><circle cx="50" cy="50" r="${r}"/></clipPath></defs>
    <circle cx="50" cy="50" r="50" fill="url(#${id}h)"/>${body}</svg>`;
}

/** Surface detail for a planet type (continents, ice caps, craters, lava), clipped to the disc. */
function surface(planet: PlanetKind, r: number, light: string, dark: string, id: string): string {
  const at = (x: number, y: number) => [50 + x * r, 50 + y * r];
  const blob = (x: number, y: number, w: number, hgt: number, rot: number, fill: string, op: number) => {
    const [cx, cy] = at(x, y);
    return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(w * r).toFixed(1)}" ry="${(hgt * r).toFixed(1)}" fill="${fill}" opacity="${op}" transform="rotate(${rot} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
  };
  let out = '';
  switch (planet) {
    case 'terran': out = blob(-.35, -.2, .38, .22, -25, '#3f8a46', .9) + blob(.3, .25, .32, .2, 30, '#3f8a46', .85) + blob(-.1, .55, .2, .1, 0, '#4d9a52', .8)
      + blob(0, -.92, .45, .12, 0, '#f4f8ff', .85) + blob(.15, .1, .5, .05, -10, '#ffffff', .35); break;
    case 'ocean': out = blob(-.3, .1, .14, .08, 20, '#d8c28a', .8) + blob(.35, -.3, .1, .06, -10, '#d8c28a', .7) + blob(0, -.1, .7, .06, -12, '#ffffff', .3) + blob(.1, .4, .6, .05, 8, '#ffffff', .25); break;
    case 'jungle': out = blob(-.25, -.15, .45, .3, -20, '#2f6b2a', .9) + blob(.3, .3, .35, .25, 25, '#2f6b2a', .85) + blob(.1, -.5, .2, .1, 0, '#5fb3e0', .6); break;
    case 'desert': out = blob(-.2, -.25, .55, .08, -8, '#c48a4a', .55) + blob(.1, .15, .6, .07, 5, '#c48a4a', .5) + blob(0, .5, .45, .06, -5, '#b0773c', .5); break;
    case 'arctic': out = blob(0, -.85, .7, .3, 0, '#ffffff', .9) + blob(0, .85, .7, .28, 0, '#ffffff', .85) + blob(-.2, 0, .3, .12, -20, '#9fb6d6', .5); break;
    case 'barren': out = [[-.35, -.2, .16], [.3, .25, .12], [.1, -.45, .09], [-.15, .45, .08], [.45, -.15, .07]].map(([x, y, s]) => {
      const [cx, cy] = at(x, y);
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(s * r).toFixed(1)}" fill="${dark}" opacity=".55"/><circle cx="${(cx - s * r * .2).toFixed(1)}" cy="${(cy - s * r * .2).toFixed(1)}" r="${(s * r * .8).toFixed(1)}" fill="none" stroke="${light}" stroke-opacity=".35" stroke-width=".8"/>`;
    }).join(''); break;
    case 'volcanic': out = `<path d="M${at(-.7, -.2).join(' ')} L${at(-.2, 0).join(' ')} L${at(.1, -.35).join(' ')} L${at(.6, -.1).join(' ')} M${at(-.2, 0).join(' ')} L${at(-.05, .45).join(' ')} L${at(.4, .55).join(' ')}" fill="none" stroke="#ffcf4d" stroke-width="1.6" opacity=".9"/>`
      + blob(.3, .3, .2, .14, 10, '#1a0806', .6) + blob(-.4, .35, .15, .1, -10, '#1a0806', .5); break;
    default: break;
  }
  return out ? `<g clip-path="url(#${id}c)">${out}</g>` : '';
}

type Slot =
  | { kind: 'built'; id: string; copy: number }
  | { kind: 'queued'; id: string; index: number }
  | { kind: 'empty' }
  | { kind: 'locked' };

/** The view for one system; `canBuild` adds the empty "+" slots and the queue's progress. */
export function colonyView(ui: GameUI, hex: number, opts: { inPicker?: boolean } = {}): HTMLElement {
  const g = ui.game;
  const hx = g.map.hexes[hex];
  const sys = hx.system!;
  const mine = hx.owner === ui.viewer;
  const slots: Slot[] = [];
  const seen = new Map<string, number>();
  for (const id of sys.improvements) { const n = (seen.get(id) ?? 0) + 1; seen.set(id, n); slots.push({ kind: 'built', id, copy: n }); }
  sys.queue.forEach((q, index) => { if (q.kind === 'improvement') slots.push({ kind: 'queued', id: q.item, index }); });
  const total = slotsOf(sys);
  if (mine) while (slots.length < total) slots.push({ kind: 'empty' });
  // What the next development level would open up.
  const canGrow = mine && sys.development > 0 && sys.development < 5 && !(PLANET_YIELDS[sys.planet].popCap === 0 && sys.development >= 2);
  if (canGrow) for (let i = 0; i < 2; i++) slots.push({ kind: 'locked' });

  const size = 300, ring = slots.length > 10 ? 124 : 116, tile = slots.length > 12 ? 38 : 44;
  const wrap = h('div', { class: 'colony-view', style: `width:${size}px;height:${size}px` });
  const planet = h('div', { class: 'colony-planet' });
  planet.innerHTML = planetSvg(sys.planet, sys.star, sys.size, 156);
  setTip(planet, `${STAR_YIELDS[sys.star].name}, ${PLANET_YIELDS[sys.planet].name} world, size ${sys.size}.\n${total} improvement slots at this development level.`);
  wrap.append(planet, setTip(h('div', { class: 'colony-count' }, `${sys.improvements.length + slots.filter((s) => s.kind === 'queued').length}/${total} slots`), 'Improvement slots in use (built or being built) out of the slots this development level allows.'));

  const prod = Math.max(0.1, productionOf(g, hex));
  slots.forEach((s, i) => {
    const a = (-90 + (360 * i) / slots.length) * Math.PI / 180;
    const x = size / 2 + ring * Math.cos(a) - tile / 2, y = size / 2 + ring * Math.sin(a) - tile / 2;
    const el = h('button', { class: `colony-slot ${s.kind}`, style: `left:${x}px;top:${y}px;width:${tile}px;height:${tile}px` });
    if (s.kind === 'built' || s.kind === 'queued') {
      const imp = IMPROVEMENTS[s.id];
      el.style.setProperty('--accent-c', iconColor(`imp:${s.id}`));
      el.append(iconElement(`imp:${s.id}`, Math.round(tile * 0.58)));
      if (s.kind === 'built') {
        const falloff = s.copy > 1 && (imp?.yields || imp?.production) ? `\nThis copy yields ${Math.round(Math.pow(REPEAT_FALLOFF, s.copy - 1) * 100)}% (repeats on one world yield less).` : '';
        setTip(el, () => h('div', null, h('b', null, imp?.name ?? s.id), h('div', null, (imp?.text ?? '') + falloff)));
      } else {
        // Queued: progress around the slot, and turns until it is done.
        const q = sys.queue[s.index];
        const ahead = sys.queue.slice(0, s.index + 1).reduce((n, x) => n + x.remaining, 0);
        const turns = Math.ceil(ahead / prod);
        const done = imp ? 1 - q.remaining / Math.max(1, imp.buildPoints) : 0;
        el.style.setProperty('--progress', `${Math.max(0, Math.min(1, done)) * 360}deg`);
        el.append(h('span', { class: 'slot-turns' }, `${turns}t`));
        setTip(el, () => h('div', null, h('b', null, `${imp?.name ?? s.id} (being built)`), h('div', null, imp?.text ?? ''),
          h('div', { class: 'dim' }, `Ready in ${turns} turn${turns > 1 ? 's' : ''}${s.index ? ', after what is ahead of it in the queue' : ''}. Cancel it from the queue below.`)));
      }
    } else if (s.kind === 'empty') {
      el.append(iconElement('ui:add', Math.round(tile * 0.5)));
      if (opts.inPicker) {
        // In the picker the slots only show where things go: the tiles do the building.
        el.tabIndex = -1;
        setTip(el, 'Empty slot. Pick an improvement on the right to build here.');
      } else {
        el.disabled = !ui.myTurn;
        setTip(el, ui.myTurn ? 'Empty slot: click to build an improvement here.' : 'Empty slot.');
        el.addEventListener('click', () => openImprovementPicker(ui, hex));
      }
    } else {
      el.append(iconElement('ui:locked', Math.round(tile * 0.42)));
      el.disabled = true;
      setTip(el, 'Develop this world to the next level to open more slots (Other → Develop to next level).');
    }
    wrap.append(el);
  });
  return wrap;
}

/** The improvement picker: a grid of what can be built here, with the rest collapsed. */
export function openImprovementPicker(ui: GameUI, hex: number): void {
  const body = h('div');
  const m = modal(`Build at ${ui.game.map.hexes[hex].system!.name}`, body, { wide: true });
  const render = () => {
    const g = ui.game;
    const sys = g.map.hexes[hex].system!;
    const stock = g.factions[ui.viewer].stock;
    const prod = Math.max(0.1, productionOf(g, hex));
    const ahead = sys.queue.reduce((n, q) => n + q.remaining, 0);
    const ready: HTMLElement[] = [], blocked: HTMLElement[] = [];
    for (const [id, imp] of Object.entries(IMPROVEMENTS)) {
      const c = checkBuild(g, ui.viewer, hex, 'improvement', id);
      const short = c.ok ? (['metals', 'energy', 'exotics'] as const).filter((k) => stock[k] < imp.cost[k]).map((k) => `${Math.ceil(imp.cost[k] - stock[k])} more ${k}`) : [];
      const ok = c.ok && !short.length && ui.myTurn;
      const turns = c.ok && c.cost.points ? Math.ceil((ahead + c.cost.points) / prod) : 0;
      const copies = sys.improvements.filter((x) => x === id).length + sys.queue.filter((q) => q.kind === 'improvement' && q.item === id).length;
      const tile = h('button', { class: `imp-tile ${ok ? '' : 'off'}`, disabled: !ok, 'data-imp': id, onclick: () => { if (ui.act({ type: 'build', hex, kind: 'improvement', item: id })) m.close(); } },
        h('span', { class: 'imp-tile-icon', style: `--accent-c:${iconColor(`imp:${id}`)}` }, iconElement(`imp:${id}`, 30)),
        h('span', { class: 'imp-tile-name' }, imp.name),
        h('span', { class: `imp-tile-cost ${short.length ? 'bad' : 'dim'}` }, costText(imp.cost), turns ? ` · ${turns}t` : ''));
      const why = !c.ok ? (c as { reason: string }).reason : short.length ? `Needs ${short.join(', ')}.` : '';
      setTip(tile, () => h('div', null, h('b', null, imp.name), why ? h('div', { class: 'bad' }, why) : null, h('div', null, imp.text),
        copies && (imp.yields || imp.production) ? h('div', { class: 'dim' }, `Another one here yields ${Math.round(Math.pow(REPEAT_FALLOFF, copies) * 100)}%.`) : null));
      (c.ok ? ready : blocked).push(tile);
    }
    // The planet on the left: hovering a tile shows it in the first free slot.
    const view = colonyView(ui, hex, { inPicker: true });
    const next = view.querySelector<HTMLElement>('.colony-slot.empty');
    const preview = (id: string | null) => {
      if (!next) return;
      next.replaceChildren(id ? iconElement(`imp:${id}`, Math.round(next.offsetWidth * 0.58) || 24) : iconElement('ui:add', Math.round(next.offsetWidth * 0.5) || 20));
      next.classList.toggle('preview', !!id);
      if (id) next.style.setProperty('--accent-c', iconColor(`imp:${id}`)); else next.style.removeProperty('--accent-c');
    };
    for (const t of [...ready, ...blocked]) {
      const id = t.dataset.imp!;
      t.addEventListener('mouseenter', () => preview(id));
      t.addEventListener('mouseleave', () => preview(null));
      t.addEventListener('focus', () => preview(id));
      t.addEventListener('blur', () => preview(null));
    }
    const tiles = h('div', { class: 'picker-tiles' },
      h('div', { class: 'imp-grid' }, ...ready),
      ...(ready.length ? [] : [h('div', { class: 'dim' }, 'Nothing can be built here right now.')]),
      ...collapsibleUnavailable(blocked, render, 'unavailable', 'imp-grid'));
    body.replaceChildren(h('div', { class: 'picker-layout' }, h('div', { class: 'picker-planet' }, view, yieldChips(systemYield(g, hex),
      [['res:production', num(productionOf(g, hex)), 'Production per turn: how fast this system builds']])), tiles));
  };
  render();
}

/** Yields as icon chips. */
export function yieldChips(y: { energy: number; metals: number; science: number; exotics: number }, extra: [string, string, string][] = []): HTMLElement {
  const chip = (key: string, value: string, tip: string) => setTip(h('span', { class: 'yield-chip' }, iconElement(key, 15), value), tip);
  return h('div', { class: 'yield-row' },
    chip('res:energy', num(y.energy), 'Energy per turn'), chip('res:metals', num(y.metals), 'Metals per turn'),
    chip('res:science', num(y.science), 'Science per turn'), chip('res:exotics', num(y.exotics), 'Exotics per turn'),
    ...extra.map(([k, v, t]) => chip(k, v, t)));
}
