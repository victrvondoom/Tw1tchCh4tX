export type Point = { x: number; y: number; z?: number };
export type Calibration = { center: Point; left: Point; right: Point; top: Point; bottom: Point };
export function eyeFeature(l: Point[]): Point | null {
  const a = l[33],
    b = l[133],
    iris = l[468],
    top = l[159],
    bottom = l[145],
    a2 = l[362],
    b2 = l[263],
    iris2 = l[473],
    top2 = l[386],
    bottom2 = l[374];
  if (!a || !b || !iris || !top || !bottom || !a2 || !b2 || !iris2 || !top2 || !bottom2)
    return null;
  const w = Math.abs(b.x - a.x),
    w2 = Math.abs(b2.x - a2.x);
  if (
    w < 0.01 ||
    w2 < 0.01 ||
    Math.abs(bottom.y - top.y) / w < 0.1 ||
    Math.abs(bottom2.y - top2.y) / w2 < 0.1
  )
    return null;
  const x = ((iris.x - (a.x + b.x) / 2) / w + (iris2.x - (a2.x + b2.x) / 2) / w2) / 2,
    y = ((iris.y - (top.y + bottom.y) / 2) / w + (iris2.y - (top2.y + bottom2.y) / 2) / w2) / 2;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
export function mapGaze(f: Point, c: Calibration, s: number): Point | null {
  const dx = c.right.x - c.left.x,
    dy = c.bottom.y - c.top.y;
  if (Math.abs(dx) < 0.015 || Math.abs(dy) < 0.006) return null;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    x: clamp(0.5 + ((f.x - c.center.x) / dx) * 0.8 * s),
    y: clamp(0.5 + ((f.y - c.center.y) / dy) * 0.8 * s),
  };
}
