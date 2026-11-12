/** Canvas galaxy map: terrain, systems, territory, fog of war, fleets, overlays, pan and zoom. */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { factionDef } from '../data/factions';
import { CLASSES } from '../data/ships';
import { getBit } from '../engine/bitset';
import { blockadedHexes } from '../engine/blockade';
import { routeDisruptors } from '../engine/routes';
import { AXIAL_DIRECTIONS, axialOf, axialToOffset, hexToPixel, pixelToHex } from '../engine/hex';
import type { FactionId, Fleet, GameState, StarKind } from '../engine/types';
import { canSeeFleet, visibleHexes } from '../engine/visibility';
import { connectedHexes, relation } from '../engine/query';
import { drawGlyph } from './glyphs';
import { crestImage } from './crests';
import { shade, tokenImage } from './tokens';

export const HEX = 30;
const SQ3 = Math.sqrt(3);

const STAR_COLORS: Record<StarKind, string> = {
  yellow: '#ffe27a', orange: '#ffb057', red: '#ff7a5c', blue: '#8fc6ff', white: '#f4f6ff', neutron: '#c9b8ff', pulsar: '#7ff3ff',
};
const PLANET_COLORS: Record<string, string> = {
  terran: '#4fa86b', ocean: '#3d7fd6', jungle: '#2f9e4f', desert: '#d6a75a', arctic: '#cfe6f2', barren: '#9a8f86',
  volcanic: '#c7502d', gasGiant: '#d9a26b', asteroidBelt: '#8c7f73',
};

export interface Overlay {
  reachable?: Map<number, number>;
  path?: number[];
  highlight?: number[];
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  state!: GameState;
  viewer!: FactionId;
  camX = 0;
  camY = 0;
  zoom = 1;
  selectedHex: number | null = null;
  selectedFleet: string | null = null;
  hoverHex: number | null = null;
  overlay: Overlay = {};
  /** When true, draw everything (no fog) — for spectators or debugging. */
  revealAll = false;
  onHexClick: (hex: number, ev: PointerEvent) => void = () => {};
  onHover: (hex: number | null) => void = () => {};
  onCamera: () => void = () => {};
  /** Tint borders by the viewer's relation with each owner (war red, allies green, …). */
  relationsOverlay = false;
  private visible = new Set<number>();
  private blockaded = new Set<number>();
  /** Owned hexes cut off from their owner's home (they yield half). */
  private disconnected = new Set<number>();
  /** Where to write each faction's name when zoomed out: the middle of its explored home territory. */
  private regions: { faction: FactionId; x: number; y: number; n: number }[] = [];
  private visibleFleets: Fleet[] = [];
  private dirty = true;
  private stars: { x: number; y: number; r: number; a: number }[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 400; i++) this.stars.push({ x: rnd(), y: rnd(), r: rnd() * 1.2 + 0.2, a: rnd() * 0.6 + 0.2 });
    this.bindInput();
    const loop = () => {
      if (this.stopped) return;
      if (this.dirty) this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private stopped = false;

  destroy(): void {
    this.stopped = true;
  }

  setState(state: GameState, viewer: FactionId): void {
    this.state = state;
    this.viewer = viewer;
    this.refresh();
  }

  /** Recomputes visibility after the state changed. */
  refresh(): void {
    if (!this.state) return;
    this.visible = this.revealAll ? new Set(this.state.map.hexes.map((_, i) => i)) : visibleHexes(this.state, this.viewer);
    this.visibleFleets = Object.values(this.state.fleets).filter((f) => this.revealAll || canSeeFleet(this.state, this.viewer, f, this.visible));
    this.blockaded = new Set([...blockadedHexes(this.state)].filter((h) => this.visible.has(h)));
    this.disconnected = new Set();
    this.regions = [];
    const explored = (i: number) => this.revealAll || getBit(this.state.factions[this.viewer].explored, i);
    for (const f of Object.values(this.state.factions)) {
      if (!f.alive) continue;
      const home = connectedHexes(this.state, f.id);
      let sx = 0, sy = 0, n = 0;
      this.state.map.hexes.forEach((h, i) => {
        if (h.owner !== f.id) return;
        if (!home.has(i)) { this.disconnected.add(i); return; }
        if (!explored(i)) return;
        const p = hexToPixel(this.state.map, i, HEX);
        sx += p.x; sy += p.y; n++;
      });
      if (n >= 3) this.regions.push({ faction: f.id, x: sx / n, y: sy / n, n });
    }
    this.dirty = true;
  }

  /** Border colour for an owner: its own colour, or (with the relations overlay) the viewer's relation. */
  private borderColor(owner: FactionId): string {
    if (!this.relationsOverlay) return factionDef(owner).color;
    if (owner === this.viewer) return '#ffd166';
    const o = this.state.factions[owner];
    if (o?.overlord === this.viewer) return '#7cfc9a';
    const r = relation(this.state, this.viewer, owner);
    if (!r.contact) return '#5c6684';
    return ({ war: '#ff4d4d', hostile: '#ff9f43', neutral: '#9aa6c4', relations: '#8fb3ff', nap: '#4fd1c5', alliance: '#7cfc9a' } as Record<string, string>)[r.status] ?? '#9aa6c4';
  }

  invalidate(): void {
    this.dirty = true;
  }

  get worldWidth(): number {
    return SQ3 * HEX * (this.state.map.width + 0.5);
  }

  get worldHeight(): number {
    return 1.5 * HEX * this.state.map.height + HEX / 2;
  }

  /** Pixels on the right covered by the side panel, so centering uses the visible part of the map. */
  rightInset = 0;
  /** Height covered at the bottom (the phone's selection sheet), so centering keeps hexes in view. */
  bottomInset = 0;

  /** Screen position (CSS pixels, relative to the canvas) of a hex center. */
  hexScreen(hex: number): { x: number; y: number } {
    const p = hexToPixel(this.state.map, hex, HEX);
    return { x: (p.x - this.camX) * this.zoom, y: (p.y - this.camY) * this.zoom };
  }

  centerOn(hex: number): void {
    const p = hexToPixel(this.state.map, hex, HEX);
    const { w: fullW, h } = this.size();
    const w = Math.max(200, fullW - this.rightInset);
    const vh = Math.max(150, h - this.bottomInset);
    this.camX = p.x - w / 2 / this.zoom;
    this.camY = p.y - vh / 2 / this.zoom;
    this.clampCamera();
    this.dirty = true;
    this.onCamera();
  }

  private size(): { w: number; h: number } {
    const r = this.canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = this.size();
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dirty = true;
  }

  private clampCamera(): void {
    if (!this.state) return;
    const { w, h } = this.size();
    // The part of the canvas you can actually see: the side panel (desktop) and the selection sheet (phone) cover
    // the rest, so the edge of the map has to be able to reach the visible part, not slide in under them.
    const vw = Math.max(100, w - this.rightInset) / this.zoom, vh = Math.max(100, h - this.bottomInset) / this.zoom;
    const margin = HEX * 3;
    this.camX = Math.max(-margin, Math.min(this.worldWidth - vw + margin, this.camX));
    this.camY = Math.max(-margin, Math.min(this.worldHeight - vh + margin, this.camY));
    if (vw > this.worldWidth + margin * 2) this.camX = (this.worldWidth - vw) / 2;
    if (vh > this.worldHeight + margin * 2) this.camY = (this.worldHeight - vh) / 2;
  }

  screenToHex(sx: number, sy: number): number {
    return pixelToHex(this.state.map, sx / this.zoom + this.camX, sy / this.zoom + this.camY, HEX);
  }

  /** Moves the camera by screen pixels (keyboard panning). */
  panBy(dx: number, dy: number): void {
    this.camX += dx / this.zoom;
    this.camY += dy / this.zoom;
    this.clampCamera();
    this.dirty = true;
    this.onCamera();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const wx = sx / this.zoom + this.camX, wy = sy / this.zoom + this.camY;
    this.zoom = Math.max(0.25, Math.min(3, this.zoom * factor));
    this.camX = wx - sx / this.zoom;
    this.camY = wy - sy / this.zoom;
    this.clampCamera();
    this.dirty = true;
    this.onCamera();
  }

  /** Viewport in world coordinates. */
  viewport(): { x: number; y: number; w: number; h: number } {
    const { w, h } = this.size();
    return { x: this.camX, y: this.camY, w: w / this.zoom, h: h / this.zoom };
  }

  private bindInput(): void {
    const c = this.canvas;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) this.dragStart = { ...p, camX: this.camX, camY: this.camY, moved: false };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
        this.dragStart = null;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const target = this.pinch.zoom * (dist / this.pinch.dist);
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / this.zoom);
        return;
      }
      if (this.dragStart) {
        const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
        if (Math.hypot(dx, dy) > 6) this.dragStart.moved = true;
        if (this.dragStart.moved) {
          this.camX = this.dragStart.camX - dx / this.zoom;
          this.camY = this.dragStart.camY - dy / this.zoom;
          this.clampCamera();
          this.dirty = true;
          this.onCamera();
        }
        return;
      }
      if (!this.state) return;
      const h = this.screenToHex(p.x, p.y);
      const hv = h >= 0 ? h : null;
      if (hv !== this.hoverHex) {
        this.hoverHex = hv;
        this.dirty = true;
        this.onHover(hv);
      }
    });
    const up = (e: PointerEvent) => {
      const p = local(e);
      const wasDrag = this.dragStart?.moved;
      const single = this.pointers.size === 1 && !this.pinch;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (single && this.dragStart && !wasDrag && this.state) {
        const h = this.screenToHex(p.x, p.y);
        if (h >= 0) this.onHexClick(h, e);
      }
      if (this.pointers.size === 0) this.dragStart = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointerleave', () => { if (this.hoverHex !== null) { this.hoverHex = null; this.dirty = true; this.onHover(null); } });
    // Right-click is an order (move there), not the browser menu.
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.dragStart = null; this.pinch = null; });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  // -------------------------------------------------------------------------------------------------------
  // Drawing

  draw(): void {
    this.dirty = false;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = this.size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04060d';
    ctx.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      const x = ((s.x * w * 1.3 - this.camX * this.zoom * 0.08) % w + w) % w;
      const y = ((s.y * h * 1.3 - this.camY * this.zoom * 0.08) % h + h) % h;
      ctx.fillRect(x, y, s.r, s.r);
    }
    if (!this.state) return;
    ctx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, -this.camX * this.zoom * dpr, -this.camY * this.zoom * dpr);
    const map = this.state.map;
    const vp = this.viewport();
    const inView: number[] = [];
    for (let i = 0; i < map.hexes.length; i++) {
      const p = hexToPixel(map, i, HEX);
      if (p.x < vp.x - HEX * 2 || p.y < vp.y - HEX * 2 || p.x > vp.x + vp.w + HEX * 2 || p.y > vp.y + vp.h + HEX * 2) continue;
      inView.push(i);
    }
    const explored = (i: number) => this.revealAll || getBit(this.state.factions[this.viewer].explored, i);
    for (const i of inView) this.drawHexBase(i, explored(i));
    for (const i of inView) if (explored(i)) this.drawTerritory(i);
    for (const i of inView) if (explored(i)) this.drawSystem(i);
    this.drawStarbases(inView, explored);
    this.drawRoutes();
    this.drawOverlays();
    this.drawFleets(new Set(inView));
    this.drawAgents(new Set(inView));
    for (const i of inView) if (explored(i) && !this.visible.has(i)) this.fogHex(i);
    if (this.hoverHex !== null) this.outlineHex(this.hoverHex, 'rgba(255,255,255,0.35)', 1.5);
    if (this.selectedHex !== null) this.outlineHex(this.selectedHex, '#ffd166', 2.5);
    if (this.zoom <= 0.7) this.drawRegionNames(dpr);
  }

  /** Zoomed out, each power's name (and crest or glyph) over the middle of its territory, like an atlas. */
  private drawRegionNames(dpr: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const r of this.regions) {
      const known = r.faction === this.viewer || this.revealAll || relation(this.state, this.viewer, r.faction).contact;
      if (!known) continue;
      const def = factionDef(r.faction);
      const x = (r.x - this.camX) * this.zoom, y = (r.y - this.camY) * this.zoom;
      const major = this.state.factions[r.faction].kind === 'major';
      const size = major ? 15 : 12;
      const text = def.short.toUpperCase();
      ctx.font = `${major ? 700 : 600} ${size}px system-ui, sans-serif`;
      const spaced = text.split('').join('\u200a');
      const w = ctx.measureText(spaced).width;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4, 6, 13, 0.85)';
      ctx.strokeText(spaced, x + 8, y);
      ctx.fillStyle = shade(def.color, 0.35);
      ctx.fillText(spaced, x + 8, y);
      // The crest beside a great power's name (its glyph until the crest has loaded); minors keep their glyph.
      const crest = major ? crestImage(r.faction, () => { this.dirty = true; }) : null;
      if (crest) ctx.drawImage(crest, x + 8 - w / 2 - 30, y - 13, 26, 26);
      else drawGlyph(ctx, r.faction, x + 8 - w / 2 - 10, y, size, def.color);
      // Vassals say whose they are under their name.
      const overlord = this.state.factions[r.faction].overlord;
      if (overlord) {
        const sub = overlord === this.viewer ? 'YOUR VASSAL' : `VASSAL OF ${factionDef(overlord).short.toUpperCase()}`;
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeText(sub, x + 8, y + size);
        ctx.fillStyle = shade(factionDef(overlord).color, 0.35);
        ctx.fillText(sub, x + 8, y + size);
      }
    }
    ctx.restore();
  }

  private hexPath(i: number, inset = 0): void {
    const p = hexToPixel(this.state.map, i, HEX);
    const r = HEX - inset;
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = ((60 * k - 30) * Math.PI) / 180;
      const x = p.x + r * Math.cos(a), y = p.y + r * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private outlineHex(i: number, color: string, width: number): void {
    this.hexPath(i, 1);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width / Math.max(0.5, this.zoom);
    this.ctx.stroke();
  }

  private fogHex(i: number): void {
    this.hexPath(i);
    this.ctx.fillStyle = 'rgba(2, 3, 8, 0.45)';
    this.ctx.fill();
  }

  private drawHexBase(i: number, explored: boolean): void {
    const ctx = this.ctx;
    const hx = this.state.map.hexes[i];
    const p = hexToPixel(this.state.map, i, HEX);
    this.hexPath(i);
    if (!explored) {
      ctx.fillStyle = '#020309';
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,90,120,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    ctx.fillStyle = 'rgba(14, 20, 38, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(110, 130, 180, 0.13)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const seed = (i * 2654435761) >>> 0;
    const rnd = (k: number) => (((seed ^ (k * 40503)) * 2246822519) >>> 0) / 4294967296;
    switch (hx.terrain) {
      case 'nebula': {
        const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, HEX * 1.15);
        const hue = 280 + rnd(1) * 60;
        g.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.45)`);
        g.addColorStop(1, `hsla(${hue}, 70%, 40%, 0.05)`);
        this.hexPath(i);
        ctx.fillStyle = g;
        ctx.fill();
        break;
      }
      case 'asteroids':
        ctx.fillStyle = '#8c7f73';
        for (let k = 0; k < 9; k++) {
          const a = rnd(k) * Math.PI * 2, d = rnd(k + 20) * HEX * 0.75;
          ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1 + rnd(k + 40) * 2.2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'ionStorm': {
        ctx.strokeStyle = 'rgba(120, 220, 255, 0.55)';
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          let x = p.x - HEX * 0.6, y = p.y - HEX * 0.4 + k * HEX * 0.35;
          ctx.moveTo(x, y);
          for (let s = 0; s < 4; s++) { x += HEX * 0.3; y += (rnd(k * 7 + s) - 0.5) * HEX * 0.4; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        break;
      }
      case 'blackHole': {
        const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, HEX);
        g.addColorStop(0, '#000');
        g.addColorStop(0.45, '#000');
        g.addColorStop(0.6, 'rgba(255, 150, 60, 0.6)');
        g.addColorStop(1, 'rgba(255, 150, 60, 0)');
        ctx.fillStyle = g;
        this.hexPath(i);
        ctx.fill();
        break;
      }
      case 'wormhole': {
        ctx.strokeStyle = '#9ef0ff';
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, HEX * (0.25 + k * 0.15), HEX * (0.12 + k * 0.08), k * 0.6, 0, Math.PI * 1.6);
          ctx.stroke();
        }
        break;
      }
      case 'neutronStar':
      case 'pulsar': {
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, HEX * 0.9);
        const col = hx.terrain === 'pulsar' ? '127, 243, 255' : '201, 184, 255';
        g.addColorStop(0, `rgba(${col}, 0.5)`);
        g.addColorStop(1, `rgba(${col}, 0)`);
        ctx.fillStyle = g;
        this.hexPath(i);
        ctx.fill();
        if (hx.terrain === 'pulsar') {
          ctx.strokeStyle = 'rgba(127, 243, 255, 0.7)';
          ctx.beginPath(); ctx.moveTo(p.x - HEX * 0.8, p.y - HEX * 0.3); ctx.lineTo(p.x + HEX * 0.8, p.y + HEX * 0.3); ctx.stroke();
        }
        break;
      }
      default:
        break;
    }
  }

  private drawTerritory(i: number): void {
    const hx = this.state.map.hexes[i];
    const ctx = this.ctx;
    if (hx.owner) {
      const color = this.borderColor(hx.owner);
      const cut = this.disconnected.has(i);
      this.hexPath(i);
      ctx.fillStyle = hexAlpha(color.startsWith('#') ? color : '#ffffff', cut ? 0.07 : 0.22);
      ctx.fill();
      if (cut) {
        // Cut off from home: hatched, with a dashed border (it yields half).
        ctx.save();
        this.hexPath(i, 2);
        ctx.clip();
        ctx.strokeStyle = hexAlpha(color, 0.35);
        ctx.lineWidth = 1;
        const p0 = hexToPixel(this.state.map, i, HEX);
        ctx.beginPath();
        for (let k = -HEX * 2; k < HEX * 2; k += 6) { ctx.moveTo(p0.x + k - HEX, p0.y - HEX); ctx.lineTo(p0.x + k + HEX, p0.y + HEX); }
        ctx.stroke();
        ctx.restore();
        this.hexPath(i, 2);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Borders on edges facing a different owner: a dark line outside, the owner's colour inside.
      const p = hexToPixel(this.state.map, i, HEX);
      const a = axialOf(this.state.map, i);
      for (let d = 0; d < 6 && !cut; d++) {
        const dir = AXIAL_DIRECTIONS[d];
        const { col, row } = axialToOffset(a.q + dir.q, a.r + dir.r);
        const inside = col >= 0 && row >= 0 && col < this.state.map.width && row < this.state.map.height;
        const other = inside ? this.state.map.hexes[row * this.state.map.width + col].owner : null;
        if (other === hx.owner) continue;
        // Edge facing direction d: corners at angles (−60d + 30) and (−60d − 30) degrees for pointy-top axial dirs.
        const angle = (-60 * d * Math.PI) / 180;
        const a1 = angle - Math.PI / 6, a2 = angle + Math.PI / 6;
        // A vassal's border carries a second line in its overlord's colour.
        const overlord = this.state.factions[hx.owner]?.overlord;
        const lines: [number, number, string][] = [[HEX - 0.6, 4.2, 'rgba(4, 6, 13, 0.85)'], [HEX - 2.2, 2.4, color]];
        if (overlord) lines.push([HEX - 4.4, 2, this.borderColor(overlord)]);
        for (const [r, w, c] of lines) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(p.x + r * Math.cos(a1), p.y + r * Math.sin(a1));
          ctx.lineTo(p.x + r * Math.cos(a2), p.y + r * Math.sin(a2));
          ctx.stroke();
        }
      }
    }
    if (hx.pendingClaim && this.visible.has(i)) {
      this.hexPath(i, 4);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = factionDef(hx.pendingClaim).color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawSystem(i: number): void {
    const sys = this.state.map.hexes[i].system;
    if (!sys) return;
    const ctx = this.ctx;
    const p = hexToPixel(this.state.map, i, HEX);
    const sc = STAR_COLORS[sys.star];
    const starR = sys.star === 'blue' ? 6.5 : sys.star === 'red' ? 4 : 5.2;
    const sx = p.x - HEX * 0.28, sy = p.y - HEX * 0.18;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, starR * 3);
    g.addColorStop(0, sc);
    g.addColorStop(0.35, hexAlpha(sc.startsWith('#') ? sc : '#ffffff', 0.5));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, starR * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sc;
    ctx.beginPath(); ctx.arc(sx, sy, starR, 0, Math.PI * 2); ctx.fill();
    // Planet
    const px = p.x + HEX * 0.22, py = p.y + HEX * 0.05;
    const pr = sys.planet === 'gasGiant' ? 5.5 : sys.planet === 'asteroidBelt' ? 0 : 3.2 + sys.size * 0.35;
    if (pr > 0) {
      ctx.fillStyle = PLANET_COLORS[sys.planet];
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      if (sys.planet === 'gasGiant') {
        ctx.strokeStyle = 'rgba(255,230,190,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(px, py, pr * 1.6, pr * 0.45, -0.3, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      ctx.fillStyle = PLANET_COLORS.asteroidBelt;
      for (let k = 0; k < 5; k++) ctx.fillRect(px - 5 + k * 2.4, py - 1 + (k % 2) * 2, 1.6, 1.6);
    }
    if (sys.homeOf) {
      ctx.strokeStyle = factionDef(sys.homeOf).color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, starR + 4, 0, Math.PI * 2); ctx.stroke();
      // The faction's emblem above its capital.
      drawGlyph(ctx, sys.homeOf, sx, sy - starR - 9, 11, factionDef(sys.homeOf).color);
    }
    if (this.blockaded.has(i)) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(px, py, Math.max(pr, 4) + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (sys.ruins) {
      ctx.fillStyle = '#e8d38a';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillText('⌂', p.x + HEX * 0.25, p.y - HEX * 0.25);
    }
    // Development pips
    for (let k = 0; k < sys.development; k++) {
      ctx.fillStyle = this.state.map.hexes[i].owner ? factionDef(this.state.map.hexes[i].owner!).color : '#aaa';
      ctx.fillRect(p.x - HEX * 0.45 + k * 4.2, p.y + HEX * 0.38, 3, 3);
    }
    // Names: at least 11 screen pixels with a dark halo; zoomed out, only your systems and capitals.
    const owner = this.state.map.hexes[i].owner;
    if (this.zoom >= 0.65 || owner === this.viewer || sys.homeOf) {
      const px = Math.max(9, 11 / this.zoom);
      ctx.font = `${sys.homeOf ? 'bold ' : ''}${px.toFixed(1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 / this.zoom;
      ctx.strokeStyle = 'rgba(4, 6, 13, 0.9)';
      ctx.strokeText(sys.name, p.x, p.y + HEX * 0.72);
      ctx.fillStyle = owner === this.viewer ? '#ffffff' : 'rgba(230, 236, 250, 0.9)';
      ctx.fillText(sys.name, p.x, p.y + HEX * 0.72);
      ctx.textAlign = 'start';
    }
  }

  private drawStarbases(inView: number[], explored: (i: number) => boolean): void {
    const set = new Set(inView);
    const ctx = this.ctx;
    // Outposts: a small sensor mast with two signal arcs, top left of the hex.
    for (const i of inView) {
      const hx = this.state.map.hexes[i];
      if (!hx.outpost || !hx.owner || !explored(i)) continue;
      if (!this.visible.has(i) && hx.owner !== this.viewer) continue;
      const p = hexToPixel(this.state.map, i, HEX);
      const x = p.x - HEX * 0.42, y = p.y - HEX * 0.38;
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = factionDef(hx.owner).color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x - 3, y + 6); ctx.moveTo(x, y + 1); ctx.lineTo(x + 3, y + 6); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = factionDef(hx.owner).color;
      ctx.lineWidth = 1.1;
      for (const r of [4.5, 7]) { ctx.beginPath(); ctx.arc(x, y, r, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke(); }
    }
    for (const b of Object.values(this.state.starbases)) {
      if (!set.has(b.hex) || !explored(b.hex)) continue;
      if (!this.visible.has(b.hex)) continue;
      const p = hexToPixel(this.state.map, b.hex, HEX);
      const x = p.x + HEX * 0.42, y = p.y - HEX * 0.42;
      const sz = 3 + b.tier * 1.5;
      ctx.fillStyle = factionDef(b.owner).color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x - sz, y - sz, sz * 2, sz * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - sz * 1.6, y); ctx.lineTo(x + sz * 1.6, y); ctx.stroke();
      const max = BALANCE.starbase[b.tier as 1 | 2 | 3]?.hull ?? b.hull;
      if (b.hull < max) {
        ctx.fillStyle = '#e63946';
        ctx.fillRect(x - sz, y + sz + 1, sz * 2 * (b.hull / max), 1.5);
      }
    }
  }

  /** The viewer's trade routes (as owner or partner): gold dashes, red when disrupted. */
  private drawRoutes(): void {
    const ctx = this.ctx;
    for (const r of this.state.routes ?? []) {
      if (!this.revealAll && r.owner !== this.viewer && r.partner !== this.viewer) continue;
      const cut = routeDisruptors(this.state, r).length > 0;
      ctx.strokeStyle = cut ? 'rgba(255, 107, 107, 0.8)' : 'rgba(255, 209, 102, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      r.path.forEach((h, k) => {
        const p = hexToPixel(this.state.map, h, HEX);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawOverlays(): void {
    const ctx = this.ctx;
    if (this.overlay.reachable) {
      for (const [h] of this.overlay.reachable) {
        this.hexPath(h, 3);
        ctx.fillStyle = 'rgba(120, 200, 255, 0.10)';
        ctx.fill();
      }
    }
    if (this.overlay.highlight) {
      for (const h of this.overlay.highlight) this.outlineHex(h, 'rgba(255, 209, 102, 0.6)', 1.5);
    }
    const path = this.overlay.path;
    if (path && path.length > 1) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      path.forEach((h, k) => {
        const p = hexToPixel(this.state.map, h, HEX);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      const end = hexToPixel(this.state.map, path[path.length - 1], HEX);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(end.x, end.y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * Fleets: one stack token per owner in a hex (the biggest ship's icon, the total ship count, extra rims
   * when several fleets share it), set off to the top corner so the system and its name stay visible. Your
   * stack sits top right, others' top left. The selected hex, or a close zoom, fans the fleets out.
   */
  private drawFleets(inView: Set<number>): void {
    const byHex = new Map<number, Fleet[]>();
    for (const f of this.visibleFleets) {
      if (!inView.has(f.hex)) continue;
      const list = byHex.get(f.hex) ?? [];
      list.push(f);
      byHex.set(f.hex, list);
    }
    for (const [hex, list] of byHex) {
      const p = hexToPixel(this.state.map, hex, HEX);
      if (hex === this.selectedHex || this.zoom >= 2) { this.drawFleetsFanned(p, list); continue; }
      const owners = [...new Set(list.map((f) => f.owner))].sort((a, b) => (a === this.viewer ? -1 : b === this.viewer ? 1 : 0)
        || list.filter((f) => f.owner === b).length - list.filter((f) => f.owner === a).length);
      const sys = !!this.state.map.hexes[hex].system;
      const spots = owners.length === 1
        ? [sys ? { x: owners[0] === this.viewer ? 0.34 : -0.34, y: -0.36 } : { x: 0, y: -0.05 }]
        : [{ x: 0.34, y: -0.36 }, { x: -0.34, y: -0.4 }];
      owners.slice(0, 2).forEach((o, k) => {
        const spot = owners[0] === this.viewer || owners.length > 1 ? spots[k] : spots[0];
        const size = !sys && owners.length === 1 ? 32 : 26;
        this.drawStack(p.x + spot.x * HEX, p.y + spot.y * HEX, size, list.filter((f) => f.owner === o));
      });
      if (owners.length > 2) {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 9px system-ui';
        this.ctx.fillText(`+${owners.length - 2}`, p.x - HEX * 0.1, p.y - HEX * 0.62);
      }
    }
  }

  private leadDesign(fleets: Fleet[]): string {
    let best = '', size = -1;
    for (const f of fleets) for (const sid of f.ships) {
      const d = this.state.ships[sid].design;
      const s = CLASSES[design(d).cls].size;
      if (s > size) { size = s; best = d; }
    }
    return best;
  }

  /** One owner's fleets in a hex, as a single token. */
  private drawStack(x: number, y: number, size: number, fleets: Fleet[]): void {
    const ctx = this.ctx;
    const owner = fleets[0].owner;
    const color = factionDef(owner).color;
    const selected = fleets.some((f) => f.id === this.selectedFleet);
    const ships = fleets.reduce((n, f) => n + f.ships.length, 0);
    const r = size * 0.52;
    // Extra rims behind for each further fleet (up to two), so a stack reads as a stack.
    for (let k = Math.min(2, fleets.length - 1); k >= 1; k--) {
      ctx.fillStyle = 'rgba(4, 6, 13, 0.7)';
      ctx.strokeStyle = hexAlpha(color, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + k * 2.5, y - k * 2.5, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(4, 6, 13, 0.72)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = selected ? '#ffd166' : color;
    ctx.lineWidth = selected ? 2.5 : 1.6;
    ctx.stroke();
    ctx.drawImage(tokenImage(this.leadDesign(fleets), size * 2), x - size / 2, y - size / 2, size, size);
    if (ships > 1) {
      const bx = x + r * 0.8, by = y + r * 0.72;
      ctx.fillStyle = shade(color, -0.45);
      ctx.strokeStyle = '#04060d';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ships), bx, by + 0.5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    // Green: something here is still waiting for your orders this turn.
    if (owner === this.viewer && fleets.some((f) => f.movesLeft > 0 && f.path.length === 0 && !f.hold)) {
      ctx.fillStyle = '#7CFC9A';
      ctx.strokeStyle = '#04060d';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x - r * 0.78, y - r * 0.7, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  /** Every fleet in a hex on its own (the selected hex, or zoomed in). */
  private drawFleetsFanned(p: { x: number; y: number }, list: Fleet[]): void {
    const ctx = this.ctx;
    list.sort((a, b) => (a.owner === this.viewer ? -1 : 0) - (b.owner === this.viewer ? -1 : 0));
    const n = Math.min(list.length, 4);
    list.slice(0, 4).forEach((f, k) => {
      const off = n === 1 ? { x: 0.34, y: -0.36 } : { x: (k % 2 ? 1 : -1) * 0.34, y: (k < 2 ? -1 : 1) * 0.3 };
      this.drawStack(p.x + off.x * HEX, p.y + off.y * HEX, n === 1 ? 26 : 22, [f]);
    });
    if (list.length > 4) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px system-ui';
      ctx.fillText(`+${list.length - 4}`, p.x + HEX * 0.5, p.y + HEX * 0.6);
    }
  }

  /**
   * The viewer's agents: diplomats as a white pennant on a pole, spies as a dark diamond with an eye, both on
   * a faction-colored badge at the top left of the hex, with a count when several share a hex. Diplomats
   * serving as ambassadors get a gold ring.
   */
  private drawAgents(inView: Set<number>): void {
    const ctx = this.ctx;
    const byHex = new Map<number, { diplomats: number; spies: number; ambassador: boolean }>();
    for (const a of Object.values(this.state.agents)) {
      if (a.owner !== this.viewer || a.ship || a.capturedBy || !inView.has(a.hex)) continue;
      const e = byHex.get(a.hex) ?? { diplomats: 0, spies: 0, ambassador: false };
      if (a.kind === 'diplomat') e.diplomats++; else e.spies++;
      if (a.resident) e.ambassador = true;
      byHex.set(a.hex, e);
    }
    const color = factionDef(this.viewer).color;
    for (const [hex, e] of byHex) {
      const p = hexToPixel(this.state.map, hex, HEX);
      // Down the left side of the hex, clear of fleet tokens (center) and the system name (bottom).
      const x = p.x - HEX * 0.7;
      let y = e.diplomats && e.spies ? p.y - HEX * 0.02 : p.y + HEX * 0.16;
      if (e.diplomats) { this.drawAgentBadge(x, y, 'diplomat', e.diplomats, color, e.ambassador); y += HEX * 0.5; }
      if (e.spies) this.drawAgentBadge(x, y, 'spy', e.spies, color, false);
    }
  }

  private drawAgentBadge(x: number, y: number, kind: 'diplomat' | 'spy', count: number, color: string, ring: boolean): void {
    const ctx = this.ctx;
    const r = HEX * 0.21;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, -0.25);
    ctx.fill();
    ctx.lineWidth = ring ? 2.4 : 1.4;
    ctx.strokeStyle = ring ? '#ffd166' : '#f1faee';
    ctx.stroke();
    if (kind === 'diplomat') {
      // A pennant on a pole.
      ctx.strokeStyle = '#f1faee';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.35, y + r * 0.6);
      ctx.lineTo(x - r * 0.35, y - r * 0.6);
      ctx.stroke();
      ctx.fillStyle = '#f1faee';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.35, y - r * 0.6);
      ctx.lineTo(x + r * 0.6, y - r * 0.3);
      ctx.lineTo(x - r * 0.35, y);
      ctx.closePath();
      ctx.fill();
    } else {
      // A diamond with an eye.
      ctx.fillStyle = '#c9d1e8';
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.65); ctx.lineTo(x + r * 0.65, y); ctx.lineTo(x, y + r * 0.65); ctx.lineTo(x - r * 0.65, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0b1122';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    if (count > 1) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(HEX * 0.2)}px system-ui`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), x + r * 0.75, y + r * 0.7);
    }
  }
}

export function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Minimap: owner colors for explored hexes and the current viewport. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement, private view: MapView) {
    this.canvas = canvas;
    const go = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const m = this.view.state.map;
      const col = Math.max(0, Math.min(m.width - 1, Math.floor(fx * m.width)));
      const row = Math.max(0, Math.min(m.height - 1, Math.floor(fy * m.height)));
      this.view.centerOn(row * m.width + col);
    };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); go(e); });
    canvas.addEventListener('pointermove', (e) => { if (e.buttons) go(e); });
  }

  draw(): void {
    const v = this.view;
    if (!v.state) return;
    const m = v.state.map;
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#020309';
    ctx.fillRect(0, 0, r.width, r.height);
    const cw = r.width / (m.width + 0.5), ch = r.height / m.height;
    const ex = v.state.factions[v.viewer].explored;
    for (let i = 0; i < m.hexes.length; i++) {
      if (!v.revealAll && !getBit(ex, i)) continue;
      const col = i % m.width, row = Math.floor(i / m.width);
      const hx = m.hexes[i];
      ctx.fillStyle = hx.owner ? factionDef(hx.owner).color : hx.terrain === 'nebula' ? '#3a2350' : hx.terrain === 'blackHole' ? '#000' : '#121a2e';
      ctx.fillRect((col + (row & 1) * 0.5) * cw, row * ch, cw + 0.5, ch + 0.5);
      if (hx.system) {
        ctx.fillStyle = '#fff';
        ctx.fillRect((col + (row & 1) * 0.5) * cw + cw / 3, row * ch + ch / 3, Math.max(1, cw / 3), Math.max(1, ch / 3));
      }
    }
    const vp = v.viewport();
    const sx = r.width / v.worldWidth, sy = r.height / v.worldHeight;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vp.x * sx, vp.y * sy, vp.w * sx, vp.h * sy);
  }
}
