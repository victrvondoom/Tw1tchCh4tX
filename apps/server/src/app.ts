import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type WebSocket from 'ws';
import { ChatInputSchema, ControlSchema, LEVELS, type CommandResult } from '@prism/shared';
import { Game } from './game/engine';
import { ResultStore } from './db/store';
import { CommandGate } from './security/commands';
import { Sessions, constantEqual } from './security/sessions';
import { TwitchBridge } from './twitch/bridge';
import type { Config } from './config';
export async function createApp(config: Config, options: { tick?: boolean } = {}) {
  const app = Fastify({
      logger: false,
      bodyLimit: 2048,
      requestTimeout: 10000,
      connectionTimeout: 10000,
      trustProxy: false,
    }),
    store = new ResultStore(config.DATABASE_URL);
  let storageHealthy = true;
  const game = new Game((r) => {
      try {
        store.save(r);
      } catch {
        storageHealthy = false;
        game.event('danger', 'Result could not be saved. Check storage.');
      }
    }),
    gate = new CommandGate(),
    sessions = new Sessions(),
    salt = randomBytes(32),
    clients = new Map<WebSocket, { ip: string; alive: boolean }>();
  const report = (r: CommandResult) => {
    game.event(r.status === 'rejected' ? 'rejected' : 'queued', r.message);
    game.state.queueDepth = gate.depth;
  };
  const twitch = new TwitchBridge(
    config,
    (status) => {
      game.state.twitch = status;
      game.state.revision++;
    },
    (actor, id, text, at) =>
      report(
        gate.submit({
          actor: `twitch:${createHmac('sha256', salt).update(actor).digest('hex')}`,
          eventId: id,
          text,
          at,
        }),
      ),
  );
  game.state.twitch = twitch.status;
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 1200, timeWindow: '1 minute', cache: 10000 });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.WEB_ORIGIN.startsWith('https:') ? [] : null,
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(websocket, { options: { maxPayload: 1024 } });
  app.addHook('onRequest', async (req, reply) => {
    let host = '';
    try {
      host = new URL(`http://${req.headers.host}`).hostname;
    } catch {
      /* invalid host */
    }
    if (![new URL(config.WEB_ORIGIN).hostname, 'localhost', '127.0.0.1', '[::1]'].includes(host))
      return reply.code(403).send({ error: 'host', message: 'Unrecognized host.' });
    if (
      (req.headers.origin && req.headers.origin !== config.WEB_ORIGIN) ||
      (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.WEB_ORIGIN)
    )
      return reply.code(403).send({ error: 'origin', message: 'Exact allowed Origin required.' });
    reply
      .header('Cache-Control', 'no-store')
      .header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: 'validation', message: 'Invalid request. Check fields and ranges.' });
    const code =
        error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : 500,
      status = typeof code === 'number' && code >= 400 && code < 500 ? code : 500;
    return reply.code(status).send({
      error: status === 429 ? 'rate_limit' : 'request_failed',
      message:
        status === 429 ? 'Too many requests. Try shortly.' : 'Request could not be completed.',
    });
  });
  const operator = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!sessions.valid(req.cookies.prism_session))
      return reply
        .code(401)
        .send({ error: 'unauthorized', message: 'Unlock streamer controls first.' });
  };
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/ready', async (_req, reply) => {
    let ready = false;
    try {
      ready = storageHealthy && store.healthy();
    } catch {
      /* unhealthy */
    }
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' });
  });
  app.get('/api/session', async (req) => ({
    operator: sessions.valid(req.cookies.prism_session),
    keyRequired: !!config.OPERATOR_KEY,
  }));
  app.post(
    '/api/session',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = z
          .object({ key: z.string().max(256).optional() })
          .strict()
          .parse(req.body),
        local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
      if (
        config.OPERATOR_KEY
          ? !constantEqual(body.key ?? '', config.OPERATOR_KEY)
          : !local || config.NODE_ENV === 'production'
      )
        return reply
          .code(401)
          .send({ error: 'unauthorized', message: 'Streamer key missing or incorrect.' });
      if (!sessions.valid(req.cookies.prism_session))
        reply.setCookie('prism_session', sessions.create(), {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.WEB_ORIGIN.startsWith('https:'),
          path: '/',
          maxAge: 28800,
        });
      return { operator: true };
    },
  );
  app.delete('/api/session', { preHandler: operator }, async (req, reply) => {
    sessions.remove(req.cookies.prism_session!);
    reply.clearCookie('prism_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/state', async () => game.state);
  app.get('/api/levels', async () => LEVELS);
  app.get('/api/history', async () => ({
    history: store.history(),
    leaderboard: { demo: store.leaderboard('demo'), twitch: store.leaderboard('twitch') },
  }));
  app.delete('/api/history', { preHandler: operator }, async () => {
    store.clear();
    storageHealthy = true;
    return { ok: true };
  });
  app.post(
    '/api/control',
    { preHandler: operator, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const c = ControlSchema.parse(req.body),
        r = game.control(c);
      if (r.status === 'accepted' && c.type !== 'aim') gate.clearQueue();
      return reply.code(r.status === 'rejected' ? 409 : 200).send(r);
    },
  );
  app.post(
    '/api/chat',
    { preHandler: operator, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      if (game.state.mode === 'twitch')
        return reply.code(409).send({
          error: 'live_round',
          message: 'Disconnect Twitch and start a new demo round to use simulated chat.',
        });
      const b = ChatInputSchema.parse(req.body),
        r = gate.submit({
          actor: `demo:${req.cookies.prism_session!}`,
          eventId: b.eventId,
          text: b.text,
          at: Date.now(),
        });
      report(r);
      return reply.code(r.status === 'rejected' ? 422 : 202).send(r);
    },
  );
  app.post('/auth/twitch/start', { preHandler: operator }, async (req, reply) => {
    if (!twitch.status.configured)
      return reply.code(503).send({
        error: 'not_configured',
        message: 'Configure Twitch client ID and secret on the server.',
      });
    return { url: twitch.authorizeUrl(sessions.beginOAuth(req.cookies.prism_session!)) };
  });
  app.get('/auth/twitch/callback', async (req, reply) => {
    const q = z
      .object({
        state: z.string().max(128),
        code: z.string().max(512).optional(),
        error: z.string().max(128).optional(),
      })
      .parse(req.query);
    if (!sessions.consumeOAuth(req.cookies.prism_session, q.state))
      return reply
        .code(400)
        .send({ error: 'oauth_state', message: 'Invalid or expired authorization. Start again.' });
    if (q.error || !q.code) return reply.redirect('/?twitch=denied');
    try {
      await twitch.exchange(q.code);
      return reply.redirect('/?twitch=authorized');
    } catch {
      return reply.redirect('/?twitch=error');
    }
  });
  app.post('/auth/twitch/disconnect', { preHandler: operator }, async () => {
    twitch.disconnect();
    gate.clearQueue();
    return { ok: true };
  });
  app.get(
    '/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        if (req.headers.origin !== config.WEB_ORIGIN)
          return reply.code(403).send({ error: 'origin' });
        if (clients.size >= 64 || [...clients.values()].filter((c) => c.ip === req.ip).length >= 8)
          return reply.code(429).send({ error: 'connection_limit' });
      },
    },
    (socket, req) => {
      clients.set(socket, { ip: req.ip, alive: true });
      socket.send(JSON.stringify({ type: 'state', state: game.state }));
      socket.on('message', () =>
        socket.close(1008, 'Read-only stream. Use authenticated HTTP controls.'),
      );
      socket.on('pong', () => {
        const c = clients.get(socket);
        if (c) c.alive = true;
      });
      socket.on('error', () => socket.terminate());
      socket.on('close', () => clients.delete(socket));
    },
  );
  const tick = () => {
    gate.drain(
      Date.now(),
      (a, c) => game.command(a, c),
      () => game.event('rejected', 'Queued command expired.'),
    );
    game.state.queueDepth = gate.depth;
    game.advance(100);
    const payload = JSON.stringify({ type: 'state', state: game.state });
    for (const s of clients.keys())
      if (s.bufferedAmount > 262144) s.terminate();
      else if (s.readyState === 1) s.send(payload);
  };
  const timer = options.tick === false ? null : setInterval(tick, 100);
  timer?.unref();
  const heartbeat = setInterval(() => {
    for (const [s, c] of clients)
      if (!c.alive) s.terminate();
      else {
        c.alive = false;
        s.ping();
      }
  }, 30000);
  heartbeat.unref();
  if (existsSync(resolve('dist/web/index.html'))) {
    await app.register(staticFiles, { root: resolve('dist/web'), wildcard: false });
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' &&
      !req.url.startsWith('/api/') &&
      !req.url.startsWith('/auth/') &&
      !req.url.includes('.')
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'not_found', message: 'Route not found.' }),
    );
  }
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
    clearInterval(heartbeat);
    twitch.disconnect();
    for (const s of clients.keys()) s.terminate();
    store.close();
  });
  return { app, game, gate, store, twitch, tick };
}
