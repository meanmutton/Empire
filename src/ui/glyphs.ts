/**
 * Faction glyphs: a small mark per faction, so factions are told apart by shape as well as colour (on the
 * map's home systems and territory names, and in every faction chip). Each glyph is one SVG path in a
 * 20×20 box (filled even-odd), drawn on canvas through Path2D and in the page as inline SVG. Each is drawn
 * from the faction's lore (docs/LORE.md); the detailed crests in crests.ts are built around them.
 */

const C = 10;
const f2 = (n: number) => n.toFixed(2);

export function polygon(n: number, r: number, rot = -90, cx = C, cy = C): string {
  const pts = [...Array(n)].map((_, i) => {
    const a = ((rot + (360 * i) / n) * Math.PI) / 180;
    return `${f2(cx + r * Math.cos(a))} ${f2(cy + r * Math.sin(a))}`;
  });
  return `M${pts.join(' L')} Z`;
}

export function star(n: number, r1: number, r2: number, rot = -90, cx = C, cy = C): string {
  const pts = [...Array(n * 2)].map((_, i) => {
    const r = i % 2 ? r2 : r1, a = ((rot + (180 * i) / n) * Math.PI) / 180;
    return `${f2(cx + r * Math.cos(a))} ${f2(cy + r * Math.sin(a))}`;
  });
  return `M${pts.join(' L')} Z`;
}

export function circle(r: number, cx = C, cy = C): string {
  return `M${f2(cx - r)} ${f2(cy)} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

/** n small triangles around the centre, from radius r1 (base) to r2 (tip): rays pointing out or, r2 < r1, in. */
function rays(n: number, r1: number, r2: number, half: number, rot = -90, cx = C, cy = C, span = 360): string {
  return [...Array(n)].map((_, i) => {
    const a = rot + (span === 360 ? (360 * i) / n : (span * i) / (n - 1));
    const p = (r: number, d: number) => { const t = ((a + d) * Math.PI) / 180; return `${f2(cx + r * Math.cos(t))} ${f2(cy + r * Math.sin(t))}`; };
    return `M${p(r1, -half)} L${p(r2, 0)} L${p(r1, half)} Z`;
  }).join(' ');
}

/** A gear: n flat teeth between radii r1 and r2. */
function gear(n: number, r1: number, r2: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (360 * i) / n - 90, w = 360 / n;
    for (const [r, d] of [[r2, -w * 0.18], [r1, -w * 0.12], [r1, w * 0.12], [r2, w * 0.18]] as const) {
      const t = ((a + d) * Math.PI) / 180;
      pts.push(`${f2(C + r * Math.cos(t))} ${f2(C + r * Math.sin(t))}`);
    }
    const t = ((a + w / 2) * Math.PI) / 180;
    pts.push(`${f2(C + r2 * Math.cos(t))} ${f2(C + r2 * Math.sin(t))}`);
  }
  return `M${pts.join(' L')} Z`;
}

const SHIELD = 'M10 1 L18 4 V10 C18 15 14 18 10 19 C6 18 2 15 2 10 V4 Z';

export const GLYPHS: Record<string, string> = {
  // Great powers
  /** The pathfinder's star: four points, for the Concord's charts. */
  concord: star(4, 9.5, 3.2),
  /** Crossed blades of the Ledger's sworn clans. */
  rynkai: 'M3 5 L5 3 L10 8 L15 3 L17 5 L12 10 L17 15 L15 17 L10 12 L5 17 L3 15 L8 10 Z',
  /** The Varrhen wedge around their dimmed sun. */
  varrhen: `${polygon(3, 9.5, -90, 10, 11)} ${circle(3, 10, 12.3)}`,
  /** Krasnograd: a tidally locked world, half in light and half in night. */
  krasnyr: `${circle(9)} ${circle(7)} M10 3 A7 7 0 0 0 10 17 Z`,
  /** A node in the network. */
  lattice: `${polygon(6, 9.5)} ${polygon(6, 6.5)} ${circle(2.6)}`,

  // Minor factions
  myrr: 'M3 10 A7 7 0 0 1 17 10 Z M4.8 11 H7 V16 H4.8 Z M8.9 11 H11.1 V19 H8.9 Z M13 11 H15.2 V16 H13 Z',
  quorr: `${circle(8.5)} ${circle(5, 11.4, 11.2)} ${circle(2.2, 12.2, 12)}`,
  thessic: `${circle(9)} M7.2 7.2 H12.8 V12.8 H7.2 Z`,
  ghaltar: 'M2 2.5 C13 1 19.5 8 17.3 18.8 C14.3 12.8 10 10.3 2 10 Z',
  ixxi: `${polygon(6, 4.3, 0, 10, 5)} ${polygon(6, 4.3, 0, 5.7, 12.6)} ${polygon(6, 4.3, 0, 14.3, 12.6)}`,
  celestine: 'M8 1.5 H12 L11 8 L18.5 7 V13 L11 12 L12 18.5 H8 L9 12 L1.5 13 V7 L9 8 Z',
  voidborn: 'M9 2 V15.5 H2.5 Z M11 4 L17.5 15.5 H11 Z M2 17 H18 V19 H2 Z',
  aurelian: `${circle(3.4)} ${[...Array(8)].map((_, i) => { const a = (i * 45 - 90) * Math.PI / 180; return circle(1.7, 10 + 7.3 * Math.cos(a), 10 + 7.3 * Math.sin(a)); }).join(' ')}`,
  korrigan: 'M1 7 C5.5 1 14.5 1 19 7 L16.8 9.2 C13 5.6 7 5.6 3.2 9.2 Z M8.5 4.5 H11.5 V19 H8.5 Z',
  /** A leaf with its stem, midrib and veins. */
  sylph: 'M11 1 C15.2 4.6 17.2 8.4 16.6 11.8 C16 14.6 13.4 16 10.4 16 C7.4 16 4.4 14.6 3.8 11.8 C3.2 8.6 6 4.6 11 1 Z '
    + 'M9.6 16 H11.2 L10.6 19.6 H9.2 Z M10.9 3.6 L11.1 14.6 H9.9 Z M9.6 10.6 L5.6 7.8 L6.1 7.1 L9.6 9.6 Z '
    + 'M11.6 9.8 L15.2 7 L15.6 7.7 L11.6 10.8 Z M9.6 13.5 L5.4 11.2 L5.8 10.5 L9.6 12.5 Z M11.6 12.7 L15.4 10.4 L15.7 11.1 L11.6 13.7 Z',
  nhar: `M1 10 C5 3.5 15 3.5 19 10 C15 16.5 5 16.5 1 10 Z ${circle(3.6)} ${circle(1.6)}`,
  brakk: 'M1.5 2.5 C2 9 6 12 10 12 C14 12 18 9 18.5 2.5 C16.5 7.5 13.5 9 10 9 C6.5 9 3.5 7.5 1.5 2.5 Z M6.5 13 H13.5 L10 18.5 Z',
  ophidian: `M10 1.5 C15.5 1.5 17.5 7 16.5 11 C15.5 15 12.5 16 11.2 18.5 H8.8 C7.5 16 4.5 15 3.5 11 C2.5 7 4.5 1.5 10 1.5 Z ${circle(1.3, 7.8, 7.5)} ${circle(1.3, 12.2, 7.5)}`,
  lumen: star(8, 9.5, 3.4),
  cryx: 'M14 2.5 A8.5 8.5 0 1 0 14 17.5 A8 8 0 0 1 14 2.5 Z',
  taurine: `${circle(4.8, 10, 12.5)} ${circle(2.4, 10, 12.5)} M1.5 3 C2 8 4.5 9.8 7.2 9.5 L6.6 7.4 C4.6 7.4 3 6 1.5 3 Z M18.5 3 C18 8 15.5 9.8 12.8 9.5 L13.4 7.4 C15.4 7.4 17 6 18.5 3 Z`,
  echo: 'M4.5 1.5 H7.8 V10 C7.8 12.4 12.2 12.4 12.2 10 V1.5 H15.5 V10 C15.5 13 13.6 14.6 11.6 15.1 V19 H8.4 V15.1 C6.4 14.6 4.5 13 4.5 10 Z',
  vesh: `M3.5 15 A6.5 6.5 0 0 1 16.5 15 Z M1 16.4 H19 V18.2 H1 Z ${rays(5, 7.8, 9.6, 7, -170, 10, 15, 160)}`,
  haldane: 'M1.5 3.5 L9 10 L1.5 16.5 H5.2 L12.5 10 L5.2 3.5 Z M8 3.5 L15.5 10 L8 16.5 H11.7 L19 10 L11.7 3.5 Z',
  grendis: `${SHIELD} M3 7 H17 V8.8 H3 Z M3.5 11.6 H16.5 V13.4 H3.5 Z`,
  pelagic: 'M2.5 2 L4.8 5 V9.5 H8.9 V5 L10 1 L11.1 5 V9.5 H15.2 V5 L17.5 2 V10 C17.5 11.3 16.5 12.2 15.2 12.2 H11.1 V19 H8.9 V12.2 H4.8 C3.5 12.2 2.5 11.3 2.5 10 Z',
  zenith: `${circle(9.5)} ${circle(6.6)} ${circle(3.8)} ${circle(1.4)}`,
  morrow: `M1.5 10.5 C1.5 3.5 18.5 3.5 18.5 10.5 Z M8.4 10.5 H11.6 V17.5 C11.6 18.8 8.4 18.8 8.4 17.5 Z ${circle(1.3, 6.5, 7.6)} ${circle(1.3, 12.8, 6.6)} ${circle(0.9, 10, 8.6)}`,
  kethran: 'M10 1 L15.5 6 L13.2 19 H6.8 L4.5 6 Z M10 3.2 L10.9 6.3 L10 16.5 L9.1 6.3 Z',
  skarn: 'M1 2 H4.4 L8.8 18 H5.4 Z M6 2 H9.4 L13.8 18 H10.4 Z M11 2 H14.4 L18.8 18 H15.4 Z',
  ilyrian: 'M1.8 14.5 L2.8 4.5 L7 9.5 L10 2.5 L13 9.5 L17.2 4.5 L18.2 14.5 Z M1.8 16 H18.2 V18.4 H1.8 Z',
  forgeborn: 'M1.5 4.5 H14 C14 7.5 17 7.5 18.5 6.5 V8.8 C16.5 10.8 13.5 11 12 11 V13 H15.5 V17.5 H4.5 V13 H8 V11 C5 11 2.5 9 1.5 6.8 Z',
  tal: `${circle(5.6, 6.6, 10)} ${circle(3.5, 6.6, 10)} ${circle(5.6, 13.4, 10)} ${circle(3.5, 13.4, 10)}`,
  hollowsun: `${circle(9.5)} ${circle(6)} ${rays(8, 6.4, 2.2, 13)}`,
  mechanist: `${gear(8, 9.7, 7.4)} ${circle(3.2)}`,
};

/**
 * The colour a glyph is drawn in: the faction's colour, lifted toward white when it is too dark to stand out
 * on the dark map and panels (the faction's own colour is unchanged everywhere else).
 */
export function glyphColor(color: string): string {
  const n = parseInt(color.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (x: number, y: number, z: number) => (0.2126 * x + 0.7152 * y + 0.0722 * z) / 255;
  for (let k = 0; k < 8 && lum(r, g, b) < 0.42; k++) {
    r += (255 - r) * 0.18; g += (255 - g) * 0.18; b += (255 - b) * 0.18;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function glyphPath(faction: string): string {
  return GLYPHS[faction] ?? circle(8);
}

const pathCache = new Map<string, Path2D>();

/** Draws a faction's glyph centred at (x, y), `size` across, filled with `color` and outlined in dark. */
export function drawGlyph(ctx: CanvasRenderingContext2D, faction: string, x: number, y: number, size: number, color: string): void {
  let p = pathCache.get(faction);
  if (!p) { p = new Path2D(glyphPath(faction)); pathCache.set(faction, p); }
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 20, size / 20);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(4, 6, 13, 0.9)';
  ctx.stroke(p);
  ctx.fillStyle = color.startsWith('#') ? glyphColor(color) : color;
  ctx.fill(p, 'evenodd');
  ctx.restore();
}

/** The glyph as an inline SVG element for the page (faction chips). */
export function glyphElement(faction: string, color: string, px = 11): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('glyph');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', glyphPath(faction));
  path.setAttribute('fill', color.startsWith('#') ? glyphColor(color) : color);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('stroke', 'rgba(4,6,13,0.8)');
  path.setAttribute('stroke-width', '1.5');
  svg.append(path);
  return svg;
}
