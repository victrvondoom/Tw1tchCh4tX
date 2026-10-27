# HTTP and WebSocket API

All API responses use JSON. Mutation requests require exact `Origin: WEB_ORIGIN`; authenticated mutations require the `prism_session` cookie. Do not put operator keys or Twitch tokens into query strings. JSON body size is 2KiB. Generic errors expose a short `error` code and `message`, never a stack trace.

| Route                          | Access               | Meaning                                                     |
| ------------------------------ | -------------------- | ----------------------------------------------------------- |
| `GET /api/health`              | Public               | Process liveness                                            |
| `GET /api/ready`               | Public               | Storage readiness; 503 after result write failure           |
| `GET /api/session`             | Public               | `{operator, keyRequired}`                                   |
| `POST /api/session`            | Exact origin         | `{key?}` unlock; loopback auto-unlock only in nonproduction |
| `DELETE /api/session`          | Operator             | Lock this browser                                           |
| `GET /api/state`               | Public               | Full validated game snapshot                                |
| `GET /api/levels`              | Public               | Three authored mission definitions                          |
| `POST /api/control`            | Operator             | `start`, `reset`, `next`, `pause`, `resume`, `aim`          |
| `POST /api/chat`               | Operator, demo round | `{text, eventId: UUID}`; 202 queued or 422 rejected         |
| `GET /api/history`             | Public               | Last 100 results and separate top-ten demo/Twitch arrays    |
| `DELETE /api/history`          | Operator             | Erase current stored result history                         |
| `POST /auth/twitch/start`      | Operator             | `{url}` OAuth consent URL or 503 unconfigured               |
| `GET /auth/twitch/callback`    | Bound OAuth state    | Exchange code then redirect to fixed app URL                |
| `POST /auth/twitch/disconnect` | Operator             | Forget tokens, close transport, clear queue                 |
| `GET /ws`                      | Exact origin         | Read-only WebSocket; incoming message closes with 1008      |

Control examples: `{"type":"start","level":1}`, `{"type":"aim","angle":0}`, `{"type":"pause"}`. Start accepts mission 1–3; aim accepts finite −180…180°. Unknown fields are rejected. State-invalid controls return 409. Demo chat during a Twitch-labeled round returns 409. Unauthenticated writes return 401; Origin/Host failure returns 403; malformed bodies 400; body limit 413; HTTP rate limit 429.

`/ws` sends `{"type":"state","state":...}` on connection and every 100ms. `GameStateSchema` is the canonical contract, including phase, revision, round/mode, geometry, charge/captures, threats/votes, limits, events, result and Twitch status. Renderers validate frames before use. A newly connected reader receives current state, not command replay. Transport state never grants operator privileges.
