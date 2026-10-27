import type { Command, CommandResult } from '@prism/shared';
export function parseCommand(input: unknown): Command | null {
  if (
    typeof input !== 'string' ||
    input.length > 160 ||
    [...input].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  const text = input.normalize('NFKC').trim().toLowerCase();
  if (text.length > 160) return null;
  if (/^!(help|status|score|hint)$/.test(text))
    return { kind: text.slice(1) as 'help' | 'status' | 'score' | 'hint' };
  const r = /^!rotate\s+([a-c])\s+([+-]?\d{1,2})$/.exec(text);
  if (r) {
    const d = Number(r[2]);
    if (d !== 0 && Math.abs(d) <= 45 && d % 5 === 0)
      return { kind: 'rotate', mirror: r[1]!.toUpperCase(), degrees: d };
  }
  const v = /^!vote\s+(shield|quarantine|verify)$/.exec(text);
  return v ? { kind: 'vote', defense: v[1] as 'shield' | 'quarantine' | 'verify' } : null;
}
export class CommandGate {
  private users = new Map<string, number>();
  private seen = new Map<string, number>();
  private queue: { actor: string; command: Command; at: number }[] = [];
  private tokens: number;
  private updated: number;
  constructor(
    private options = {
      cooldown: 750,
      capacity: 24,
      refillPerSecond: 12,
      queueLimit: 64,
      dedupLimit: 10000,
    },
    now = Date.now(),
  ) {
    this.tokens = options.capacity;
    this.updated = now;
  }
  get depth() {
    return this.queue.length;
  }
  submit(
    e: { actor: string; eventId: string; text: unknown; at: number },
    now = Date.now(),
  ): CommandResult {
    const reject = (code: string, message: string): CommandResult => ({
      status: 'rejected',
      code,
      message,
    });
    if (
      !Number.isFinite(e.at) ||
      Math.abs(now - e.at) > 120000 ||
      !/^[a-zA-Z0-9:_-]{1,128}$/.test(e.actor) ||
      !/^[a-zA-Z0-9:_-]{1,128}$/.test(e.eventId)
    )
      return reject('invalid_event', 'Invalid or expired event.');
    for (const [k, t] of this.seen) if (now - t > 600000) this.seen.delete(k);
    for (const [k, t] of this.users) if (now - t > 600000) this.users.delete(k);
    const key = `${e.actor}:${e.eventId}`;
    if (this.seen.has(key)) return reject('duplicate', 'This event has already been handled.');
    this.tokens = Math.min(
      this.options.capacity,
      this.tokens + (Math.max(0, now - this.updated) * this.options.refillPerSecond) / 1000,
    );
    this.updated = now;
    if (this.tokens < 1) return reject('global_rate', 'Arena busy. Try again shortly.');
    this.tokens--;
    if (now - (this.users.get(e.actor) ?? -Infinity) < this.options.cooldown)
      return reject('cooldown', 'Wait 0.75 seconds between commands.');
    if (
      this.seen.size >= this.options.dedupLimit ||
      (this.users.size >= this.options.dedupLimit && !this.users.has(e.actor))
    )
      return reject('capacity', 'Protection cache full. Try later.');
    this.users.set(e.actor, now);
    this.seen.set(key, now);
    const command = parseCommand(e.text);
    if (!command)
      return reject(
        'invalid_command',
        'Use !help, !hint, !status, !score, !rotate A 15 or !vote shield. Rotations must be nonzero multiples of 5°, at most 45°.',
      );
    if (this.queue.length >= this.options.queueLimit)
      return reject('queue_full', 'Command queue full.');
    this.queue.push({ actor: e.actor, command, at: now });
    return {
      status: 'queued',
      code: 'queued',
      message: 'Validated and queued for the next server tick.',
    };
  }
  drain(now: number, apply: (actor: string, command: Command) => void, expired: () => void) {
    for (let i = 0; i < 8 && this.queue.length; i++) {
      const q = this.queue.shift()!;
      if (now - q.at > 2000) expired();
      else apply(q.actor, q.command);
    }
  }
  clearQueue() {
    this.queue = [];
  }
}
