import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { afterEach, it, expect, vi } from 'vitest';
import { TwitchBridge, allowedReconnect } from './bridge';
import { configFrom } from '../config';
const now = 1700000000000;
const conf = configFrom({
  TWITCH_CLIENT_ID: 'client',
  TWITCH_CLIENT_SECRET: 'fixture-only',
  TWITCH_CHANNEL_ID: '42',
});
const identity = { client_id: 'client', user_id: '42', scopes: ['user:read:chat'] };
class Socket extends EventEmitter {
  closed = false;
  close() {
    if (!this.closed) {
      this.closed = true;
      this.emit('close');
    }
  }
  terminate() {
    this.close();
  }
  frame(type: string, payload: unknown, at = now) {
    this.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          metadata: {
            message_id: 'meta',
            message_type: type,
            message_timestamp: new Date(at).toISOString(),
          },
          payload,
        }),
      ),
    );
  }
}
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const bridges: TwitchBridge[] = [];
afterEach(() => {
  bridges.splice(0).forEach((b) => b.disconnect());
  vi.useRealTimers();
});
function fixture(
  override?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined,
) {
  const sockets: Socket[] = [],
    status = vi.fn(),
    chat = vi.fn(),
    fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input),
        custom = await override?.(url, init);
      if (custom) return custom;
      if (url.endsWith('/token'))
        return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' });
      if (url.endsWith('/validate')) return Response.json(identity);
      return Response.json({ data: [{ id: 'sub' }] }, { status: 201 });
    });
  const socket = vi.fn((_url: string) => {
    const s = new Socket();
    sockets.push(s);
    return s as unknown as WebSocket;
  });
  const bridge = new TwitchBridge(conf, status, chat, {
    fetch: fetch as typeof globalThis.fetch,
    socket,
    now: () => now,
  });
  bridges.push(bridge);
  return { bridge, sockets, status, chat, fetch, socket };
}
async function connected(f: ReturnType<typeof fixture>) {
  await f.bridge.exchange('code');
  f.sockets[0]!.frame('session_welcome', {
    session: { id: 'session', keepalive_timeout_seconds: 10 },
  });
  await settle();
  expect(f.bridge.status.state).toBe('connected');
}
function payload(text = '!rotate A -15') {
  return {
    subscription: {
      type: 'channel.chat.message',
      version: '1',
      condition: { broadcaster_user_id: '42', user_id: '42' },
    },
    event: {
      broadcaster_user_id: '42',
      chatter_user_id: '123',
      message_id: 'chat-id',
      message: { text },
    },
  };
}
it('requests only the broadcaster read-chat scope with supplied state', () => {
  const f = fixture(),
    u = new URL(f.bridge.authorizeUrl('nonce'));
  expect(u.origin).toBe('https://id.twitch.tv');
  expect(u.searchParams.get('scope')).toBe('user:read:chat');
  expect(u.searchParams.get('state')).toBe('nonce');
  expect(u.searchParams.get('redirect_uri')).toBe(conf.TWITCH_REDIRECT_URI);
});
it('subscribes after welcome and routes only fresh commands for the bound channel', async () => {
  const f = fixture();
  await connected(f);
  const subscription = f.fetch.mock.calls.find((c) => String(c[0]).includes('/subscriptions'));
  expect(JSON.parse(String(subscription?.[1]?.body)).condition).toEqual({
    broadcaster_user_id: '42',
    user_id: '42',
  });
  const s = f.sockets[0]!;
  s.frame('notification', payload());
  s.frame('notification', payload('ordinary chat'));
  s.frame('notification', payload(), now - 121000);
  const wrong = payload();
  wrong.event.broadcaster_user_id = '99';
  s.frame('notification', wrong);
  s.frame('notification', {});
  await settle();
  expect(f.chat).toHaveBeenCalledExactlyOnceWith('123', 'chat-id', '!rotate A -15', now);
});
it('refreshes an expired token then revalidates', async () => {
  let validated = 0;
  const f = fixture((url) =>
    url.endsWith('/validate') && validated++ === 0 ? new Response('', { status: 401 }) : undefined,
  );
  await connected(f);
  expect(f.fetch.mock.calls.filter((c) => String(c[0]).endsWith('/token'))).toHaveLength(2);
  const refresh = f.fetch.mock.calls.filter((c) => String(c[0]).endsWith('/token'))[1]!;
  expect(String(refresh[1]?.body)).toContain('grant_type=refresh_token');
});
it.each([
  { ...identity, client_id: 'wrong' },
  { ...identity, user_id: '99' },
  { ...identity, scopes: [] },
])('rejects mismatched OAuth identity %j', async (i) => {
  const f = fixture((url) => (url.endsWith('/validate') ? Response.json(i) : undefined));
  await expect(f.bridge.exchange('code')).rejects.toThrow();
  expect(f.bridge.status.state).toBe('error');
  expect(f.socket).not.toHaveBeenCalled();
});
it('sanitizes token and subscription errors', async () => {
  const f = fixture((url) =>
    url.endsWith('/token') ? new Response('fixture-secret-leak', { status: 403 }) : undefined,
  );
  await expect(f.bridge.exchange('code')).rejects.toThrow('authorization failed');
  expect(JSON.stringify(f.bridge.status)).not.toContain('fixture-secret-leak');
  const g = fixture((url) =>
    url.includes('/subscriptions') ? new Response('', { status: 403 }) : undefined,
  );
  await g.bridge.exchange('code');
  g.sockets[0]!.frame('session_welcome', { session: { id: 's' } });
  await settle();
  expect(g.bridge.status.state).toBe('error');
  expect(g.sockets[0]!.closed).toBe(true);
});
it('migrates without resubscribing and closes the old socket only after welcome', async () => {
  const f = fixture();
  await connected(f);
  const old = f.sockets[0]!;
  old.frame('session_reconnect', {
    session: { id: 's', reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?session=migrate' },
  });
  await settle();
  expect(f.sockets).toHaveLength(2);
  expect(old.closed).toBe(false);
  f.sockets[1]!.frame('session_welcome', { session: { id: 'new', keepalive_timeout_seconds: 10 } });
  await settle();
  expect(old.closed).toBe(true);
  expect(f.bridge.status.state).toBe('connected');
  expect(f.fetch.mock.calls.filter((c) => String(c[0]).includes('/subscriptions'))).toHaveLength(1);
});
it('retries transport loss with a fresh subscription and cancels after disconnect', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await connected(f);
  f.sockets[0]!.close();
  expect(f.bridge.status.state).toBe('disconnected');
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.sockets).toHaveLength(2);
  f.sockets[1]!.frame('session_welcome', { session: { id: 'new' } });
  await settle();
  expect(f.bridge.status.state).toBe('connected');
  expect(f.fetch.mock.calls.filter((c) => String(c[0]).includes('/subscriptions'))).toHaveLength(2);
  f.bridge.disconnect();
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.sockets).toHaveLength(2);
});
it('terminates an expired keepalive connection', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await connected(f);
  await vi.advanceTimersByTimeAsync(12000);
  expect(f.sockets[0]!.closed).toBe(true);
  expect(f.bridge.status.state).toBe('disconnected');
});
it('fails closed on malformed frames, revocation and hostile migration URLs', async () => {
  for (const type of ['malformed', 'revocation', 'migration']) {
    const f = fixture();
    await connected(f);
    if (type === 'malformed') f.sockets[0]!.emit('message', Buffer.from('not json'));
    if (type === 'revocation') f.sockets[0]!.frame('revocation', {});
    if (type === 'migration')
      f.sockets[0]!.frame('session_reconnect', {
        session: { id: 's', reconnect_url: 'wss://evil.example/ws' },
      });
    await settle();
    expect(f.bridge.status.state).toBe('error');
    expect(f.sockets[0]!.closed).toBe(true);
  }
});
it.each([
  'ws://eventsub.wss.twitch.tv/ws',
  'wss://eventsub.wss.twitch.tv.evil.example/ws',
  'wss://user@eventsub.wss.twitch.tv/ws',
  'wss://eventsub.wss.twitch.tv:999/ws',
  'wss://eventsub.wss.twitch.tv/other',
  'https://127.0.0.1/ws',
  'not a url',
])('rejects reconnect target %s', (url) => expect(allowedReconnect(url)).toBe(false));
it('does not resurrect a connection after disconnect during token exchange', async () => {
  let finish!: (r: Response) => void;
  const f = fixture((url) =>
    url.endsWith('/token')
      ? new Promise<Response>((r) => {
          finish = r;
        })
      : undefined,
  );
  const pending = f.bridge.exchange('code');
  await settle();
  f.bridge.disconnect();
  finish(Response.json({ access_token: 'fixture', refresh_token: 'fixture' }));
  await pending;
  expect(f.bridge.status.state).toBe('disabled');
  expect(f.socket).not.toHaveBeenCalled();
});
it('explains missing configuration without exposing credentials', () => {
  const b = new TwitchBridge(configFrom({}), vi.fn(), vi.fn());
  bridges.push(b);
  expect(b.status.configured).toBe(false);
  expect(() => b.authorizeUrl('x')).toThrow('not configured');
});
