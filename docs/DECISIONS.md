# Design decisions

1. **Local demo first.** The complete game runs without external accounts, webcam, paid APIs or runtime OpenAI access. This makes judging and regression testing reproducible.
2. **One authoritative process.** Fastify owns the simulation, votes and results. Browser state is display-only. This favors understandable integrity over premature distributed rooms.
3. **EventSub read-only chat.** OAuth requests only broadcaster read-chat access. The app never posts messages or asks for moderation permissions. Twitch setup still requires live acceptance.
4. **Bounded logical simulation.** Fifty-millisecond steps and pure ray math make rules reproducible. Timer stalls slow game time; cross-host competitive fairness is out of scope.
5. **SQLite anonymous summaries.** Durable local results need no external database service. Retention is bounded and mode-separated; no global leaderboard credibility is implied.
6. **Local experimental gaze.** Optional MediaPipe landmarks avoid uploading camera frames. A simple calibrated iris mapping is less robust than dedicated gaze hardware; keyboard/mouse always remain available.
7. **Transparent HUD only.** OBS uses a read-only state view, while gameplay is captured separately. No operator secrets enter overlay URLs.
8. **Offline threat simulation.** Phishing/burst/login are typed mission events that change integrity and points. No live exploit or attack subsystem is needed.
9. **Verification transparency.** Protocol mocks, browser automation and manual integration checks are reported separately. Build success is not proof of live OAuth, gaze accuracy or OBS compatibility.
