/**
 * Faction glyphs: a small emblem per faction, so factions are told apart by shape as well as colour (on the
 * map's home systems and territory names, and in every faction chip). Each glyph is one SVG path in a
 * 20×20 box, drawn on canvas through Path2D and in the page as inline SVG.
 */
import { FACTIONS } from '../data/factions';

const C = 10;

function polygon(n: number, r: number, rot = -90): string {
  const pts = [...Array(n)].map((_, i) => {
    const a = ((rot + (360 * i) / n) * Math.PI) / 180;
    return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join(' L')} Z`;
}

function star(n: number, r1: number, r2: number, rot = -90): string {
  const pts = [...Array(n * 2)].map((_, i) => {
    const r = i % 2 ? r2 : r1, a = ((rot + (180 * i) / n) * Math.PI) / 180;
    return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join(' L')} Z`;
}

function circle(r: number, cx = C, cy = C): string {
  return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
}

/** Outline of a shape: the shape with a smaller copy cut out (filled even-odd). */
const ring = (outer: string, inner: string) => `${outer} ${inner}`;

/** Great powers get hand-picked emblems; minor powers take the rest in roster order. */
const MAJOR_GLYPHS: Record<string, string> = {
  concord: star(4, 9.5, 3.2),
  rynkai: 'M3 5 L5 3 L10 8 L15 3 L17 5 L12 10 L17 15 L15 17 L10 12 L5 17 L3 15 L8 10 Z',
  varrhen: polygon(3, 9.5),
  krasnyr: star(5, 9.5, 4),
  lattice: polygon(6, 9),
};

const MINOR_POOL: string[] = [
  circle(8),
  'M3 3 H17 V17 H3 Z',
  polygon(4, 9.5),
  polygon(3, 9.5, 90),
  polygon(5, 9),
  polygon(8, 9),
  'M7.5 2 H12.5 V7.5 H18 V12.5 H12.5 V18 H7.5 V12.5 H2 V7.5 H7.5 Z',
  star(6, 9.5, 5),
  star(8, 9.5, 5.5),
  ring(circle(9), circle(5)),
  ring('M2 2 H18 V18 H2 Z', 'M6 6 H14 V14 H6 Z'),
  ring(polygon(4, 10), polygon(4, 5)),
  ring(polygon(3, 10), polygon(3, 4.5)),
  ring(polygon(6, 9.5), polygon(6, 5)),
  'M13 2 A8 8 0 1 0 13 18 A6 6 0 1 1 13 2 Z',
  'M2 13 L10 4 L18 13 L15 16 L10 10 L5 16 Z',
  'M2 7 L10 16 L18 7 L15 4 L10 10 L5 4 Z',
  'M3 2 H17 L10 10 L17 18 H3 L10 10 Z',
  'M2 3 V17 L10 10 L18 17 V3 L10 10 Z',
  'M10 1 L16 8 L10 19 L4 8 Z',
  'M2 11 A8 8 0 0 1 18 11 Z',
  'M4 2 H8 V18 H4 Z M12 2 H16 V18 H12 Z',
  `${circle(4.5, 5.5, 10)} ${circle(4.5, 14.5, 10)}`,
  `${circle(3.6, 10, 4.5)} ${circle(3.6, 4.5, 14)} ${circle(3.6, 15.5, 14)}`,
  'M10 1 L18 10 H13 V19 H7 V10 H2 Z',
  'M11 1 L4 11 H9 L7 19 L16 8 H11 Z',
  'M10 1 L18 4 V10 C18 15 14 18 10 19 C6 18 2 15 2 10 V4 Z',
  'M10 2 L18 9 V18 H2 V9 Z',
  'M5 4 H15 L19 16 H1 Z',
  star(7, 9.5, 4.5),
];

const glyphOf = new Map<string, string>();
FACTIONS.filter((f) => f.kind === 'minor').forEach((f, i) => glyphOf.set(f.id, MINOR_POOL[i % MINOR_POOL.length]));
for (const [id, path] of Object.entries(MAJOR_GLYPHS)) glyphOf.set(id, path);

export function glyphPath(faction: string): string {
  return glyphOf.get(faction) ?? circle(8);
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
  ctx.fillStyle = color;
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
  path.setAttribute('fill', color);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('stroke', 'rgba(4,6,13,0.8)');
  path.setAttribute('stroke-width', '1.5');
  svg.append(path);
  return svg;
}
