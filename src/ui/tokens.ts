/**
 * Procedural ship tokens. Each faction has a hull style (src/data/factions.ts) so its ships share a look;
 * class sets size and detail, role adds a badge. Drawn once per (design, size) into a cached canvas.
 */
import { DESIGNS, type ShipDesign } from '../data/designs';
import { factionDef, type HullStyle } from '../data/factions';
import { CLASSES, type ShipRole } from '../data/ships';

const cache = new Map<string, HTMLCanvasElement>();

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amount >= 0) { r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount; }
  else { r *= 1 + amount; g *= 1 + amount; b *= 1 + amount; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Relative token scale by class size (fighter 0.48 … dreadnaught 1). */
export function classScale(d: ShipDesign): number {
  return 0.42 + (CLASSES[d.cls].size / 10) * 0.58;
}

/** A cached token image for a design at a pixel size (the square canvas side). */
export function tokenImage(designId: string, px: number): HTMLCanvasElement {
  const key = `${designId}@${px}`;
  let c = cache.get(key);
  if (c) return c;
  const d = DESIGNS[designId];
  c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.translate(px / 2, px / 2);
  const s = (px / 2) * classScale(d) * 0.92;
  drawShip(ctx, factionDef(d.faction).style, factionDef(d.faction).color, s, CLASSES[d.cls].size);
  drawBadge(ctx, d.role, px / 2);
  cache.set(key, c);
  return c;
}

/** Draws a hull of `style` centered at the origin, pointing up, with half-size `s`. */
export function drawShip(ctx: CanvasRenderingContext2D, style: HullStyle, color: string, s: number, detail: number): void {
  const fill = color, dark = shade(color, -0.55), light = shade(color, 0.55);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.strokeStyle = dark;
  const grad = ctx.createLinearGradient(-s, -s, s, s);
  grad.addColorStop(0, light);
  grad.addColorStop(0.5, fill);
  grad.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = grad;
  const P = (pts: number[][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  switch (style) {
    case 'arrow': // Concord: sleek swept arrowhead with a long spine
      P([[0, -1], [0.22, -0.2], [0.75, 0.55], [0.3, 0.42], [0.18, 0.85], [-0.18, 0.85], [-0.3, 0.42], [-0.75, 0.55], [-0.22, -0.2]]);
      ctx.strokeStyle = light;
      ctx.beginPath(); ctx.moveTo(0, -0.8 * s); ctx.lineTo(0, 0.7 * s); ctx.stroke();
      break;
    case 'blade': // Ryn'kai: curved crescent blade
      ctx.beginPath();
      ctx.moveTo(0, -1 * s);
      ctx.quadraticCurveTo(0.95 * s, -0.1 * s, 0.55 * s, 0.9 * s);
      ctx.quadraticCurveTo(0.2 * s, 0.35 * s, 0, 0.55 * s);
      ctx.quadraticCurveTo(-0.2 * s, 0.35 * s, -0.55 * s, 0.9 * s);
      ctx.quadraticCurveTo(-0.95 * s, -0.1 * s, 0, -1 * s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(0, -0.05 * s, 0.16 * s, 0, Math.PI * 2); ctx.fill();
      break;
    case 'wedge': // Varrhen: heavy angular wedge with notches
      P([[0, -1], [0.85, 0.75], [0.45, 0.6], [0.3, 0.9], [-0.3, 0.9], [-0.45, 0.6], [-0.85, 0.75]]);
      ctx.fillStyle = dark;
      ctx.fillRect(-0.12 * s, -0.35 * s, 0.24 * s, 0.7 * s);
      break;
    case 'hammer': // Krasnyr: blocky hammer
      P([[-0.85, -0.95], [0.85, -0.95], [0.85, -0.45], [0.28, -0.45], [0.28, 0.95], [-0.28, 0.95], [-0.28, -0.45], [-0.85, -0.45]]);
      ctx.fillStyle = light;
      ctx.fillRect(-0.6 * s, -0.8 * s, 1.2 * s, 0.12 * s);
      break;
    case 'prism': { // Lattice: geometric hexagonal prism with inner facets
      const hex = [...Array(6)].map((_, i) => [Math.cos((i * Math.PI) / 3 - Math.PI / 2) * 0.95, Math.sin((i * Math.PI) / 3 - Math.PI / 2) * 0.95]);
      P(hex);
      ctx.strokeStyle = light;
      ctx.beginPath();
      for (const [x, y] of [hex[0], hex[2], hex[4]]) { ctx.moveTo(0, 0); ctx.lineTo(x * s, y * s); }
      ctx.stroke();
      break;
    }
    case 'orb':
      ctx.beginPath(); ctx.arc(0, 0, 0.7 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = light;
      ctx.beginPath(); ctx.ellipse(0, 0, 1 * s, 0.32 * s, -0.4, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'scrap':
      P([[0, -0.95], [0.4, -0.6], [0.8, -0.65], [0.65, 0.05], [0.9, 0.5], [0.3, 0.85], [-0.2, 0.7], [-0.75, 0.9], [-0.6, 0.2], [-0.9, -0.3], [-0.35, -0.5]]);
      ctx.fillStyle = dark;
      ctx.fillRect(-0.3 * s, -0.2 * s, 0.3 * s, 0.3 * s);
      ctx.fillRect(0.1 * s, 0.2 * s, 0.25 * s, 0.25 * s);
      break;
    case 'saucer':
      ctx.beginPath(); ctx.ellipse(0, 0.1 * s, 1 * s, 0.5 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.ellipse(0, -0.05 * s, 0.42 * s, 0.3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'spike':
      P([[0, -1], [0.18, -0.25], [0.9, 0.2], [0.2, 0.25], [0.35, 0.95], [0, 0.45], [-0.35, 0.95], [-0.2, 0.25], [-0.9, 0.2], [-0.18, -0.25]]);
      break;
    case 'insect':
      ctx.strokeStyle = dark;
      for (const y of [-0.2, 0.15, 0.5]) {
        ctx.beginPath(); ctx.moveTo(-0.95 * s, (y + 0.15) * s); ctx.lineTo(0.95 * s, (y + 0.15) * s); ctx.stroke();
      }
      ctx.strokeStyle = shade(color, -0.55);
      ctx.beginPath(); ctx.ellipse(0, -0.65 * s, 0.25 * s, 0.25 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -0.05 * s, 0.32 * s, 0.38 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0.6 * s, 0.28 * s, 0.38 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'cross':
      P([[-0.25, -1], [0.25, -1], [0.25, -0.3], [0.85, -0.3], [0.85, 0.15], [0.25, 0.15], [0.25, 0.95], [-0.25, 0.95], [-0.25, 0.15], [-0.85, 0.15], [-0.85, -0.3], [-0.25, -0.3]]);
      break;
    case 'sail':
      P([[-0.25, -0.2], [0.25, -0.2], [0.35, 0.9], [-0.35, 0.9]]);
      ctx.fillStyle = light;
      P([[0.05, -1], [0.95, 0.45], [0.05, 0.3]]);
      break;
    case 'ring':
      ctx.lineWidth = Math.max(2, s * 0.28);
      ctx.strokeStyle = fill;
      ctx.beginPath(); ctx.arc(0, 0, 0.72 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.strokeStyle = dark;
      ctx.beginPath(); ctx.arc(0, 0, 0.88 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(0, 0, 0.25 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'crystal':
      P([[0, -1], [0.35, -0.2], [0.2, 0.9], [-0.2, 0.9], [-0.35, -0.2]]);
      P([[0.55, -0.6], [0.8, 0.1], [0.5, 0.6], [0.35, 0]]);
      P([[-0.55, -0.6], [-0.35, 0], [-0.5, 0.6], [-0.8, 0.1]]);
      break;
    case 'brick':
      P([[-0.6, -0.95], [0.6, -0.95], [0.85, -0.5], [0.85, 0.95], [-0.85, 0.95], [-0.85, -0.5]]);
      ctx.strokeStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-0.85 * s, 0); ctx.lineTo(0.85 * s, 0);
      ctx.moveTo(0, -0.95 * s); ctx.lineTo(0, 0.95 * s);
      ctx.stroke();
      break;
    case 'organic':
      ctx.beginPath();
      ctx.moveTo(0, -1 * s);
      ctx.bezierCurveTo(0.8 * s, -0.8 * s, 1 * s, 0.4 * s, 0.4 * s, 0.9 * s);
      ctx.bezierCurveTo(0.1 * s, 0.6 * s, -0.1 * s, 0.6 * s, -0.4 * s, 0.9 * s);
      ctx.bezierCurveTo(-1 * s, 0.4 * s, -0.8 * s, -0.8 * s, 0, -1 * s);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(-0.2 * s, -0.25 * s, 0.14 * s, 0, Math.PI * 2); ctx.arc(0.22 * s, 0.05 * s, 0.1 * s, 0, Math.PI * 2); ctx.fill();
      break;
  }
  // Engine glows: bigger classes get more.
  const engines = Math.max(1, Math.round(detail / 3));
  ctx.fillStyle = 'rgba(160, 220, 255, 0.9)';
  for (let i = 0; i < engines; i++) {
    const x = engines === 1 ? 0 : (-0.4 + (0.8 * i) / (engines - 1)) * s;
    ctx.beginPath(); ctx.arc(x, 0.92 * s, Math.max(1, s * 0.09), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

const BADGES: Partial<Record<ShipRole, string>> = {
  scout: 'S', explore: 'X', carrier: 'C', escort: 'E', science: 'Σ', cargo: '▣', colony: '◎',
  constructor: '⚒', transport: 'T', raider: '!',
};

function drawBadge(ctx: CanvasRenderingContext2D, role: ShipRole, half: number): void {
  const glyph = BADGES[role];
  if (!glyph) return;
  const r = Math.max(5, half * 0.32);
  ctx.save();
  ctx.translate(half - r - 1, half - r - 1);
  ctx.fillStyle = 'rgba(8, 12, 24, 0.85)';
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(r * 1.25)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, r * 0.08);
  ctx.restore();
}
