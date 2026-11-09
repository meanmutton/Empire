/** Canvas galaxy map: terrain, systems, territory, fog of war, fleets, overlays, pan and zoom. */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { factionDef } from '../data/factions';
import { CLASSES } from '../data/ships';
import { getBit } from '../engine/bitset';
import { blockadedHexes } from '../engine/blockade';
import { AXIAL_DIRECTIONS, axialOf, axialToOffset, hexToPixel, pixelToHex } from '../engine/hex';
import type { FactionId, Fleet, GameState, StarKind } from '../engine/types';
import { canSeeFleet, visibleHexes } from '../engine/visibility';
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
  private visible = new Set<number>();
  private blockaded = new Set<number>();
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
    this.dirty = true;
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

  /** Screen position (CSS pixels, relative to the canvas) of a hex center. */
  hexScreen(hex: number): { x: number; y: number } {
    const p = hexToPixel(this.state.map, hex, HEX);
    return { x: (p.x - this.camX) * this.zoom, y: (p.y - this.camY) * this.zoom };
  }

  centerOn(hex: number): void {
    const p = hexToPixel(this.state.map, hex, HEX);
    const { w: fullW, h } = this.size();
    const w = Math.max(200, fullW - this.rightInset);
    this.camX = p.x - w / 2 / this.zoom;
    this.camY = p.y - h / 2 / this.zoom;
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
    const vw = w / this.zoom, vh = h / this.zoom;
    const margin = HEX * 3;
    this.camX = Math.max(-margin, Math.min(this.worldWidth - vw + margin, this.camX));
    this.camY = Math.max(-margin, Math.min(this.worldHeight - vh + margin, this.camY));
    if (vw > this.worldWidth + margin * 2) this.camX = (this.worldWidth - vw) / 2;
    if (vh > this.worldHeight + margin * 2) this.camY = (this.worldHeight - vh) / 2;
  }

  screenToHex(sx: number, sy: number): number {
    return pixelToHex(this.state.map, sx / this.zoom + this.camX, sy / this.zoom + this.camY, HEX);
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
    this.drawOverlays();
    this.drawFleets(new Set(inView));
    this.drawAgents(new Set(inView));
    for (const i of inView) if (explored(i) && !this.visible.has(i)) this.fogHex(i);
    if (this.hoverHex !== null) this.outlineHex(this.hoverHex, 'rgba(255,255,255,0.35)', 1.5);
    if (this.selectedHex !== null) this.outlineHex(this.selectedHex, '#ffd166', 2.5);
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
      const color = factionDef(hx.owner).color;
      this.hexPath(i);
      ctx.fillStyle = hexAlpha(color, 0.16);
      ctx.fill();
      // Borders on edges facing a different owner.
      const p = hexToPixel(this.state.map, i, HEX);
      const a = axialOf(this.state.map, i);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      for (let d = 0; d < 6; d++) {
        const dir = AXIAL_DIRECTIONS[d];
        const { col, row } = axialToOffset(a.q + dir.q, a.r + dir.r);
        const inside = col >= 0 && row >= 0 && col < this.state.map.width && row < this.state.map.height;
        const other = inside ? this.state.map.hexes[row * this.state.map.width + col].owner : null;
        if (other === hx.owner) continue;
        // Edge facing direction d: corners at angles (−60d + 30) and (−60d − 30) degrees for pointy-top axial dirs.
        const angle = (-60 * d * Math.PI) / 180;
        const a1 = angle - Math.PI / 6, a2 = angle + Math.PI / 6;
        const r = HEX - 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x + r * Math.cos(a1), p.y + r * Math.sin(a1));
        ctx.lineTo(p.x + r * Math.cos(a2), p.y + r * Math.sin(a2));
        ctx.stroke();
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
    if (this.zoom >= 0.65) {
      ctx.font = `${sys.homeOf ? 'bold ' : ''}9px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(230, 236, 250, 0.9)';
      ctx.fillText(sys.name, p.x, p.y + HEX * 0.72);
      ctx.textAlign = 'start';
    }
  }

  private drawStarbases(inView: number[], explored: (i: number) => boolean): void {
    const set = new Set(inView);
    const ctx = this.ctx;
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

  private drawFleets(inView: Set<number>): void {
    const byHex = new Map<number, Fleet[]>();
    for (const f of this.visibleFleets) {
      if (!inView.has(f.hex)) continue;
      const list = byHex.get(f.hex) ?? [];
      list.push(f);
      byHex.set(f.hex, list);
    }
    const ctx = this.ctx;
    for (const [hex, list] of byHex) {
      const p = hexToPixel(this.state.map, hex, HEX);
      list.sort((a, b) => (a.owner === this.viewer ? -1 : 0) - (b.owner === this.viewer ? -1 : 0));
      const n = Math.min(list.length, 4);
      list.slice(0, 4).forEach((f, k) => {
        const off = n === 1 ? { x: 0, y: 0 } : { x: (k % 2 ? 1 : -1) * HEX * 0.32, y: (k < 2 ? -1 : 1) * HEX * 0.28 };
        const x = p.x + off.x, y = p.y + off.y + (n === 1 ? -HEX * 0.05 : 0);
        const lead = [...f.ships].sort((a, b) => CLASSES[design(this.state.ships[b].design).cls].size - CLASSES[design(this.state.ships[a].design).cls].size)[0];
        const size = n === 1 ? 34 : 24;
        const img = tokenImage(this.state.ships[lead].design, size * 2);
        const color = factionDef(f.owner).color;
        ctx.fillStyle = 'rgba(4, 6, 13, 0.55)';
        ctx.beginPath(); ctx.arc(x, y, size * 0.52, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = f.id === this.selectedFleet ? '#ffd166' : color;
        ctx.lineWidth = f.id === this.selectedFleet ? 2.5 : 1.2;
        ctx.stroke();
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
        if (f.ships.length > 1) {
          ctx.fillStyle = shade(color, -0.4);
          ctx.beginPath(); ctx.arc(x + size * 0.42, y - size * 0.38, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 8px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(f.ships.length), x + size * 0.42, y - size * 0.38 + 0.5);
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }
        if (f.owner === this.viewer && f.movesLeft > 0) {
          ctx.fillStyle = '#7CFC9A';
          ctx.beginPath(); ctx.arc(x - size * 0.42, y - size * 0.38, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      });
      if (list.length > 4) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px system-ui';
        ctx.fillText(`+${list.length - 4}`, p.x + HEX * 0.5, p.y + HEX * 0.6);
      }
    }
  }

  private drawAgents(inView: Set<number>): void {
    const ctx = this.ctx;
    for (const a of Object.values(this.state.agents)) {
      if (a.owner !== this.viewer || a.ship || a.capturedBy || !inView.has(a.hex)) continue;
      const p = hexToPixel(this.state.map, a.hex, HEX);
      const x = p.x - HEX * 0.5, y = p.y - HEX * 0.42;
      ctx.fillStyle = a.kind === 'diplomat' ? '#f1faee' : '#2b2d42';
      ctx.strokeStyle = factionDef(a.owner).color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (a.kind === 'diplomat') ctx.arc(x, y, 4, 0, Math.PI * 2);
      else { ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath(); }
      ctx.fill(); ctx.stroke();
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
