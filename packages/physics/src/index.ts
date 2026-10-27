/** Pure deterministic ray geometry; coordinates grow right and downward. */
export type Vec = { x: number; y: number };
export type Surface = { id: string; a: Vec; b: Vec; kind: 'mirror' | 'absorber' };
export type Target = { id: string; center: Vec; radius: number };
export type Trace = {
  segments: { from: Vec; to: Vec; hit: string | null }[];
  targets: string[];
  termination: 'escape' | 'absorbed' | 'limit';
};
export const EPS = 1e-7;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const finite = (p: Vec) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6;
export function unit(v: Vec): Vec {
  const n = Math.hypot(v.x, v.y);
  if (!finite(v) || n < EPS) throw new Error('Invalid direction');
  return { x: v.x / n, y: v.y / n };
}
export function intersect(o: Vec, d: Vec, a: Vec, b: Vec): number | null {
  const edge = sub(b, a),
    delta = sub(a, o),
    den = cross(d, edge);
  if (Math.abs(den) < EPS) return null;
  const t = cross(delta, edge) / den,
    u = cross(delta, d) / den;
  return t > EPS && u >= -EPS && u <= 1 + EPS ? t : null;
}
export function reflect(d: Vec, a: Vec, b: Vec): Vec {
  const t = unit(sub(b, a)),
    v = unit(d),
    p = 2 * dot(v, t);
  return unit({ x: p * t.x - v.x, y: p * t.y - v.y });
}
export function mirrorSurface(id: string, c: Vec, length: number, angle: number): Surface {
  const r = (angle * Math.PI) / 180,
    dx = (Math.cos(r) * length) / 2,
    dy = (Math.sin(r) * length) / 2;
  return { id, kind: 'mirror', a: { x: c.x - dx, y: c.y - dy }, b: { x: c.x + dx, y: c.y + dy } };
}
function touches(a: Vec, b: Vec, t: Target) {
  const v = sub(b, a),
    u = Math.max(0, Math.min(1, dot(sub(t.center, a), v) / Math.max(EPS, dot(v, v))));
  return Math.hypot(a.x + v.x * u - t.center.x, a.y + v.y * u - t.center.y) <= t.radius;
}
export function traceRay(
  origin: Vec,
  direction: Vec,
  surfaces: Surface[],
  targets: Target[],
  maxBounces = 12,
  maxDistance = 2400,
): Trace {
  if (
    !finite(origin) ||
    !Number.isInteger(maxBounces) ||
    maxBounces < 0 ||
    maxBounces > 64 ||
    !Number.isFinite(maxDistance) ||
    maxDistance <= 0 ||
    maxDistance > 1e5 ||
    surfaces.length > 128 ||
    targets.length > 64
  )
    throw new Error('Invalid scene');
  for (const s of surfaces)
    if (!finite(s.a) || !finite(s.b) || Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) < EPS)
      throw new Error('Invalid surface');
  for (const t of targets)
    if (!finite(t.center) || !Number.isFinite(t.radius) || t.radius <= 0 || t.radius > 1000)
      throw new Error('Invalid target');
  let from = { ...origin },
    d = unit(direction),
    remaining = maxDistance;
  const segments: Trace['segments'] = [],
    lit = new Set<string>();
  const done = (termination: Trace['termination']): Trace => ({
    segments,
    targets: [...lit],
    termination,
  });
  for (let i = 0; i <= maxBounces; i++) {
    let distance = remaining,
      hit: Surface | undefined;
    for (const s of surfaces) {
      const t = intersect(from, d, s.a, s.b);
      if (t !== null && t < distance) {
        distance = t;
        hit = s;
      }
    }
    const to = { x: from.x + d.x * distance, y: from.y + d.y * distance };
    segments.push({ from, to, hit: hit?.id ?? null });
    for (const t of targets) if (touches(from, to, t)) lit.add(t.id);
    if (!hit) return done('escape');
    if (hit.kind === 'absorber') return done('absorbed');
    remaining -= distance;
    if (i === maxBounces || remaining <= EPS * 10) return done('limit');
    d = reflect(d, hit.a, hit.b);
    from = { x: to.x + d.x * EPS * 10, y: to.y + d.y * EPS * 10 };
    remaining -= EPS * 10;
  }
  return done('limit');
}
