import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_HOST: z.string().default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('./data/prism-x.db'),
  OPERATOR_KEY: z.string().default(''),
  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),
  TWITCH_CHANNEL_ID: z.string().regex(/^\d*$/).default(''),
  TWITCH_REDIRECT_URI: z.string().url().default('http://localhost:5173/auth/twitch/callback'),
});
export function configFrom(env: NodeJS.ProcessEnv) {
  const c = schema.parse(env),
    o = new URL(c.WEB_ORIGIN),
    r = new URL(c.TWITCH_REDIRECT_URI),
    local = ['localhost', '127.0.0.1', '[::1]'].includes(o.hostname);
  if (!['http:', 'https:'].includes(o.protocol) || o.origin !== c.WEB_ORIGIN)
    throw new Error('WEB_ORIGIN must be an exact HTTP(S) origin.');
  if (
    c.NODE_ENV === 'production' &&
    (c.OPERATOR_KEY.length < 32 || (!local && o.protocol !== 'https:'))
  )
    throw new Error(
      'Production requires a 32+ character operator key and HTTPS outside localhost.',
    );
  if (c.OPERATOR_KEY && c.OPERATOR_KEY.length < 32) throw new Error('Operator key too short.');
  if (!c.OPERATOR_KEY && !['localhost', '127.0.0.1', '::1'].includes(c.SERVER_HOST))
    throw new Error('Non-loopback binding requires operator key.');
  if (r.origin !== o.origin || r.pathname !== '/auth/twitch/callback' || r.search || r.hash)
    throw new Error('Callback must equal WEB_ORIGIN/auth/twitch/callback.');
  return c;
}
export type Config = ReturnType<typeof configFrom>;
