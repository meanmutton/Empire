/**
 * Faction crests: the detailed emblems, for where there is room (the faction guide, setup cards, Diplomacy, and
 * in place of a missing portrait). Great powers each have their own crest drawn from their lore; minor
 * factions carry their glyph on a round seal. Drawn as SVG in a 64×64 box, in shades of the faction colour.
 */
import { factionDef } from '../data/factions';
import { glyphColor, glyphPath, polygon, star } from './glyphs';

const INK = '#05070d';

function rgb(color: string): [number, number, number] {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color);
  if (m) return [+m[1], +m[2], +m[3]];
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes a colour toward another by t (0..1). */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

interface Tones { main: string; dark: string; deep: string; light: string; bright: string }

function tones(color: string): Tones {
  const main = glyphColor(color);
  return { main, dark: mix(color, '#070b16', 0.72), deep: mix(color, '#070b16', 0.86), light: mix(main, '#ffffff', 0.35), bright: mix(main, '#ffffff', 0.65) };
}

/** A path in the 20×20 glyph box, placed in the crest at (x, y) with the given width. */
function glyphAt(d: string, x: number, y: number, w: number, fill: string, outline = 1.6): string {
  const k = w / 20;
  return `<g transform="translate(${x} ${y}) scale(${k})"><path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${INK}" stroke-width="${outline / k}" stroke-linejoin="round" paint-order="stroke"/></g>`;
}

const dot = (x: number, y: number, r: number, fill: string) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${fill}"/>`;

function around(n: number, r: number, fn: (x: number, y: number, i: number) => string, rot = -90): string {
  return [...Array(n)].map((_, i) => { const a = ((rot + (360 * i) / n) * Math.PI) / 180; return fn(32 + r * Math.cos(a), 32 + r * Math.sin(a), i); }).join('');
}


const MAJOR: Record<string, (t: Tones) => string> = {
  // The Long Table: a round seal with a seat for every citizen, around the pathfinder's star.
  concord: (t) => `
    <circle cx="32" cy="32" r="30" fill="${t.dark}" stroke="${t.main}" stroke-width="2"/>
    <circle cx="32" cy="32" r="22.5" fill="${t.deep}" stroke="${t.light}" stroke-width="1" stroke-opacity=".7"/>
    ${around(12, 26.3, (x, y) => dot(x, y, 1.9, t.light))}
    ${glyphAt(star(4, 9.5, 3.2), 13, 13, 38, t.bright)}
    ${glyphAt(star(4, 6, 1.8, -45), 21, 21, 22, t.main, 1.2)}`,
  // A crested war-shield: the Ledger's crossed blades under the four eyes of the Ryn'kai.
  rynkai: (t) => `
    <path d="M32 2 L37.5 9 L44 3.5 L45 12.5 L56 16 V33 C56 47 45 57 32 62 C19 57 8 47 8 33 V16 L19 12.5 L20 3.5 L26.5 9 Z" fill="${t.dark}" stroke="${t.main}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M14 20 L32 15 L50 20 V33 C50 44 42 51 32 55 C22 51 14 44 14 33 Z" fill="${t.deep}" stroke="${t.light}" stroke-opacity=".6" stroke-width="1"/>
    ${glyphAt(glyphPath('rynkai'), 16, 22, 32, t.bright)}
    ${dot(26.5, 21.5, 1.9, '#ffbf5a')}${dot(37.5, 21.5, 1.9, '#ffbf5a')}${dot(28.8, 17.6, 1.2, '#ffbf5a')}${dot(35.2, 17.6, 1.2, '#ffbf5a')}`,
  // The frill and wedge of the Ascendancy, around the cold sun of Varrhos, dimmed since the Quieting.
  varrhen: (t) => `
    ${[...Array(7)].map((_, i) => { const a = (-165 + i * 25) * Math.PI / 180, b = a - 0.13, c = a + 0.13; return `<path d="M32 30 L${(32 + 30 * Math.cos(b)).toFixed(1)} ${(30 + 30 * Math.sin(b)).toFixed(1)} L${(32 + 31 * Math.cos(a)).toFixed(1)} ${(30 + 31 * Math.sin(a)).toFixed(1)} L${(32 + 30 * Math.cos(c)).toFixed(1)} ${(30 + 30 * Math.sin(c)).toFixed(1)} Z" fill="${t.main}" fill-opacity=".75" stroke="${INK}" stroke-width="1"/>`; }).join('')}
    <path d="M6 20 H58 L32 62 Z" fill="${t.dark}" stroke="${t.main}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M14 24 H50 L32 53 Z" fill="${t.deep}" stroke="${t.light}" stroke-opacity=".6" stroke-width="1"/>
    <circle cx="32" cy="33" r="8.5" fill="${t.bright}" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="35.5" cy="31" r="7" fill="${t.deep}" fill-opacity=".85"/>`,
  // Krasnograd, half day and half night, with the twilight band its people share; a moon's orbit passes behind it
  // and comes round in front.
  krasnyr: (t) => `
    <path d="${polygon(8, 30.5, -67.5, 32, 32)}" fill="${t.dark}" stroke="${t.main}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6 32 A26 9 0 0 1 58 32" fill="none" stroke="${t.light}" stroke-opacity=".5" stroke-width="1.2" transform="rotate(-24 32 32)"/>
    <circle cx="32" cy="32" r="15" fill="${t.deep}" stroke="${INK}" stroke-width="1.4"/>
    <path d="M32 17 A15 15 0 0 0 32 47 Z" fill="${t.bright}"/>
    <path d="M32 17 C35.5 24 35.5 40 32 47 C28.5 40 28.5 24 32 17 Z" fill="${t.main}"/>
    <circle cx="32" cy="32" r="15" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M6 32 A26 9 0 0 0 58 32" fill="none" stroke="${INK}" stroke-opacity=".7" stroke-width="3" transform="rotate(-24 32 32)"/>
    <path d="M6 32 A26 9 0 0 0 58 32" fill="none" stroke="${t.light}" stroke-width="1.4" transform="rotate(-24 32 32)"/>
    <circle cx="52.5" cy="29.2" r="2.6" fill="${t.bright}" stroke="${INK}" stroke-width="1"/>`,
  // The network: nodes and links in a hexagon, the consensus at the centre.
  lattice: (t) => {
    const pts = [...Array(6)].map((_, i) => { const a = ((i * 60 - 90) * Math.PI) / 180; return [32 + 18 * Math.cos(a), 32 + 18 * Math.sin(a)]; });
    const links = pts.map(([x, y], i) => { const [x2, y2] = pts[(i + 1) % 6]; const [x3, y3] = pts[(i + 2) % 6];
      return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="32" y2="32"/><line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x3.toFixed(1)}" y2="${y3.toFixed(1)}" stroke-opacity=".35"/>`; }).join('');
    return `
    <path d="${polygon(6, 30.5, -90, 32, 32)}" fill="${t.dark}" stroke="${t.main}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${polygon(6, 24, -90, 32, 32)}" fill="${t.deep}" stroke="${t.light}" stroke-opacity=".5" stroke-width="1"/>
    <g stroke="${t.light}" stroke-width="1.1" stroke-opacity=".8">${links}</g>
    ${pts.map(([x, y]) => dot(x, y, 2.6, t.light)).join('')}
    <circle cx="32" cy="32" r="5" fill="#f4f0ff" stroke="${INK}" stroke-width="1.2"/>`;
  },
};

/** A minor faction's seal: its glyph inside a double ring. */
function seal(id: string, t: Tones): string {
  return `
    <circle cx="32" cy="32" r="30" fill="${t.dark}" stroke="${t.main}" stroke-width="2"/>
    <circle cx="32" cy="32" r="25.5" fill="${t.deep}" stroke="${t.light}" stroke-opacity=".55" stroke-width="1"/>
    ${around(4, 27.8, (x, y) => dot(x, y, 1.3, t.light), -90)}
    ${glyphAt(glyphPath(id), 15, 15, 34, t.bright)}`;
}

const cache = new Map<string, string>();

/** The crest as SVG markup (no size attributes). */
export function crestSvg(faction: string): string {
  let s = cache.get(faction);
  if (!s) {
    const def = factionDef(faction);
    const t = tones(def.color);
    s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${(MAJOR[faction] ?? ((x: Tones) => seal(faction, x)))(t)}</svg>`;
    cache.set(faction, s);
  }
  return s;
}

/** The crest as an element, `px` across. */
export function crestElement(faction: string, px: number, title = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = 'crest';
  el.style.width = el.style.height = `${px}px`;
  if (title) el.title = title;
  el.setAttribute('aria-hidden', title ? 'false' : 'true');
  el.innerHTML = crestSvg(faction);
  return el;
}

const images = new Map<string, HTMLImageElement>();

/**
 * The crest as an image for canvas drawing (the zoomed-out map). Null until it has loaded; `onLoad` runs once
 * it has, so the map can redraw.
 */
export function crestImage(faction: string, onLoad?: () => void): HTMLImageElement | null {
  let img = images.get(faction);
  if (!img) {
    img = new Image();
    img.onload = () => onLoad?.();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(crestSvg(faction))}`;
    images.set(faction, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
