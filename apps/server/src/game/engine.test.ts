import { describe, it, expect, vi } from 'vitest';
import { LEVELS, GameStateSchema, type Defense } from '@prism/shared';
import { Game } from './engine';
function solve(g: Game) {
  g.control({ type: 'aim', angle: 0 });
  for (const m of g.state.level.mirrors)
    g.command('optics', {
      kind: 'rotate',
      mirror: m.id,
      degrees: (m.id === 'C' ? 45 : -45) - m.angle,
    });
}
function defend(g: Game, until: number) {
  while (g.state.phase === 'playing' && g.state.elapsed < until) {
    g.advance(50);
    if (g.state.activeThreat && Object.values(g.state.votes).every((x) => x === 0))
      g.command('defender', { kind: 'vote', defense: g.state.activeThreat.defense });
  }
}
describe('mission rules', () => {
  it.each(LEVELS)('completes mission $id with a persisted valid result', (l) => {
    const save = vi.fn(),
      g = new Game(save);
    g.control({ type: 'start', level: l.id });
    solve(g);
    defend(g, 30000);
    expect(g.state.phase).toBe('won');
    expect(g.state.health).toBe(100);
    expect(g.state.defenses).toBe(l.threats.length);
    expect(g.state.captured).toHaveLength(l.targets.length);
    expect(g.state.result?.achievements).toContain('Zero breaches');
    expect(g.state.result?.score).toBe(g.state.score);
    expect(GameStateSchema.safeParse(g.state).success).toBe(true);
    g.advance(10000);
    expect(save).toHaveBeenCalledOnce();
  });
  it('requires continuous target charge and latches captures', () => {
    const g = new Game();
    g.control({ type: 'start', level: 1 });
    solve(g);
    g.advance(400);
    expect(g.state.captured).toHaveLength(0);
    g.control({ type: 'aim', angle: 30 });
    g.advance(50);
    expect(g.state.charge.T1).toBe(0);
    g.control({ type: 'aim', angle: 0 });
    g.advance(800);
    expect(g.state.captured).toEqual(['T1']);
    g.control({ type: 'aim', angle: 30 });
    g.advance(50);
    expect(g.state.captured).toEqual(['T1']);
  });
  it('pauses time and rejects actions in invalid states', () => {
    const g = new Game();
    expect(g.control({ type: 'next' }).status).toBe('rejected');
    expect(g.command('a', { kind: 'rotate', mirror: 'A', degrees: 15 }).status).toBe('rejected');
    g.control({ type: 'start', level: 1 });
    g.control({ type: 'pause' });
    g.advance(5000);
    expect(g.state.elapsed).toBe(0);
    expect(g.control({ type: 'aim', angle: 0 }).status).toBe('rejected');
    expect(g.command('a', { kind: 'vote', defense: 'shield' }).status).toBe('rejected');
    g.control({ type: 'resume' });
    g.advance(50);
    expect(g.state.elapsed).toBe(50);
  });
  it('locks ballots and resolves ties as breaches without spending a charge', () => {
    const g = new Game();
    g.control({ type: 'start', level: 1 });
    expect(g.command('a', { kind: 'vote', defense: 'shield' }).status).toBe('rejected');
    g.advance(2000);
    g.command('a', { kind: 'vote', defense: 'quarantine' });
    expect(g.command('a', { kind: 'vote', defense: 'shield' }).status).toBe('rejected');
    g.command('b', { kind: 'vote', defense: 'shield' });
    g.advance(7000);
    expect(g.state.health).toBe(65);
    expect(g.state.shields).toBe(3);
  });
  it('spends a charge for an incorrect majority', () => {
    const g = new Game();
    g.control({ type: 'start', level: 1 });
    g.advance(2000);
    g.command('a', { kind: 'vote', defense: 'verify' });
    g.advance(7000);
    expect(g.state.health).toBe(65);
    expect(g.state.shields).toBe(2);
  });
  it('loses on exhausted integrity and on timeout', () => {
    const g = new Game();
    g.control({ type: 'start', level: 3 });
    g.advance(29000);
    expect(g.state.phase).toBe('lost');
    expect(g.state.health).toBe(0);
    g.control({ type: 'start', level: 1 });
    g.advance(75000);
    expect(g.state.phase).toBe('lost');
    expect(g.state.remaining).toBe(0);
  });
  it('bounds move count and event history and supports informational commands', () => {
    const g = new Game();
    g.control({ type: 'start', level: 1 });
    expect(g.command('a', { kind: 'rotate', mirror: 'Z', degrees: 15 }).status).toBe('rejected');
    for (let i = 0; i < 20; i++) g.command('a', { kind: 'rotate', mirror: 'A', degrees: 15 });
    expect(g.state.moves).toBe(18);
    for (let i = 0; i < 50; i++)
      for (const kind of ['help', 'hint', 'status', 'score'] as const)
        expect(g.command('a', { kind }).status).toBe('accepted');
    expect(g.state.events).toHaveLength(40);
  });
  it('awards community participation and wraps completed levels', () => {
    const g = new Game();
    g.control({ type: 'start', level: 3 });
    solve(g);
    g.advance(2000);
    for (const a of ['a', 'b', 'c']) g.command(a, { kind: 'vote', defense: 'quarantine' });
    defend(g, 30000);
    expect(g.state.result?.achievements).toContain('Community powered');
    expect(g.control({ type: 'next' }).status).toBe('accepted');
    expect(g.state.level.id).toBe(1);
    expect(g.state.participants).toBe(0);
    expect(g.state.result).toBeNull();
  });
  it('fixes mode at round start even after Twitch disconnects', () => {
    const g = new Game();
    g.state.twitch = { state: 'connected', detail: 'test', configured: true };
    g.control({ type: 'start', level: 1 });
    expect(g.state.mode).toBe('twitch');
    g.state.twitch.state = 'disabled';
    expect(g.state.mode).toBe('twitch');
    g.control({ type: 'reset' });
    expect(g.state.mode).toBe('demo');
  });
  it('is deterministic under tick batching and rejects invalid durations', () => {
    const a = new Game(),
      b = new Game();
    for (const g of [a, b]) {
      g.control({ type: 'start', level: 1 });
      solve(g);
    }
    a.advance(2000);
    for (let i = 0; i < 40; i++) b.advance(50);
    expect(a.state.trace).toEqual(b.state.trace);
    expect(a.state.score).toBe(b.state.score);
    expect(a.state.charge).toEqual(b.state.charge);
    for (const ms of [-1, 51, Infinity, 600050]) expect(() => a.advance(ms)).toThrow();
  });
  it('fails a correct defense if no charge remains', () => {
    const g = new Game();
    g.control({ type: 'start', level: 1 });
    g.state.shields = 0;
    g.advance(2000);
    g.command('a', { kind: 'vote', defense: 'quarantine' as Defense });
    g.advance(7000);
    expect(g.state.defenses).toBe(0);
    expect(g.state.health).toBe(65);
  });
});
