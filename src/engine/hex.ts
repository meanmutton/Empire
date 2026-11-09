/**
 * Hex grid math. The map is a rectangle of pointy-top hexes in "odd-r" offset layout (odd rows shifted half
 * a hex right). Hexes are stored by index = row * width + col. Axial coordinates (q, r) are used for distance
 * and neighbor math.
 */
export interface Axial { q: number; r: number; }
export interface Offset { col: number; row: number; }

export interface GridSize { width: number; height: number; }

export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(q: number, r: number): Offset {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

export function indexOf(grid: GridSize, col: number, row: number): number {
  return row * grid.width + col;
}

export function inBounds(grid: GridSize, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.width && row < grid.height;
}

export function colRow(grid: GridSize, index: number): Offset {
  return { col: index % grid.width, row: Math.floor(index / grid.width) };
}

export function axialOf(grid: GridSize, index: number): Axial {
  const { col, row } = colRow(grid, index);
  return offsetToAxial(col, row);
}

export const AXIAL_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexDistance(grid: GridSize, a: number, b: number): number {
  return axialDistance(axialOf(grid, a), axialOf(grid, b));
}

/** Indices of the in-bounds neighbors of a hex. */
export function neighbors(grid: GridSize, index: number): number[] {
  const a = axialOf(grid, index);
  const out: number[] = [];
  for (const d of AXIAL_DIRECTIONS) {
    const { col, row } = axialToOffset(a.q + d.q, a.r + d.r);
    if (inBounds(grid, col, row)) out.push(indexOf(grid, col, row));
  }
  return out;
}

/** In-bounds hexes at exactly `radius` from the center. */
export function ring(grid: GridSize, center: number, radius: number): number[] {
  if (radius === 0) return [center];
  const c = axialOf(grid, center);
  const out: number[] = [];
  let q = c.q + AXIAL_DIRECTIONS[4].q * radius;
  let r = c.r + AXIAL_DIRECTIONS[4].r * radius;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      const { col, row } = axialToOffset(q, r);
      if (inBounds(grid, col, row)) out.push(indexOf(grid, col, row));
      q += AXIAL_DIRECTIONS[side].q;
      r += AXIAL_DIRECTIONS[side].r;
    }
  }
  return out;
}

/** In-bounds hexes within `radius` of the center, nearest first. */
export function hexesWithin(grid: GridSize, center: number, radius: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= radius; k++) out.push(...ring(grid, center, k));
  return out;
}

/** Pixel center of a hex for pointy-top hexes of the given size (center-to-corner). */
export function hexToPixel(grid: GridSize, index: number, size: number): { x: number; y: number } {
  const { col, row } = colRow(grid, index);
  const w = Math.sqrt(3) * size;
  return { x: w * (col + 0.5 * (row & 1)) + w / 2, y: 1.5 * size * row + size };
}

/** Hex index under a pixel position, or -1 if off the map. */
export function pixelToHex(grid: GridSize, x: number, y: number, size: number): number {
  const px = x - (Math.sqrt(3) * size) / 2;
  const py = y - size;
  const qf = ((Math.sqrt(3) / 3) * px - py / 3) / size;
  const rf = ((2 / 3) * py) / size;
  const { q, r } = axialRound(qf, rf);
  const { col, row } = axialToOffset(q, r);
  return inBounds(grid, col, row) ? indexOf(grid, col, row) : -1;
}

function axialRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
