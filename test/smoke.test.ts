import { VERSION } from '../src/version';

describe('scaffold', () => {
  it('has a version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
