# Privacy and retention

| Data                           | Location and lifetime                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| Camera frames / iris landmarks | Browser memory during explicit gaze use; not uploaded or recorded          |
| Calibration / gaze point       | Browser memory until camera stop, tab hiding, reload or component cleanup  |
| Emitter angle                  | Current shared server state and read-only snapshots; not saved in SQLite   |
| Twitch OAuth tokens            | Server memory until disconnect, failure or process exit                    |
| OAuth state                    | Operator session memory, single-use, five-minute expiry                    |
| Operator session               | HttpOnly cookie + server memory, eight-hour expiry                         |
| Twitch identity                | Per-process HMAC pseudonym in protection/round caches; no username storage |
| Protection caches              | Bounded to 10,000 entries, expire after ten minutes (pruned on intake)     |
| Current participants / ballots | Bounded active-round memory; cleared on reset/new round                    |
| Event feed                     | Last 40 controlled summaries in process memory; no raw chat                |
| Results                        | Latest 100 anonymous summaries in local SQLite until replaced/deleted      |

A result contains round ID, mission, mode, outcome, score, elapsed time, moves, defenses, contributor count, achievements and completion timestamp. Public history/overlay readers can see these anonymous summaries. They cannot delete them or control play. Settings → archive → clear history requires a separate confirmation and operator session; it deletes current rows, checkpoints WAL and vacuums the database. Backups must be deleted separately.

The camera requires explicit browser permission. The UI exposes stop controls during calibration and active use; hiding the tab stops tracks. Late permission responses after cancellation are also stopped. Low-quality tracking clears the gaze marker and keeps mouse/keyboard controls available. Calibration is a heuristic, not a measurement of attention or a biometric identity service. No facial identity matching is implemented.

Gaze assets download from Google's official model endpoint only when the operator runs `npm run gaze:assets`; the model checksum is pinned. At runtime, inference assets are same-origin and there are no analytics, advertising SDKs or third-party fonts. Twitch connection makes server-to-Twitch requests only after consent. Infrastructure logs outside this app are the deployer's responsibility.
