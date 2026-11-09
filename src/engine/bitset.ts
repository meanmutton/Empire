/** Fixed-size bitsets stored as hex strings (4 bits per character), so they survive JSON. */
export function emptyBits(size: number): string {
  return '0'.repeat(Math.ceil(size / 4));
}

export function getBit(bits: string, i: number): boolean {
  const c = bits.charCodeAt(i >> 2);
  const v = c <= 57 ? c - 48 : c - 87;
  return ((v >> (i & 3)) & 1) === 1;
}

export function setBit(bits: string, i: number): string {
  const ci = i >> 2;
  const c = bits.charCodeAt(ci);
  const v = c <= 57 ? c - 48 : c - 87;
  const nv = v | (1 << (i & 3));
  if (nv === v) return bits;
  return bits.slice(0, ci) + nv.toString(16) + bits.slice(ci + 1);
}

/** Sets many bits at once (faster than repeated setBit). */
export function setBits(bits: string, indices: Iterable<number>): string {
  const vals: number[] = [];
  for (let k = 0; k < bits.length; k++) {
    const c = bits.charCodeAt(k);
    vals.push(c <= 57 ? c - 48 : c - 87);
  }
  for (const i of indices) vals[i >> 2] |= 1 << (i & 3);
  return vals.map((v) => v.toString(16)).join('');
}

export function countBits(bits: string): number {
  let n = 0;
  for (let k = 0; k < bits.length; k++) {
    const c = bits.charCodeAt(k);
    let v = c <= 57 ? c - 48 : c - 87;
    while (v) { n += v & 1; v >>= 1; }
  }
  return n;
}
