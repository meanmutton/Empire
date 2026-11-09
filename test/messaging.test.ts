import { LocalMessaging, threadKey } from '../src/ui/messaging';
import { newGame } from './helpers';

describe('hot seat messaging', () => {
  it('stores messages in the game and shows each player only their own', async () => {
    const g = newGame('chat');
    const m = new LocalMessaging(() => g);
    let changes = 0;
    m.subscribe(() => changes++);
    await m.send('concord', ['rynkai'], 'Psst', 2);
    await m.send('lattice', ['all'], 'Greetings', 2);
    expect(changes).toBe(2);
    expect(g.messages).toHaveLength(2);
    expect(m.list('rynkai').map((x) => x.text)).toEqual(['Psst', 'Greetings']);
    expect(m.list('varrhen').map((x) => x.text)).toEqual(['Greetings']);
    expect(threadKey(g.messages![0], 'concord')).toBe('rynkai');
    expect(threadKey(g.messages![0], 'rynkai')).toBe('concord');
    expect(threadKey(g.messages![1], 'concord')).toBe('all');
    expect(await m.send('concord', ['rynkai'], '   ', 2)).toBe(false);
  });
});
