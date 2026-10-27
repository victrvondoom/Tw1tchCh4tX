# Troubleshooting

| Symptom                          | Check                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Connecting banner                | Start both dev processes with `npm run dev`; use http://localhost:5173                       |
| Origin rejected                  | Match browser host, scheme and port to `WEB_ORIGIN`; do not mix localhost and 127.0.0.1      |
| Production startup fails         | Node 24.x, 32+ character operator key, HTTPS origin outside localhost, exact callback        |
| Unlock fails                     | Correct private key; loopback auto-unlock only in nonproduction; rate limit is 10/min        |
| Mirror command rejected          | A–C in current mission, nonzero multiple of 5°, at most ±45°, move budget, 750ms cooldown    |
| Vote rejected                    | Active wave, playing phase, no earlier vote by that viewer, available queue capacity         |
| Target uncharged                 | Beam must continuously touch receiver for 800ms; avoid moving the pointer across canvas      |
| Twitch stays disabled            | Configure server ID/secret and restart; consent as intended broadcaster                      |
| Consent returns error            | Exact registered callback, valid client/account/scope, one-time state and operator session   |
| Demo chat disabled               | Twitch mode is fixed per round; disconnect and start a new demo round                        |
| Camera unavailable               | HTTPS/localhost, browser permission, `npm run gaze:assets` before build, working webcam      |
| Poor gaze                        | Recalibrate with steady head and better light; adjust sensitivity; use mouse or keyboard     |
| Camera stops when switching tabs | Intentional privacy behavior; re-enable in the visible operator tab                          |
| OBS is blank                     | Same origin and running server; check HUD/events toggles; source is only the transparent HUD |
| Score missing                    | Round must finish; check `/api/ready`, disk permissions and retention of latest 100          |
| Tests cannot launch browser      | Install Playwright Chromium; see optional executor flags in TESTING.md                       |

Node may warn about SQLite on some supported versions; the project intentionally uses Node's built-in SQLite instead of a native npm addon. Dependency advisory results are time-sensitive; rerun the audit before release. Report reproducible bugs with redacted browser/server details and no credentials.
