import { useEffect, useRef } from 'react';
import type { GameState } from '@prism/shared';
import { mirrorSurface, type Vec } from '@prism/physics';
export function Arena({
  state,
  interactive = false,
  mouseAim = true,
  onAim,
  onPause,
  gaze,
}: {
  state: GameState;
  interactive?: boolean;
  mouseAim?: boolean;
  onAim?: (a: number) => void;
  onPause?: () => void;
  gaze?: Vec | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = 1000 * dpr;
    canvas.height = 600 * dpr;
    ctx.scale(dpr, dpr);
    const gradient = ctx.createRadialGradient(500, 250, 0, 500, 250, 600);
    gradient.addColorStop(0, '#182536');
    gradient.addColorStop(1, '#080d13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 600);
    ctx.strokeStyle = '#ffffff08';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1000; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 600);
      ctx.stroke();
    }
    for (let y = 0; y <= 600; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1000, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff22';
    for (let x = 40; x < 1000; x += 80)
      for (let y = 40; y < 600; y += 80) ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#657386';
    ctx.fillText('OPTICAL FIELD / 1000 × 600', 28, 32);
    ctx.fillText(`TRACE: ${state.trace.segments.length} SEGMENTS`, 760, 32);
    for (const o of state.level.obstacles.filter((o) => o.id === 'barrier')) {
      ctx.strokeStyle = '#536173';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(o.a.x, o.a.y);
      ctx.lineTo(o.b.x, o.b.y);
      ctx.stroke();
      ctx.strokeStyle = '#0b1118';
      ctx.lineWidth = 4;
      ctx.setLineDash([3, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const t of state.level.targets) {
      const captured = state.captured.includes(t.id),
        color = captured ? '#c6ff65' : '#b798ff';
      ctx.beginPath();
      ctx.arc(t.center.x, t.center.y, t.radius + 12, 0, Math.PI * 2);
      ctx.fillStyle = color + '15';
      ctx.fill();
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.center.x, t.center.y, t.radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(t.center.x, t.center.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      const charge = (state.charge[t.id] ?? 0) / 800;
      if (charge) {
        ctx.beginPath();
        ctx.arc(
          t.center.x,
          t.center.y,
          t.radius + 6,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * charge,
        );
        ctx.strokeStyle = '#c6ff65';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.font = '12px monospace';
      ctx.fillStyle = color;
      ctx.fillText(
        `${t.id} ${captured ? 'SECURED' : 'RECEIVER'}`,
        t.center.x - 35,
        t.center.y + t.radius + 32,
      );
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const s of state.trace.segments) {
      ctx.beginPath();
      ctx.moveTo(s.from.x, s.from.y);
      ctx.lineTo(s.to.x, s.to.y);
      ctx.shadowColor = '#b798ff';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = '#a68bff55';
      ctx.lineWidth = 11;
      ctx.stroke();
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#c5b1ff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f0eaff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const m of state.level.mirrors) {
      const s = mirrorSurface(m.id, m.center, m.length, m.angle);
      ctx.beginPath();
      ctx.arc(m.center.x, m.center.y, m.length / 2 + 12, 0, Math.PI * 2);
      ctx.setLineDash([3, 8]);
      ctx.strokeStyle = '#67e3da44';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.strokeStyle = '#67e3da22';
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.strokeStyle = '#67e3da';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#67e3da';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b1118';
      ctx.beginPath();
      ctx.arc(m.center.x, m.center.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#67e3da';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`${m.id} / ${m.angle}°`, m.center.x - 30, m.center.y + m.length / 2 + 35);
    }
    const e = state.level.emitter;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 26, 0, Math.PI * 2);
    ctx.strokeStyle = '#c6ff6544';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#c6ff65';
    ctx.shadowColor = '#c6ff65';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#102010';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('↗', e.x - 8, e.y + 6);
    ctx.fillStyle = '#c6ff65';
    ctx.font = '12px monospace';
    ctx.fillText('EMITTER / YOU', e.x - 40, e.y + 50);
    if (gaze) {
      ctx.beginPath();
      ctx.arc(gaze.x * 1000, gaze.y * 600, 14, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffce82';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffce82';
      ctx.fillText('GAZE', gaze.x * 1000 + 20, gaze.y * 600);
    }
  }, [state, gaze]);
  return (
    <canvas
      ref={ref}
      className="arena-canvas"
      aria-label={`Optics arena. ${state.captured.length} of ${state.level.targets.length} targets secured. Arrow keys aim; space pauses.`}
      tabIndex={interactive ? 0 : -1}
      onPointerMove={(e) => {
        if (!interactive || !mouseAim || !onAim) return;
        const r = e.currentTarget.getBoundingClientRect();
        onAim(
          (Math.atan2(
            ((e.clientY - r.top) / r.height) * 600 - state.level.emitter.y,
            ((e.clientX - r.left) / r.width) * 1000 - state.level.emitter.x,
          ) *
            180) /
            Math.PI,
        );
      }}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.code === 'Space') {
          e.preventDefault();
          onPause?.();
        }
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          onAim?.(Math.max(-180, Math.min(180, state.aim + (e.key === 'ArrowLeft' ? -2 : 2))));
        }
      }}
    />
  );
}
