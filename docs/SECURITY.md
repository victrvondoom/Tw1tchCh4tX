# Security design and threat model

Assets: streamer controls, Twitch credentials, game integrity, browser camera privacy, and local result storage. Threats: malicious chat, cross-origin writes, replayed events, flood traffic, forged voters, malformed Twitch frames, credential leakage and runaway tracing. The application does not offer public account registration or multi-tenant isolation.

| Boundary            | Implemented control                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Operator HTTP       | Random 256-bit server session, HttpOnly/SameSite cookie, 8h expiry, 32-session cap                   |
| Hosted unlock       | Private 32+ character operator key; constant-time equal-length comparison; 10 requests/minute        |
| Request origin      | Exact `WEB_ORIGIN` for mutations; Host validation; no permissive CORS; proxy trust disabled          |
| Request parsing     | Strict Zod control/chat contracts; 2KiB body limit; angle and command ranges                         |
| Chat intake         | Allowlist grammar; NFKC normalization; control-character rejection; no evaluation or shell calls     |
| Abuse limits        | 750ms actor cooldown, 24-token burst, 12 tokens/sec, queue 64, drain 8/tick, 2s queue expiry         |
| Replay and identity | Event age ±2min; actor/event key dedup for 10min; cache cap 10,000; pseudonymous Twitch actors       |
| Ballots             | One immutable vote per actor per wave; maximum 10,000 ballots                                        |
| WebSocket           | Read-only; exact Origin; 1KiB incoming frame; 64 total/8 per IP; heartbeat; 256KiB buffered-send cap |
| Twitch transport    | Fixed outbound hosts; 64KiB frame limit; 8s HTTP timeout; allowlisted migration; bounded retries     |
| Browser             | React text escaping, CSP, frame embedding denied, camera self-only, microphone/geolocation disabled  |
| Persistence         | Prepared SQL, validated result records, bounded retention, no raw chat or identities                 |

The demo creates one actor from the server-side operator session and never trusts client actor IDs. Twitch accounts are HMAC-pseudonymized with a random per-process salt. Usernames and raw non-command chat are not broadcast. Accepted/rejected events contain controlled summaries rather than raw submitted input. The event feed retains only 40 records.

Production must use HTTPS outside loopback and an operator key. The default unkeyed development unlock is restricted to a loopback client and loopback binding. Origin/Host checks complement authentication; they are not replacements for network access controls. Reverse proxies must preserve Host, Origin and WebSocket upgrade, redact OAuth query strings and enforce their own connection/body limits.

Residual limitations: authorized operators can reset rounds; multiple operator browsers share one arena; distributed abuse across many IPs is not handled by a process-local limiter; local scores are not trusted global rankings; a compromised host can access memory and the database. Secure delete cannot promise erasure from SSDs, snapshots or backups. No live penetration test, external audit, production load certification or secret-scanner completeness is claimed.

See root [SECURITY.md](../SECURITY.md) for reporting. Simulated waves only change game state. There are no attack traffic generators, scanning endpoints, shell execution, payload execution or credential-harvesting mechanics.
