import { randomBytes, timingSafeEqual } from 'node:crypto';
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export class Sessions {
  private entries = new Map<
    string,
    { expires: number; oauth?: { state: string; expires: number } }
  >();
  create(now = Date.now()) {
    for (const [k, s] of this.entries) if (s.expires <= now) this.entries.delete(k);
    if (this.entries.size >= 32) throw new Error('Session capacity reached');
    const id = randomBytes(32).toString('hex');
    this.entries.set(id, { expires: now + 28800000 });
    return id;
  }
  valid(id: string | undefined, now = Date.now()) {
    if (!id) return false;
    const s = this.entries.get(id);
    if (!s) return false;
    if (s.expires <= now) {
      this.entries.delete(id);
      return false;
    }
    return true;
  }
  remove(id: string) {
    this.entries.delete(id);
  }
  beginOAuth(id: string, now = Date.now()) {
    if (!this.valid(id, now)) throw new Error('Unauthorized');
    const state = randomBytes(32).toString('hex');
    this.entries.get(id)!.oauth = { state, expires: now + 300000 };
    return state;
  }
  consumeOAuth(id: string | undefined, state: string, now = Date.now()) {
    if (!id || !this.valid(id, now)) return false;
    const s = this.entries.get(id)!,
      o = s.oauth;
    delete s.oauth;
    return !!o && o.expires > now && constantEqual(state, o.state);
  }
}
