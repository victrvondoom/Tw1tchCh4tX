# Contributing

Use Node 24.x, install with `npm ci`, copy `.env.example`, and run the local demo before changing behavior. Keep physics pure and deterministic. Author game rules on the server; use shared Zod schemas at external boundaries. Keep credentials and camera frames out of client bundles, logs, screenshots and commits.

Add meaningful tests for a changed invariant or external boundary. Include replay, malformed-input and failure cases for new chat commands. Add a physical solution test for each new mission. Avoid snapshot-only tests that merely repeat implementation. Use injectable transport/time for network tests and real temporary SQLite files for persistence tests.

Run `npm run harness` and `npm audit`. Describe the trigger, changed behavior, validation and limits in pull requests. Include real screenshots for UI changes and a brief reproduction path for defects. Record architecture/security tradeoffs in DECISIONS.md. Do not make public deployments or send external chat messages as a side effect of tests.

See CODE_OF_CONDUCT.md and SECURITY.md. Dependency changes must update the lockfile and retain third-party notices. Pin reviewed CI actions by full commit SHA.
