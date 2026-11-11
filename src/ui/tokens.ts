/**
 * Procedural ship tokens. Each faction has a hull style (src/data/factions.ts) so its ships share a look.
 * On top of the faction's hull, every design gets detail from its class and role: proportions by role
 * (slim scouts, broad freighters and carriers), flank modules on big ships, hull plating and panel lines,
 * beam turrets or missile cells by its weapons, a hangar bay on carriers, a lit bridge, running lights and
 * engine flares. Drawn once per (design, size) into a cached canvas.
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

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
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
  const f = factionDef(d.faction);
  drawShip(ctx, f.style, f.color, s, CLASSES[d.cls].size, d);
  drawBadge(ctx, d.role, px / 2);
  cache.set(key, c);
  return c;
}

/**
 * A ship token for the page: a fresh canvas each time (a cached canvas can only sit in one place in the
 * page, so reusing it would make an earlier icon of the same design vanish).
 */
export function tokenElement(designId: string, px: number): HTMLCanvasElement {
  const src = tokenImage(designId, px);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/** Small deterministic hash of a string, for per-design variation. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Pts = number[][];

/** Polygon path in unit coordinates scaled by s. */
function poly(pts: Pts, s: number, into = new Path2D()): Path2D {
  pts.forEach(([x, y], i) => (i ? into.lineTo(x * s, y * s) : into.moveTo(x * s, y * s)));
  into.closePath();
  return into;
}

/** The outline of a faction's hull (unit coordinates, pointing up), plus a drawing of its signature accents. */
function hullOf(style: HullStyle, s: number): { hull: Path2D; accent?: (ctx: CanvasRenderingContext2D, c: Colors) => void } {
  switch (style) {
    case 'arrow': // Concord: sleek swept arrowhead with a long spine
      return {
        hull: poly([[0, -1], [0.22, -0.2], [0.75, 0.55], [0.3, 0.42], [0.18, 0.85], [-0.18, 0.85], [-0.3, 0.42], [-0.75, 0.55], [-0.22, -0.2]], s),
        accent: (ctx, c) => { ctx.strokeStyle = c.light; ctx.lineWidth = Math.max(1, s * 0.05); ctx.beginPath(); ctx.moveTo(0, -0.8 * s); ctx.lineTo(0, 0.7 * s); ctx.stroke(); },
      };
    case 'blade': { // Ryn'kai: curved crescent blade
      const p = new Path2D();
      p.moveTo(0, -1 * s);
      p.quadraticCurveTo(0.95 * s, -0.1 * s, 0.55 * s, 0.9 * s);
      p.quadraticCurveTo(0.2 * s, 0.35 * s, 0, 0.55 * s);
      p.quadraticCurveTo(-0.2 * s, 0.35 * s, -0.55 * s, 0.9 * s);
      p.quadraticCurveTo(-0.95 * s, -0.1 * s, 0, -1 * s);
      p.closePath();
      return { hull: p, accent: (ctx, c) => { ctx.fillStyle = c.dark; ctx.beginPath(); ctx.arc(0, -0.05 * s, 0.16 * s, 0, Math.PI * 2); ctx.fill(); } };
    }
    case 'wedge': // Varrhen: heavy angular wedge with notches
      return {
        hull: poly([[0, -1], [0.85, 0.75], [0.45, 0.6], [0.3, 0.9], [-0.3, 0.9], [-0.45, 0.6], [-0.85, 0.75]], s),
        accent: (ctx, c) => { ctx.fillStyle = c.dark; ctx.fillRect(-0.12 * s, -0.35 * s, 0.24 * s, 0.7 * s); },
      };
    case 'bastion': // Krasnyr: armored icebreaker prow, stepped command tower, heavy engine sponsons
      return {
        hull: poly([[0, -1], [0.2, -0.82], [0.26, -0.22], [0.58, 0.08], [0.72, 0.5], [0.46, 0.6], [0.44, 0.95], [-0.44, 0.95], [-0.46, 0.6], [-0.72, 0.5], [-0.58, 0.08], [-0.26, -0.22], [-0.2, -0.82]], s),
        accent: (ctx, c) => {
          // Prow armor band.
          ctx.fillStyle = c.dark;
          ctx.fill(poly([[0, -1], [0.2, -0.82], [0.21, -0.68], [0, -0.82], [-0.21, -0.68], [-0.2, -0.82]], s));
          // Stepped tower.
          ctx.fillStyle = c.mid;
          ctx.strokeStyle = c.dark;
          ctx.lineWidth = Math.max(1, s * 0.05);
          for (const [w, y0, y1] of [[0.2, -0.3, 0.42], [0.13, -0.42, -0.3]]) {
            ctx.fillRect(-w * s, y0 * s, 2 * w * s, (y1 - y0) * s);
            ctx.strokeRect(-w * s, y0 * s, 2 * w * s, (y1 - y0) * s);
          }
          // Star on the tower.
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const r = (i % 2 ? 0.045 : 0.11) * s, a = -Math.PI / 2 + (i * Math.PI) / 5;
            const x = Math.cos(a) * r, y = 0.04 * s + Math.sin(a) * r;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          // Engine blocks on the sponsons.
          ctx.fillStyle = c.dark;
          ctx.fillRect(0.46 * s, 0.32 * s, 0.18 * s, 0.22 * s);
          ctx.fillRect(-0.64 * s, 0.32 * s, 0.18 * s, 0.22 * s);
        },
      };
    case 'hammer': // Grendis and Forgeborn: a heavy armoured hull with broad shoulders, plating and a forge-lit core
      return {
        hull: poly([[0, -1], [0.3, -0.84], [0.36, -0.5], [0.72, -0.34], [0.78, 0.22], [0.48, 0.36], [0.52, 0.95], [-0.52, 0.95], [-0.48, 0.36], [-0.78, 0.22], [-0.72, -0.34], [-0.36, -0.5], [-0.3, -0.84]], s),
        accent: (ctx, c) => {
          ctx.strokeStyle = c.dark;
          ctx.lineWidth = Math.max(1, s * 0.06);
          ctx.beginPath();
          for (const y of [-0.5, -0.1, 0.36]) { ctx.moveTo(-0.62 * s, y * s); ctx.lineTo(0.62 * s, y * s); }
          ctx.stroke();
          ctx.fillStyle = c.light;
          ctx.fillRect(-0.14 * s, -0.42 * s, 0.28 * s, 0.24 * s);
          ctx.fillStyle = rgba('#ffb35a', 0.95);
          ctx.fillRect(-0.3 * s, 0.62 * s, 0.18 * s, 0.24 * s);
          ctx.fillRect(0.12 * s, 0.62 * s, 0.18 * s, 0.24 * s);
        },
      };
    case 'prism': { // Lattice: geometric hexagonal prism with inner facets
      const hex = [...Array(6)].map((_, i) => [Math.cos((i * Math.PI) / 3 - Math.PI / 2) * 0.95, Math.sin((i * Math.PI) / 3 - Math.PI / 2) * 0.95]);
      return {
        hull: poly(hex, s),
        accent: (ctx, c) => {
          ctx.strokeStyle = c.light;
          ctx.lineWidth = Math.max(1, s * 0.05);
          ctx.beginPath();
          for (const [x, y] of [hex[0], hex[2], hex[4]]) { ctx.moveTo(0, 0); ctx.lineTo(x * s, y * s); }
          ctx.stroke();
          ctx.fillStyle = rgba('#9ff0ff', 0.85);
          ctx.beginPath(); ctx.arc(0, 0, 0.13 * s, 0, Math.PI * 2); ctx.fill();
        },
      };
    }
    case 'orb': {
      const p = new Path2D(); p.arc(0, 0, 0.7 * s, 0, Math.PI * 2);
      return { hull: p, accent: (ctx, c) => { ctx.strokeStyle = c.light; ctx.lineWidth = Math.max(1, s * 0.06); ctx.beginPath(); ctx.ellipse(0, 0, 1 * s, 0.32 * s, -0.4, 0, Math.PI * 2); ctx.stroke(); } };
    }
    case 'scrap':
      return {
        hull: poly([[0, -0.95], [0.4, -0.6], [0.8, -0.65], [0.65, 0.05], [0.9, 0.5], [0.3, 0.85], [-0.2, 0.7], [-0.75, 0.9], [-0.6, 0.2], [-0.9, -0.3], [-0.35, -0.5]], s),
        accent: (ctx, c) => { ctx.fillStyle = c.dark; ctx.fillRect(-0.3 * s, -0.2 * s, 0.3 * s, 0.3 * s); ctx.fillRect(0.1 * s, 0.2 * s, 0.25 * s, 0.25 * s); },
      };
    case 'saucer': {
      const p = new Path2D(); p.ellipse(0, 0.1 * s, 1 * s, 0.5 * s, 0, 0, Math.PI * 2);
      return { hull: p, accent: (ctx, c) => { ctx.fillStyle = c.light; ctx.strokeStyle = c.dark; ctx.beginPath(); ctx.ellipse(0, -0.05 * s, 0.42 * s, 0.3 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } };
    }
    case 'spike':
      return { hull: poly([[0, -1], [0.18, -0.25], [0.9, 0.2], [0.2, 0.25], [0.35, 0.95], [0, 0.45], [-0.35, 0.95], [-0.2, 0.25], [-0.9, 0.2], [-0.18, -0.25]], s) };
    case 'insect': {
      const p = new Path2D();
      p.ellipse(0, -0.65 * s, 0.25 * s, 0.25 * s, 0, 0, Math.PI * 2);
      p.ellipse(0, -0.05 * s, 0.32 * s, 0.38 * s, 0, 0, Math.PI * 2);
      p.ellipse(0, 0.6 * s, 0.28 * s, 0.38 * s, 0, 0, Math.PI * 2);
      return {
        hull: p,
        accent: (ctx, c) => {
          ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, s * 0.07);
          ctx.beginPath();
          for (const y of [-0.05, 0.3, 0.65]) { ctx.moveTo(-0.95 * s, y * s); ctx.lineTo(-0.3 * s, (y - 0.1) * s); ctx.moveTo(0.95 * s, y * s); ctx.lineTo(0.3 * s, (y - 0.1) * s); }
          ctx.stroke();
        },
      };
    }
    case 'cross': // Celestine, Vesh, Ilyrian: a tall spire with wings swept back like a cathedral arch, and a bright spine
      return {
        hull: poly([[0, -1], [0.13, -0.6], [0.2, -0.18], [0.76, 0.5], [0.8, 0.78], [0.5, 0.66], [0.28, 0.5], [0.24, 0.95], [0, 0.8], [-0.24, 0.95], [-0.28, 0.5], [-0.5, 0.66], [-0.8, 0.78], [-0.76, 0.5], [-0.2, -0.18], [-0.13, -0.6]], s),
        accent: (ctx, c) => {
          ctx.strokeStyle = c.light;
          ctx.lineWidth = Math.max(1, s * 0.06);
          ctx.beginPath(); ctx.moveTo(0, -0.82 * s); ctx.lineTo(0, 0.6 * s); ctx.stroke();
          ctx.fillStyle = c.light;
          ctx.beginPath(); ctx.arc(0, -0.15 * s, 0.11 * s, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = Math.max(1, s * 0.04);
          ctx.beginPath(); ctx.moveTo(-0.62 * s, 0.6 * s); ctx.lineTo(-0.2 * s, 0.1 * s); ctx.moveTo(0.62 * s, 0.6 * s); ctx.lineTo(0.2 * s, 0.1 * s); ctx.stroke();
        },
      };
    case 'sail':
      return {
        hull: poly([[-0.25, -0.2], [0.25, -0.2], [0.35, 0.9], [-0.35, 0.9]], s),
        accent: (ctx, c) => { ctx.fillStyle = c.light; ctx.strokeStyle = c.dark; const p = poly([[0.05, -1], [0.95, 0.45], [0.05, 0.3]], s); ctx.fill(p); ctx.stroke(p); },
      };
    case 'ring': {
      const p = new Path2D();
      p.arc(0, 0, 0.9 * s, 0, Math.PI * 2);
      p.arc(0, 0, 0.55 * s, 0, Math.PI * 2, true);
      return { hull: p, accent: (ctx, c) => { ctx.fillStyle = c.light; ctx.strokeStyle = c.dark; ctx.beginPath(); ctx.arc(0, 0, 0.25 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } };
    }
    case 'crystal': {
      const p = poly([[0, -1], [0.35, -0.2], [0.2, 0.9], [-0.2, 0.9], [-0.35, -0.2]], s);
      poly([[0.55, -0.6], [0.8, 0.1], [0.5, 0.6], [0.35, 0]], s, p);
      poly([[-0.55, -0.6], [-0.35, 0], [-0.5, 0.6], [-0.8, 0.1]], s, p);
      return { hull: p };
    }
    case 'brick':
      return {
        hull: poly([[-0.6, -0.95], [0.6, -0.95], [0.85, -0.5], [0.85, 0.95], [-0.85, 0.95], [-0.85, -0.5]], s),
        accent: (ctx, c) => { ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, s * 0.06); ctx.beginPath(); ctx.moveTo(-0.85 * s, 0); ctx.lineTo(0.85 * s, 0); ctx.moveTo(0, -0.95 * s); ctx.lineTo(0, 0.95 * s); ctx.stroke(); },
      };
    case 'organic': {
      const p = new Path2D();
      p.moveTo(0, -1 * s);
      p.bezierCurveTo(0.8 * s, -0.8 * s, 1 * s, 0.4 * s, 0.4 * s, 0.9 * s);
      p.bezierCurveTo(0.1 * s, 0.6 * s, -0.1 * s, 0.6 * s, -0.4 * s, 0.9 * s);
      p.bezierCurveTo(-1 * s, 0.4 * s, -0.8 * s, -0.8 * s, 0, -1 * s);
      p.closePath();
      return { hull: p, accent: (ctx, c) => { ctx.fillStyle = c.light; ctx.beginPath(); ctx.arc(-0.2 * s, -0.25 * s, 0.14 * s, 0, Math.PI * 2); ctx.arc(0.22 * s, 0.05 * s, 0.1 * s, 0, Math.PI * 2); ctx.fill(); } };
    }
  }
}

interface Colors { fill: string; light: string; mid: string; dark: string }

/** Styles whose shape is round or open: flank modules and wingtip lights would look wrong on them. */
const COMPACT: HullStyle[] = ['orb', 'ring', 'saucer', 'insect', 'organic'];

/** Proportions by role: slim scouts, broad freighters and carriers. */
function roleScale(role?: ShipRole): [number, number] {
  switch (role) {
    case 'scout': case 'raider': return [0.78, 1.05];
    case 'cargo': case 'transport': case 'colony': case 'constructor': return [1.12, 0.94];
    case 'carrier': return [1.15, 1];
    default: return [1, 1];
  }
}

/**
 * Draws a ship of hull `style` centered at the origin, pointing up, with half-size `s`. `detail` is the class
 * size (1–10); `d`, when given, adds weapons, hangars and per-design variation.
 */
export function drawShip(ctx: CanvasRenderingContext2D, style: HullStyle, color: string, s: number, detail: number, d?: ShipDesign): void {
  const c: Colors = { fill: color, light: shade(color, 0.55), mid: shade(color, 0.2), dark: shade(color, -0.55) };
  const fine = s >= 9; // enough pixels for small detail
  const big = detail >= 5;
  const rnd = hash(d?.id ?? style);
  ctx.save();
  ctx.lineJoin = 'round';
  const [sx, sy] = roleScale(d?.role);
  ctx.scale(sx, sy);

  // Flank modules on big ships (behind the hull, so they read as attached).
  if (big && !COMPACT.includes(style)) {
    ctx.fillStyle = shade(color, -0.25);
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = Math.max(1, s * 0.06);
    const w = 0.16 + (detail - 5) * 0.015, y0 = 0.05 - (detail - 5) * 0.04;
    for (const side of [-1, 1]) {
      const x = side * (0.5 + w / 2);
      const p = new Path2D();
      p.roundRect((x - w / 2) * s, y0 * s, w * s, (0.62 - y0) * s, w * s * 0.4);
      ctx.fill(p); ctx.stroke(p);
    }
  }

  const { hull, accent } = hullOf(style, s);
  const grad = ctx.createLinearGradient(-s, -s, s, s);
  grad.addColorStop(0, c.light);
  grad.addColorStop(0.5, c.fill);
  grad.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = grad;
  ctx.fill(hull, 'evenodd');

  // Plating and panel lines, clipped to the hull.
  if (fine) {
    ctx.save();
    ctx.clip(hull, 'evenodd');
    ctx.fillStyle = rgba('#000000', 0.16);
    const plates = 1 + Math.floor(detail / 3);
    for (let i = 0; i < plates; i++) {
      const r = (rnd >>> (i * 5)) & 31;
      const px = ((r % 7) / 7 - 0.5) * 1.2, py = (((r >> 2) % 6) / 6 - 0.45) * 1.4;
      ctx.fillRect(px * s, py * s, (0.18 + (r % 3) * 0.08) * s, (0.12 + (r % 2) * 0.1) * s);
    }
    ctx.strokeStyle = rgba('#000000', 0.3);
    ctx.lineWidth = Math.max(0.6, s * 0.025);
    const lines = 2 + Math.floor(detail / 2);
    ctx.beginPath();
    for (let i = 1; i <= lines; i++) {
      const y = -0.85 + (1.75 * i) / (lines + 1);
      ctx.moveTo(-s, y * s); ctx.lineTo(s, y * s);
    }
    ctx.stroke();
    // A soft highlight down the left flank.
    const hl = ctx.createLinearGradient(-s, 0, 0, 0);
    hl.addColorStop(0, rgba('#ffffff', 0.18));
    hl.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = hl;
    ctx.fillRect(-s, -s, s, 2 * s);
    ctx.restore();
  }
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.strokeStyle = c.dark;
  ctx.stroke(hull);
  accent?.(ctx, c);

  if (fine && d) {
    // Weapons: beam turrets (circles with barrels) or missile cells (small squares), by what the design carries.
    const beams = d.stats.energy, missiles = d.stats.missile;
    const mounts = Math.min(6, detail >= 3 ? Math.floor(detail / 1.6) : beams + missiles > 0 ? 1 : 0);
    const r = Math.max(1.2, s * 0.065);
    for (let i = 0; i < mounts; i++) {
      const pair = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      const x = mounts === 1 ? 0 : side * 0.17 * s, y = (-0.5 + pair * 0.32) * s;
      const missile = missiles > beams ? i % 3 !== 2 : i % 3 === 2 && missiles > 0;
      ctx.fillStyle = c.dark;
      ctx.strokeStyle = c.light;
      ctx.lineWidth = Math.max(0.6, s * 0.03);
      if (missile) {
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
      } else {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 2.1); ctx.stroke();
      }
    }
    // Carriers: a lit hangar bay.
    if (d.stats.hangar > 0) {
      ctx.fillStyle = '#0a0f1e';
      ctx.fillRect(-0.18 * s, 0.18 * s, 0.36 * s, 0.32 * s);
      ctx.fillStyle = rgba('#ffd166', 0.85);
      ctx.fillRect(-0.14 * s, 0.44 * s, 0.28 * s, Math.max(1, 0.04 * s));
    }
    // Shields: a faint bow shimmer.
    if (d.stats.shields > 0 && detail >= 4) {
      ctx.strokeStyle = rgba('#9ff0ff', 0.35);
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath(); ctx.arc(0, 0.1 * s, 1.08 * s, -Math.PI * 0.82, -Math.PI * 0.18); ctx.stroke();
    }
  }
  // Bridge window.
  ctx.fillStyle = '#d8f6ff';
  ctx.beginPath(); ctx.arc(0, -0.58 * s, Math.max(0.8, s * 0.055), 0, Math.PI * 2); ctx.fill();
  // Running lights on the widest point.
  if (fine && detail >= 3 && !COMPACT.includes(style)) {
    const wx = big ? 0.66 : 0.55;
    ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(-wx * s, 0.5 * s, Math.max(0.8, s * 0.04), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5aff8a'; ctx.beginPath(); ctx.arc(wx * s, 0.5 * s, Math.max(0.8, s * 0.04), 0, Math.PI * 2); ctx.fill();
  }
  // Engine flares: bigger classes get more, and longer.
  const engines = Math.max(1, Math.round(detail / 3));
  for (let i = 0; i < engines; i++) {
    const x = engines === 1 ? 0 : (-0.4 + (0.8 * i) / (engines - 1)) * s;
    const y = 0.92 * s, len = s * (0.18 + detail * 0.012);
    const g = ctx.createRadialGradient(x, y, 0, x, y + len * 0.4, len);
    g.addColorStop(0, 'rgba(235, 250, 255, 1)');
    g.addColorStop(0.35, 'rgba(140, 210, 255, 0.85)');
    g.addColorStop(1, 'rgba(80, 140, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y + len * 0.35, Math.max(1.2, s * 0.1), len, 0, 0, Math.PI * 2); ctx.fill();
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
