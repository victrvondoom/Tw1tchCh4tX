# Deployment and operations

No public deployment has been made. The app needs a long-running Node 24.x process, writable persistent disk and WebSocket-capable HTTPS ingress. GitHub Pages or a static CDN alone cannot host the authoritative server.

## Environment

| Variable               | Development default                        | Production requirement                             |
| ---------------------- | ------------------------------------------ | -------------------------------------------------- |
| `NODE_ENV`             | development                                | production                                         |
| `SERVER_HOST`          | 127.0.0.1                                  | Bind as appropriate; nonloopback requires key      |
| `SERVER_PORT`          | 3000                                       | Internal listening port                            |
| `WEB_ORIGIN`           | http://localhost:5173                      | Exact HTTPS browser origin, no trailing slash/path |
| `DATABASE_URL`         | ./data/prism-x.db                          | Persistent SQLite file path                        |
| `OPERATOR_KEY`         | empty                                      | Private random string, at least 32 characters      |
| `TWITCH_CLIENT_ID`     | empty                                      | Optional integration ID                            |
| `TWITCH_CLIENT_SECRET` | empty                                      | Optional server-only secret                        |
| `TWITCH_CHANNEL_ID`    | empty                                      | Optional numeric broadcaster lock                  |
| `TWITCH_REDIRECT_URI`  | http://localhost:5173/auth/twitch/callback | Exact origin plus callback path                    |

Generate an operator key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, keep it private and provide it through a secret manager or untracked `.env`. Never paste it into the README or overlay URL. Local production testing may use `http://localhost:3000` with matching callback, but still requires a key.

Run `npm ci`, optionally `npm run gaze:assets`, `npm run build`, then `npm start`. The process serves `dist/web` and the API on the same port. Terminate with SIGINT/SIGTERM for cleanup. Serve camera use over HTTPS or localhost. Reverse proxy Host/Origin and WebSocket Upgrade headers without rewriting them. Do not log OAuth callback query strings. Apply edge rate/connection limits; `trustProxy` is deliberately false, so proxied clients may share an IP quota.

## Container

A Dockerfile is included; Docker was not available for runtime verification. Build with `docker build -t prism-x .`. Run with a private environment file, port 3000 and a persistent volume mounted at `/app/data`; the process runs as the unprivileged node user. Ensure the volume is writable by that user. The image defaults to production and cannot start with an empty operator key. Docker uses a Node 24 major image tag; pin a reviewed digest in your release environment.

## Release and recovery

Run the full harness, dependency audit and manual acceptance before rollout. Back up the database with SQLite's backup tooling or stop the process and copy the DB plus any WAL files together. Do not copy a live database file alone. Keep secrets separate. Restore into a staging instance first. Schema version 1 refuses a newer schema; rollback code only with a compatible backup. Do not downgrade a newer database in place.

`/api/health` reports liveness; `/api/ready` checks storage and sticky result-write failure. Watch process restarts, readiness, disk usage, HTTP 429 rates and Twitch disconnect reports without collecting raw chat or tokens. Active rounds and in-memory authorization are lost on restart. Reauthorize Twitch afterward. The app retains at most 100 result rows, but backups/logs need an independent retention policy.

One process owns one arena. Multiple replicas are unsupported. A public launch should begin with a private rehearsal and limited viewers, then measured load testing. No throughput or uptime certification is claimed.
