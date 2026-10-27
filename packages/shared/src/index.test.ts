import { it, expect } from 'vitest';
import { LEVELS, LevelSchema, ControlSchema, ChatInputSchema } from './index';
it('validates all built-in mission contracts', () => {
  for (const l of LEVELS) expect(LevelSchema.safeParse(l).success).toBe(true);
});
it('rejects extra control fields and out-of-range values', () => {
  expect(ControlSchema.safeParse({ type: 'aim', angle: 181 }).success).toBe(false);
  expect(ControlSchema.safeParse({ type: 'start', level: 4 }).success).toBe(false);
  expect(ControlSchema.safeParse({ type: 'pause', admin: true }).success).toBe(false);
  expect(ChatInputSchema.safeParse({ text: '!help', eventId: 'not-uuid' }).success).toBe(false);
});
