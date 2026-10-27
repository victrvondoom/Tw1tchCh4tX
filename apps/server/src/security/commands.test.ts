import { it, expect, vi } from 'vitest';
import { parseCommand, CommandGate } from './commands';
it.each([
  '!help',
  '!hint',
  '!status',
  '!score',
  '!rotate A -15',
  '!rotate b +45',
  '!vote shield',
  ' !vote quarantine ',
  '！rotate Ｃ ５',
])('accepts allowlisted command %s', (s) => expect(parseCommand(s)).not.toBeNull());
it.each([
  'hello',
  '!rotate A 0',
  '!rotate A 4',
  '!rotate A 50',
  '!rotate D 15',
  '!rotate A 15;rm',
  '!rotate A 1e1',
  '!vote admin',
  '!help\n',
  '!help\0',
  '<script>alert(1)</script>',
  '!score now',
  'x'.repeat(161),
  null,
  42,
])('rejects malformed command %s', (s) => expect(parseCommand(s)).toBeNull());
const options = {
  cooldown: 750,
  capacity: 24,
  refillPerSecond: 12,
  queueLimit: 64,
  dedupLimit: 10000,
};
const event = (actor = 'a', eventId = 'one', text = '!help', at = 1000) => ({
  actor,
  eventId,
  text,
  at,
});
it('enforces cooldown, replay protection and bounded draining', () => {
  const g = new CommandGate(options, 1000),
    apply = vi.fn();
  expect(g.submit(event(), 1000).status).toBe('queued');
  expect(g.submit(event(), 1000).code).toBe('duplicate');
  expect(g.submit(event('a', 'two'), 1001).code).toBe('cooldown');
  expect(g.submit(event('b', 'two'), 1001).status).toBe('queued');
  g.drain(1100, apply, vi.fn());
  expect(apply.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  expect(g.depth).toBe(0);
});
it('rejects stale and malformed event identity', () => {
  const g = new CommandGate(options, 1000);
  for (const e of [
    event('bad actor'),
    event('a', 'bad/id'),
    event('a', 'ok', '!help', NaN),
    event('a', 'ok', '!help', -200000),
  ])
    expect(g.submit(e, 1000).code).toBe('invalid_event');
});
it('caps global rate and refills with time', () => {
  const g = new CommandGate({ ...options, capacity: 1 }, 1000);
  expect(g.submit(event(), 1000).status).toBe('queued');
  expect(g.submit(event('b', 'two'), 1000).code).toBe('global_rate');
  expect(g.submit(event('b', 'two', '!help', 2000), 2000).status).toBe('queued');
});
it('fails closed when replay cache is full and expires old entries', () => {
  const g = new CommandGate({ ...options, dedupLimit: 1 }, 1000);
  g.submit(event(), 1000);
  expect(g.submit(event('b', 'two'), 1000).code).toBe('capacity');
  expect(g.submit(event('b', 'two', '!help', 602000), 602000).status).toBe('queued');
});
it('bounds queue, rejects grammar and expires delayed work', () => {
  const g = new CommandGate({ ...options, queueLimit: 1 }, 1000),
    expired = vi.fn(),
    apply = vi.fn();
  expect(g.submit(event('a', 'one', '!invalid'), 1000).code).toBe('invalid_command');
  g.submit(event('b', 'two'), 1000);
  expect(g.submit(event('c', 'three'), 1000).code).toBe('queue_full');
  g.drain(3001, apply, expired);
  expect(apply).not.toHaveBeenCalled();
  expect(expired).toHaveBeenCalledOnce();
});
it('drains at most eight and clears work without clearing deduplication', () => {
  const g = new CommandGate(options, 1000),
    apply = vi.fn();
  for (let i = 0; i < 12; i++) g.submit(event(String(i), String(i)), 1000);
  g.drain(1001, apply, vi.fn());
  expect(apply).toHaveBeenCalledTimes(8);
  expect(g.depth).toBe(4);
  g.clearQueue();
  expect(g.depth).toBe(0);
  expect(g.submit(event('1', '1'), 2000).code).toBe('duplicate');
});
