// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Game } from '../../../server/src/game/engine';
import { Feed, Overlay } from '../App';
import { Arena } from './Arena';
import { eyeFeature, mapGaze } from '../features/gaze/estimator';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('renders event text as text, never HTML', () => {
  const g = new Game();
  g.event('info', '<script>window.compromised=true</script>');
  const { container } = render(<Feed state={g.state} />);
  expect(screen.getByText('<script>window.compromised=true</script>')).toBeTruthy();
  expect(container.querySelector('script')).toBeNull();
});
it('offers a read-only overlay with transparent body mode and disconnect state', () => {
  const g = new Game();
  const { unmount } = render(<Overlay state={g.state} connection="disconnected" />);
  expect(document.body.classList.contains('overlay-body')).toBe(true);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('Connection lost · reconnecting')).toBeTruthy();
  unmount();
  expect(document.body.classList.contains('overlay-body')).toBe(false);
  render(<Overlay state={null} connection="connecting" />);
  expect(screen.getByText(/Connecting to arena/)).toBeTruthy();
});
it('supports keyboard aiming independently of mouse aim', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const g = new Game(),
    aim = vi.fn(),
    pause = vi.fn();
  render(<Arena state={g.state} interactive mouseAim={false} onAim={aim} onPause={pause} />);
  const c = screen.getByLabelText(/Optics arena/);
  fireEvent.keyDown(c, { key: 'ArrowRight' });
  expect(aim).toHaveBeenCalledWith(-13);
  fireEvent.keyDown(c, { key: 'ArrowLeft' });
  expect(aim).toHaveBeenLastCalledWith(-17);
  fireEvent.keyDown(c, { code: 'Space' });
  expect(pause).toHaveBeenCalledOnce();
  fireEvent.pointerMove(c, { clientX: 50, clientY: 50 });
  expect(aim).toHaveBeenCalledTimes(2);
});
it('rejects absent eye features and degenerate calibrations', () => {
  expect(eyeFeature([])).toBeNull();
  const z = { x: 0, y: 0 };
  expect(mapGaze(z, { center: z, left: z, right: z, top: z, bottom: z }, 1)).toBeNull();
});
it('maps calibrated gaze and clamps the output', () => {
  const c = {
    center: { x: 0, y: 0 },
    left: { x: -0.1, y: 0 },
    right: { x: 0.1, y: 0 },
    top: { x: 0, y: -0.1 },
    bottom: { x: 0, y: 0.1 },
  };
  expect(mapGaze({ x: 0, y: 0 }, c, 1)).toEqual({ x: 0.5, y: 0.5 });
  expect(mapGaze({ x: 5, y: -5 }, c, 2)).toEqual({ x: 1, y: 0 });
});
