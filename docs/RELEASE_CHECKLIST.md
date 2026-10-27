# Release checklist

- [ ] `npm ci` succeeds from the committed lockfile on Node 24.x.
- [ ] `npm run harness` and `npm audit` pass on the release commit.
- [ ] GitHub Actions runs successfully after repository write access is available.
- [ ] Source contains no `.env`, tokens, database, camera data or generated gaze binaries.
- [ ] Actual Twitch broadcaster/viewer, refresh, revocation and reconnect acceptance recorded.
- [ ] Real-camera five-point calibration, permission denial, stop and tab-hide tested.
- [ ] Native OBS transparency/framing/reconnect tested on intended streaming machine.
- [ ] HTTPS ingress, private operator key, exact origin, persistent disk and readiness checked.
- [ ] Container built and run if that deployment path is selected.
- [ ] Backup restore and compatible rollback rehearsed.
- [ ] Keyboard/zoom/mobile and second browser checked manually.
- [ ] README/status reflect exact verification limits and current commit.
- [ ] Organizer-specific eligibility/submission requirements verified if entering an event.
- [ ] Operator explicitly approves public deployment before launch.

These are release gates, not claims of completed external verification. Local evidence is in IMPLEMENTATION_STATUS.md.
