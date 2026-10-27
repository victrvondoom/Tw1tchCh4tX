import { describe, it, expect } from 'vitest';
import { unit, intersect, reflect, mirrorSurface, traceRay, type Surface } from './index';
import { LEVELS } from '@prism/shared';
describe('deterministic ray geometry', () => {
  it('normalizes and rejects invalid directions', () => {
    expect(unit({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    for (const v of [
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: Infinity, y: 0 },
    ])
      expect(() => unit(v)).toThrow();
  });
  it('intersects only forward finite segments', () => {
    expect(intersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: -2 }, { x: 10, y: 2 })).toBe(10);
    expect(
      intersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -10, y: -2 }, { x: -10, y: 2 }),
    ).toBeNull();
    expect(intersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 2 }, { x: 10, y: 3 })).toBeNull();
    expect(intersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 })).toBeNull();
  });
  it('reflects a horizontal ray upward at -45 degrees', () => {
    const m = mirrorSurface('A', { x: 10, y: 0 }, 10, -45),
      d = reflect({ x: 1, y: 0 }, m.a, m.b);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(-1);
  });
  it('stops at nearest absorber and does not illuminate through it', () => {
    const wall = (x: number): Surface => ({
      id: String(x),
      kind: 'absorber',
      a: { x, y: -10 },
      b: { x, y: 10 },
    });
    const r = traceRay(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      [wall(20), wall(10)],
      [
        { id: 'near', center: { x: 5, y: 0 }, radius: 1 },
        { id: 'far', center: { x: 15, y: 0 }, radius: 1 },
      ],
    );
    expect(r.termination).toBe('absorbed');
    expect(r.segments[0]?.hit).toBe('10');
    expect(r.targets).toEqual(['near']);
  });
  it('finds targets on reflected segments', () => {
    const r = traceRay(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      [mirrorSurface('A', { x: 10, y: 0 }, 10, -45)],
      [{ id: 'up', center: { x: 10, y: -10 }, radius: 1 }],
    );
    expect(r.targets).toEqual(['up']);
    expect(r.segments).toHaveLength(2);
  });
  it('terminates facing mirror loops at the bounce budget', () => {
    const r = traceRay(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      [-10, 10].map((x) => mirrorSurface(String(x), { x, y: 0 }, 100, 90)),
      [],
      4,
    );
    expect(r.termination).toBe('limit');
    expect(r.segments).toHaveLength(5);
  });
  it('respects the distance budget', () => {
    const r = traceRay({ x: 0, y: 0 }, { x: 1, y: 0 }, [], [], 2, 5);
    expect(r.segments[0]?.to).toEqual({ x: 5, y: 0 });
    expect(r.termination).toBe('escape');
  });
  it.each([-1, 1.5, 65, Infinity, NaN])('rejects invalid bounce limit %s', (b) =>
    expect(() => traceRay({ x: 0, y: 0 }, { x: 1, y: 0 }, [], [], b)).toThrow(),
  );
  it('rejects malformed scenes', () => {
    expect(() => traceRay({ x: NaN, y: 0 }, { x: 1, y: 0 }, [], [])).toThrow();
    expect(() =>
      traceRay({ x: 0, y: 0 }, { x: 1, y: 0 }, [mirrorSurface('bad', { x: 2, y: 0 }, 0, 0)], []),
    ).toThrow();
    expect(() =>
      traceRay(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        [],
        [{ id: 'bad', center: { x: 1, y: 1 }, radius: -1 }],
      ),
    ).toThrow();
  });
  it.each(LEVELS)('has a physically valid solution for mission $id', (l) => {
    const r = traceRay(
      l.emitter,
      { x: 1, y: 0 },
      [
        ...l.obstacles,
        ...l.mirrors.map((m) => mirrorSurface(m.id, m.center, m.length, m.id === 'C' ? 45 : -45)),
      ],
      l.targets,
    );
    expect(new Set(r.targets)).toEqual(new Set(l.targets.map((t) => t.id)));
  });
  it('preserves unit length and reflection involution over 1000 seeded directions', () => {
    let seed = 42;
    const next = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < 1000; i++) {
      const t = next() * Math.PI * 2,
        d = { x: Math.cos(t), y: Math.sin(t) },
        m = mirrorSurface('m', { x: 0, y: 0 }, 10, next() * 360),
        r = reflect(d, m.a, m.b),
        back = reflect(r, m.a, m.b);
      expect(Math.hypot(r.x, r.y)).toBeCloseTo(1, 10);
      expect(back.x).toBeCloseTo(d.x, 10);
      expect(back.y).toBeCloseTo(d.y, 10);
    }
  });
});

it('does not step backwards when a reflection nearly exhausts the distance budget', () => {
  const result = traceRay(
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    [mirrorSurface('near-end', { x: 10, y: 0 }, 10, 90)],
    [],
    12,
    10.0000005,
  );
  expect(result.termination).toBe('limit');
  expect(result.segments).toHaveLength(1);
  expect(result.segments[0]?.to.x).toBeCloseTo(10);
});
