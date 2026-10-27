import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RoundResult } from '@prism/shared';
import { ResultStore } from './store';
const result = (i: number, mode: 'demo' | 'twitch' = 'demo'): RoundResult => ({
  id: String(i),
  level: 1,
  mode,
  outcome: 'won',
  score: i,
  elapsed: 9000,
  moves: 1,
  defenses: 1,
  participants: 2,
  achievements: ['Light keeper'],
  createdAt: new Date(1700000000000 + i * 1000).toISOString(),
});
it('persists idempotent results across restart and separates leaderboard modes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-')),
    path = join(dir, 'nested/test.db');
  try {
    let s = new ResultStore(path);
    expect(s.healthy()).toBe(true);
    s.save(result(1));
    s.save(result(1));
    s.save(result(2, 'twitch'));
    s.close();
    s = new ResultStore(path);
    expect(s.history()).toHaveLength(2);
    expect(s.leaderboard('demo').map((r) => r.id)).toEqual(['1']);
    expect(s.leaderboard('twitch').map((r) => r.id)).toEqual(['2']);
    s.clear();
    expect(s.history()).toEqual([]);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('retains the newest 100 results and rejects malformed data', () => {
  const s = new ResultStore(':memory:');
  try {
    for (let i = 0; i < 105; i++) s.save(result(i));
    expect(s.history()).toHaveLength(100);
    expect(s.history().at(-1)?.id).toBe('5');
    expect(s.leaderboard('demo')).toHaveLength(10);
    expect(() => s.save({ ...result(106), score: -1 })).toThrow();
  } finally {
    s.close();
  }
});
it('refuses a newer schema without rewriting it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-')),
    path = join(dir, 'future.db');
  try {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA user_version=2');
    db.close();
    expect(() => new ResultStore(path)).toThrow('newer');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
