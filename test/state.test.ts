import { countBits, emptyBits, getBit, setBit, setBits } from '../src/engine/bitset';
import { relationKey } from '../src/engine/ids';

describe('bitset', () => {
  it('sets and reads bits', () => {
    let b = emptyBits(1500);
    expect(b.length).toBe(375);
    b = setBit(b, 0); b = setBit(b, 7); b = setBit(b, 1499);
    expect(getBit(b, 0)).toBe(true);
    expect(getBit(b, 7)).toBe(true);
    expect(getBit(b, 1499)).toBe(true);
    expect(getBit(b, 1)).toBe(false);
    expect(countBits(b)).toBe(3);
    const c = setBits(emptyBits(100), [3, 4, 99, 3]);
    expect(countBits(c)).toBe(3);
  });

  it('relation keys are order-independent', () => {
    expect(relationKey('b', 'a')).toBe(relationKey('a', 'b'));
  });
});
