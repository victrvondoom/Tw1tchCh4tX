import WebSocket from 'ws';
import { z } from 'zod';
import type { TwitchStatus } from '@prism/shared';
import type { Config } from '../config';
const Token = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) }),
  Identity = z.object({ client_id: z.string(), user_id: z.string(), scopes: z.array(z.string()) });
const Frame = z.object({
  metadata: z.object({
    message_id: z.string(),
    message_type: z.string(),
    message_timestamp: z.string(),
  }),
  payload: z.record(z.string(), z.unknown()),
});
const Session = z.object({
  id: z.string(),
  keepalive_timeout_seconds: z.number().min(1).max(600).nullable().optional(),
  reconnect_url: z.string().nullable().optional(),
});
const Notification = z.object({
  subscription: z.object({
    type: z.literal('channel.chat.message'),
    version: z.literal('1'),
    condition: z.object({ broadcaster_user_id: z.string(), user_id: z.string() }),
  }),
  event: z.object({
    broadcaster_user_id: z.string(),
    chatter_user_id: z.string().regex(/^\d+$/),
    message_id: z.string().max(128),
    message: z.object({ text: z.string().max(500) }),
  }),
});
export function allowedReconnect(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'wss:' &&
      u.hostname === 'eventsub.wss.twitch.tv' &&
      !u.port &&
      !u.username &&
      !u.password &&
      u.pathname === '/ws' &&
      !u.hash
    );
  } catch {
    return false;
  }
}
export class TwitchBridge {
  status: TwitchStatus;
  private tokens: z.infer<typeof Token> | null = null;
  private userId = '';
  private generation = 0;
  private retries = 0;
  private sockets = new Set<WebSocket>();
  private current: WebSocket | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private validation: ReturnType<typeof setInterval> | null = null;
  private refreshPromise: Promise<void> | null = null;
  constructor(
    private config: Config,
    private onStatus: (s: TwitchStatus) => void,
    private onChat: (actor: string, id: string, text: string, at: number) => void,
    private deps = {
      fetch: globalThis.fetch,
      socket: (url: string) => new WebSocket(url, { maxPayload: 65536 }),
      now: Date.now,
    },
  ) {
    this.status = {
      state: 'disabled',
      detail: 'Demo mode · Twitch is not connected',
      configured: !!(config.TWITCH_CLIENT_ID && config.TWITCH_CLIENT_SECRET),
    };
  }
  private set(state: TwitchStatus['state'], detail: string) {
    this.status = { ...this.status, state, detail };
    this.onStatus(this.status);
  }
  authorizeUrl(state: string) {
    if (!this.status.configured) throw new Error('Twitch is not configured.');
    const u = new URL('https://id.twitch.tv/oauth2/authorize');
    u.search = new URLSearchParams({
      client_id: this.config.TWITCH_CLIENT_ID,
      redirect_uri: this.config.TWITCH_REDIRECT_URI,
      response_type: 'code',
      scope: 'user:read:chat',
      state,
      force_verify: 'true',
    }).toString();
    return u.toString();
  }
  private request(url: string, init: RequestInit = {}) {
    return this.deps.fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  }
  private async grant(params: Record<string, string>) {
    const r = await this.request('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.config.TWITCH_CLIENT_ID,
        client_secret: this.config.TWITCH_CLIENT_SECRET,
        ...params,
      }),
    });
    if (!r.ok) throw new Error('Twitch authorization failed.');
    return Token.parse(await r.json());
  }
  async exchange(code: string) {
    this.disconnect();
    const generation = this.generation;
    try {
      const tokens = await this.grant({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.TWITCH_REDIRECT_URI,
      });
      if (generation !== this.generation) return;
      this.tokens = tokens;
      await this.validate();
      if (generation !== this.generation) return;
      this.retries = 0;
      this.connect();
      this.validation = setInterval(
        () => {
          void this.validate().catch(() => {
            if (generation === this.generation)
              this.fail('Twitch authorization expired. Reconnect.');
          });
        },
        55 * 60 * 1000,
      );
      this.validation.unref();
    } catch {
      if (generation !== this.generation) return;
      this.fail('Twitch authorization failed. Check credentials, channel and consent.');
      throw new Error(this.status.detail);
    }
  }
  private async refresh() {
    if (!this.refreshPromise) {
      const generation = this.generation;
      const promise = (async () => {
        if (!this.tokens) throw new Error('Missing authorization');
        const tokens = await this.grant({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refresh_token,
        });
        if (generation === this.generation) this.tokens = tokens;
      })();
      this.refreshPromise = promise;
      void promise
        .finally(() => {
          if (this.refreshPromise === promise) this.refreshPromise = null;
        })
        .catch(() => {});
    }
    await this.refreshPromise;
  }
  private async authed(url: string, init: RequestInit = {}, validation = false) {
    const generation = this.generation;
    const call = () =>
      this.request(url, {
        ...init,
        headers: {
          ...init.headers,
          'Client-Id': this.config.TWITCH_CLIENT_ID,
          Authorization: `${validation ? 'OAuth' : 'Bearer'} ${this.tokens?.access_token ?? ''}`,
        },
      });
    let r = await call();
    if (r.status === 401 && generation === this.generation) {
      await this.refresh();
      if (generation !== this.generation) throw new Error('Cancelled');
      r = await call();
    }
    return r;
  }
  async validate() {
    const generation = this.generation,
      r = await this.authed('https://id.twitch.tv/oauth2/validate', {}, true);
    if (generation !== this.generation) return;
    if (!r.ok) throw new Error('Invalid authorization');
    const i = Identity.parse(await r.json());
    if (generation !== this.generation) return;
    if (
      i.client_id !== this.config.TWITCH_CLIENT_ID ||
      !i.scopes.includes('user:read:chat') ||
      (this.config.TWITCH_CHANNEL_ID && i.user_id !== this.config.TWITCH_CHANNEL_ID)
    )
      throw new Error('Wrong account or scope');
    this.userId = i.user_id;
  }
  private connect(url = 'wss://eventsub.wss.twitch.tv/ws', migration = false) {
    if (!this.tokens) return;
    const generation = this.generation,
      previous = this.current;
    let socket: WebSocket;
    try {
      socket = this.deps.socket(url);
    } catch {
      this.retry();
      return;
    }
    this.sockets.add(socket);
    if (!migration) this.current = socket;
    this.set(
      'connecting',
      migration ? 'Migrating Twitch connection…' : 'Connecting to Twitch EventSub…',
    );
    let heartbeat: ReturnType<typeof setTimeout> | undefined,
      timeout = 15000;
    const arm = () => {
      if (heartbeat) {
        clearTimeout(heartbeat);
        this.timers.delete(heartbeat);
      }
      heartbeat = setTimeout(() => socket.terminate(), timeout);
      this.timers.add(heartbeat);
      heartbeat.unref();
    };
    arm();
    let serial = Promise.resolve();
    socket.on('message', (data) => {
      serial = serial
        .then(async () => {
          if (generation !== this.generation) return;
          const f = Frame.parse(JSON.parse(data.toString()));
          arm();
          const type = f.metadata.message_type;
          if (type === 'session_welcome') {
            const s = Session.parse(f.payload.session);
            timeout = (s.keepalive_timeout_seconds ?? 10) * 1000 + 2000;
            arm();
            if (!migration) {
              const r = await this.authed('https://api.twitch.tv/helix/eventsub/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'channel.chat.message',
                  version: '1',
                  condition: { broadcaster_user_id: this.userId, user_id: this.userId },
                  transport: { method: 'websocket', session_id: s.id },
                }),
              });
              if (!r.ok) throw new Error('Subscription failed');
            }
            if (generation !== this.generation) return;
            this.current = socket;
            this.retries = 0;
            if (migration && previous !== socket) previous?.close();
            this.set('connected', 'Live Twitch chat · read-only broadcaster scope');
          } else if (type === 'notification') {
            const p = Notification.safeParse(f.payload);
            if (!p.success) return;
            const at = Date.parse(f.metadata.message_timestamp),
              { event, subscription } = p.data;
            if (
              !Number.isFinite(at) ||
              Math.abs(this.deps.now() - at) > 120000 ||
              event.broadcaster_user_id !== this.userId ||
              subscription.condition.broadcaster_user_id !== this.userId ||
              subscription.condition.user_id !== this.userId
            )
              return;
            if (event.message.text.trim().startsWith('!'))
              this.onChat(event.chatter_user_id, event.message_id, event.message.text, at);
          } else if (type === 'session_reconnect') {
            const target = Session.parse(f.payload.session).reconnect_url;
            if (!target || !allowedReconnect(target)) throw new Error('Invalid reconnect');
            if (this.sockets.size < 2) this.connect(target, true);
          } else if (type === 'revocation')
            this.fail('Twitch subscription revoked. Reconnect after restoring permission.');
        })
        .catch(() => {
          if (generation === this.generation)
            this.fail('Twitch connection could not be validated. Reconnect.');
        });
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      if (heartbeat) {
        clearTimeout(heartbeat);
        this.timers.delete(heartbeat);
      }
      this.sockets.delete(socket);
      if (generation !== this.generation) return;
      if (migration && this.current !== socket && this.status.state === 'connecting') {
        this.fail('Twitch migration interrupted. Reconnect.');
        return;
      }
      if (this.current === socket) {
        this.current = null;
        this.retry();
      }
    });
  }
  private retry() {
    if (!this.tokens) return;
    if (++this.retries > 8) {
      this.fail('Twitch reconnect limit reached. Reconnect manually.');
      return;
    }
    this.set('disconnected', 'Twitch disconnected. Retrying; missing events are not replayed.');
    const t = setTimeout(
      () => {
        this.timers.delete(t);
        if (this.status.state === 'disconnected') this.connect();
      },
      Math.min(30000, 500 * 2 ** this.retries),
    );
    this.timers.add(t);
    t.unref();
  }
  private fail(message: string) {
    this.disconnect();
    this.set('error', message);
  }
  disconnect() {
    this.generation++;
    this.tokens = null;
    this.current = null;
    this.refreshPromise = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.validation) clearInterval(this.validation);
    this.validation = null;
    for (const s of this.sockets) s.terminate();
    this.sockets.clear();
    this.set('disabled', 'Demo mode · Twitch is not connected');
  }
}
