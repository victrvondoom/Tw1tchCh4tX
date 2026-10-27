import { it, expect } from 'vitest';
import { configFrom } from './config';
it('defaults to a loopback demo', () => {
  const c = configFrom({});
  expect(c.SERVER_HOST).toBe('127.0.0.1');
  expect(c.SERVER_PORT).toBe(3000);
  expect(c.OPERATOR_KEY).toBe('');
});
it.each([
  { NODE_ENV: 'production' },
  { OPERATOR_KEY: 'short' },
  { SERVER_HOST: '0.0.0.0' },
  { WEB_ORIGIN: 'http://localhost:5173/path' },
  { TWITCH_REDIRECT_URI: 'https://evil.example/auth/twitch/callback' },
  { TWITCH_REDIRECT_URI: 'http://localhost:5173/auth/twitch/callback?extra=1' },
  {
    NODE_ENV: 'production',
    OPERATOR_KEY: 'x'.repeat(32),
    WEB_ORIGIN: 'http://example.test',
    TWITCH_REDIRECT_URI: 'http://example.test/auth/twitch/callback',
  },
])('rejects insecure config %j', (env) => expect(() => configFrom(env)).toThrow());
it('accepts a keyed HTTPS deployment', () =>
  expect(
    configFrom({
      NODE_ENV: 'production',
      SERVER_HOST: '0.0.0.0',
      OPERATOR_KEY: 'x'.repeat(32),
      WEB_ORIGIN: 'https://arena.example',
      TWITCH_REDIRECT_URI: 'https://arena.example/auth/twitch/callback',
    }).NODE_ENV,
  ).toBe('production'));

it('rejects a non-HTTP browser origin', () => {
  expect(() =>
    configFrom({
      WEB_ORIGIN: 'ftp://localhost',
      TWITCH_REDIRECT_URI: 'ftp://localhost/auth/twitch/callback',
    }),
  ).toThrow('HTTP(S)');
});
