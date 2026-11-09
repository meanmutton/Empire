import { packState, unpackState } from '../src/net/codec';
import { stateHash } from '../src/engine/serialize';
import { newGame } from './helpers';

describe('state codec', () => {
  it('round-trips a game through gzip+base64 and is much smaller', async () => {
    const g = newGame('codec');
    const packed = await packState(g);
    expect(packed.length).toBeLessThan(JSON.stringify(g).length / 4);
    const back = await unpackState(packed);
    expect(stateHash(back)).toBe(stateHash(g));
  });
});
