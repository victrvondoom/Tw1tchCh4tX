import { afterEach, beforeEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { createApp } from './app';
import { configFrom } from './config';
import { GameStateSchema } from '@prism/shared';
let env: Awaited<ReturnType<typeof createApp>>,
  cookie = '';
const origin = 'http://localhost:5173',
  headers = { origin, host: 'localhost:5173' };
beforeEach(async () => {
  env = await createApp(configFrom({ NODE_ENV: 'test', DATABASE_URL: ':memory:' }), {
    tick: false,
  });
  await env.app.ready();
  cookie = '';
});
afterEach(async () => {
  await env.app.close();
});
async function login() {
  const r = await env.app.inject({
    method: 'POST',
    url: '/api/session',
    headers,
    payload: {},
    remoteAddress: '127.0.0.1',
  });
  expect(r.statusCode).toBe(200);
  cookie = String(r.headers['set-cookie']).split(';')[0]!;
  expect(r.headers['set-cookie']).toContain('HttpOnly');
}
function post(url: string, payload: unknown) {
  return env.app.inject({
    method: 'POST',
    url,
    headers: { ...headers, cookie },
    payload: payload as object,
  });
}
it('serves validated public state, health, history and missions', async () => {
  for (const url of ['/api/health', '/api/ready', '/api/levels', '/api/history', '/api/session'])
    expect((await env.app.inject({ url, headers })).statusCode).toBe(200);
  const r = await env.app.inject({ url: '/api/state', headers });
  expect(GameStateSchema.safeParse(r.json()).success).toBe(true);
  expect(r.headers['content-security-policy']).toContain("default-src 'self'");
  expect(r.headers['permissions-policy']).toContain('microphone=()');
  expect(r.headers['cache-control']).toBe('no-store');
});
it('requires authenticated exact-origin writes and validates ranges', async () => {
  expect((await post('/api/control', { type: 'start', level: 1 })).statusCode).toBe(401);
  await login();
  expect((await post('/api/control', { type: 'start', level: 1 })).statusCode).toBe(200);
  expect((await post('/api/control', { type: 'aim', angle: 999 })).statusCode).toBe(400);
  expect((await post('/api/control', { type: 'aim', angle: 0, admin: true })).statusCode).toBe(400);
  expect(
    (
      await env.app.inject({
        method: 'POST',
        url: '/api/control',
        headers: { host: 'localhost', cookie },
        payload: { type: 'reset' },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await env.app.inject({ url: '/api/state', headers: { host: 'evil.example' } })).statusCode,
  ).toBe(403);
  expect(
    (
      await env.app.inject({
        url: '/api/state',
        headers: { ...headers, origin: 'https://evil.example' },
      })
    ).statusCode,
  ).toBe(403);
  expect((await post('/api/control', { type: 'next' })).statusCode).toBe(409);
});
it('queues validated demo chat, rejects replay and prevents actor forgery', async () => {
  await login();
  await post('/api/control', { type: 'start', level: 1 });
  const eventId = randomUUID(),
    r = await post('/api/chat', { eventId, text: '!rotate A -15' });
  expect(r.statusCode).toBe(202);
  expect(env.game.state.level.mirrors[0]?.angle).toBe(-30);
  env.tick();
  expect(env.game.state.level.mirrors[0]?.angle).toBe(-45);
  expect((await post('/api/chat', { eventId, text: '!rotate A -15' })).json().code).toBe(
    'duplicate',
  );
  expect(
    (await post('/api/chat', { eventId: randomUUID(), text: '!help', actor: 'admin' })).statusCode,
  ).toBe(400);
  expect(
    (await post('/api/chat', { eventId: randomUUID(), text: 'x'.repeat(3000) })).statusCode,
  ).toBe(413);
});
it('clears queued work on reset and rejects simulated chat in a Twitch round', async () => {
  await login();
  await post('/api/control', { type: 'start', level: 1 });
  await post('/api/chat', { eventId: randomUUID(), text: '!rotate A -15' });
  await post('/api/control', { type: 'reset' });
  env.tick();
  expect(env.game.state.level.mirrors[0]?.angle).toBe(-30);
  env.game.state.twitch = { state: 'connected', configured: true, detail: 'test' };
  await post('/api/control', { type: 'reset' });
  expect((await post('/api/chat', { eventId: randomUUID(), text: '!help' })).statusCode).toBe(409);
});
it('requires authentication to erase history or log out', async () => {
  expect(
    (await env.app.inject({ method: 'DELETE', url: '/api/history', headers })).statusCode,
  ).toBe(401);
  await login();
  env.game.control({ type: 'start', level: 1 });
  env.game.advance(75000);
  expect(env.store.history()).toHaveLength(1);
  expect(
    (
      await env.app.inject({
        method: 'DELETE',
        url: '/api/history',
        headers: { ...headers, cookie },
      })
    ).statusCode,
  ).toBe(200);
  expect(env.store.history()).toEqual([]);
  expect(
    (
      await env.app.inject({
        method: 'DELETE',
        url: '/api/session',
        headers: { ...headers, cookie },
      })
    ).statusCode,
  ).toBe(200);
  expect((await post('/api/control', { type: 'reset' })).statusCode).toBe(401);
});
it('reports unconfigured Twitch and rejects unbound callbacks', async () => {
  await login();
  expect((await post('/auth/twitch/start', {})).statusCode).toBe(503);
  expect(
    (
      await env.app.inject({
        url: '/auth/twitch/callback?state=fake&code=fake',
        headers: { ...headers, cookie },
      })
    ).statusCode,
  ).toBe(400);
  expect((await post('/auth/twitch/disconnect', {})).statusCode).toBe(200);
});
it('enforces read-only WebSocket state and exact Origin on a real socket', async () => {
  const address = await env.app.listen({ port: 0, host: '127.0.0.1' }),
    url = address.replace('http:', 'ws:') + '/ws';
  const ws = new WebSocket(url, { origin });
  const first = await new Promise<string>((resolve, reject) => {
    ws.once('message', (m) => resolve(m.toString()));
    ws.once('error', reject);
  });
  expect(JSON.parse(first).type).toBe('state');
  const closed = new Promise<number>((resolve) => ws.once('close', resolve));
  ws.send(JSON.stringify({ type: 'start', level: 3 }));
  expect(await closed).toBe(1008);
  const invalid = new WebSocket(url);
  const status = await new Promise<number>((resolve, reject) => {
    invalid.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode!);
      invalid.terminate();
    });
    invalid.once('error', () => {});
    invalid.once('open', () => reject(new Error('Unexpected connection')));
  });
  expect(status).toBe(403);
});
it('requires the operator key when configured and refuses nonlocal automatic unlock', async () => {
  expect(
    (
      await env.app.inject({
        method: 'POST',
        url: '/api/session',
        headers,
        payload: {},
        remoteAddress: '203.0.113.10',
      })
    ).statusCode,
  ).toBe(401);
  const keyed = await createApp(
    configFrom({ NODE_ENV: 'test', DATABASE_URL: ':memory:', OPERATOR_KEY: 'k'.repeat(32) }),
    { tick: false },
  );
  try {
    expect(
      (
        await keyed.app.inject({
          method: 'POST',
          url: '/api/session',
          headers,
          payload: { key: 'wrong' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await keyed.app.inject({
          method: 'POST',
          url: '/api/session',
          headers,
          payload: { key: 'k'.repeat(32) },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await keyed.app.close();
  }
});
