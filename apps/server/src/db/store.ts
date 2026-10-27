import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ResultSchema, type RoundResult } from '@prism/shared';
export class ResultStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
    if (Number(this.db.prepare('PRAGMA user_version').get()?.user_version) > 1) {
      this.db.close();
      throw new Error('Database newer than application.');
    }
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,mode TEXT NOT NULL CHECK(mode IN ('demo','twitch')),score INTEGER NOT NULL,created_at TEXT NOT NULL,result TEXT NOT NULL); PRAGMA user_version=1;",
    );
  }
  save(r: RoundResult) {
    ResultSchema.parse(r);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT OR IGNORE INTO rounds(id,mode,score,created_at,result) VALUES(?,?,?,?,?)')
        .run(r.id, r.mode, r.score, r.createdAt, JSON.stringify(r));
      this.db.exec(
        'DELETE FROM rounds WHERE id NOT IN(SELECT id FROM rounds ORDER BY created_at DESC,rowid DESC LIMIT 100); COMMIT;',
      );
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  history(): RoundResult[] {
    return this.db
      .prepare('SELECT result FROM rounds ORDER BY created_at DESC,rowid DESC LIMIT 100')
      .all()
      .map((r) => ResultSchema.parse(JSON.parse(String(r.result))));
  }
  leaderboard(mode: 'demo' | 'twitch'): RoundResult[] {
    return this.db
      .prepare(
        'SELECT result FROM rounds WHERE mode=? ORDER BY score DESC,created_at DESC LIMIT 10',
      )
      .all(mode)
      .map((r) => ResultSchema.parse(JSON.parse(String(r.result))));
  }
  clear() {
    this.db.exec('DELETE FROM rounds; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  }
  healthy() {
    return this.db.prepare('SELECT 1 AS ok').get()?.ok === 1;
  }
  close() {
    this.db.close();
  }
}
