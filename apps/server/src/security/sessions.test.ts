import { it, expect } from 'vitest';
import { Sessions, constantEqual } from './sessions';
it('uses independent expiring session tokens', () => {
  const s = new Sessions(),
    a = s.create(0),
    b = s.create(0);
  expect(a).toHaveLength(64);
  expect(a).not.toBe(b);
  expect(s.valid(a, 1)).toBe(true);
  expect(s.valid(undefined, 1)).toBe(false);
  expect(s.valid('nope', 1)).toBe(false);
  s.remove(b);
  expect(s.valid(b, 1)).toBe(false);
  expect(s.valid(a, 28800000)).toBe(false);
});
it('binds single-use OAuth state to a session and expiry', () => {
  const s = new Sessions(),
    a = s.create(0),
    b = s.create(0),
    state = s.beginOAuth(a, 0);
  expect(s.consumeOAuth(b, state, 1)).toBe(false);
  expect(s.consumeOAuth(a, state, 1)).toBe(true);
  expect(s.consumeOAuth(a, state, 1)).toBe(false);
  const old = s.beginOAuth(a, 1);
  expect(s.consumeOAuth(a, old, 300001)).toBe(false);
  expect(s.consumeOAuth(undefined, old, 1)).toBe(false);
  expect(() => s.beginOAuth('nope', 1)).toThrow();
});
it('invalidates a state after an incorrect attempt', () => {
  const s = new Sessions(),
    a = s.create(0),
    state = s.beginOAuth(a, 0);
  expect(s.consumeOAuth(a, 'wrong', 1)).toBe(false);
  expect(s.consumeOAuth(a, state, 1)).toBe(false);
});
it('caps active sessions and prunes expired sessions', () => {
  const s = new Sessions();
  for (let i = 0; i < 32; i++) s.create(0);
  expect(() => s.create(1)).toThrow('capacity');
  expect(s.create(28800001)).toHaveLength(64);
});
it('compares secrets without accepting prefixes', () => {
  expect(constantEqual('secret', 'secret')).toBe(true);
  expect(constantEqual('secret', 'secreT')).toBe(false);
  expect(constantEqual('secret', 'secret-extra')).toBe(false);
});
