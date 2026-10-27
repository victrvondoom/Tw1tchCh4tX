# Ten-minute streamer rehearsal

1. Start from a clean local install. Confirm no Twitch credentials and no camera are needed to reach **First light**.
2. Disable mouse aim, use Aim 0°, rotate A −15°, then vote quarantine. Confirm a target locks after 0.8s, the wave resolves, the win appears and the archive contains one demo result.
3. Advance to Chain reaction. Test keyboard arrows, pause/resume, reset, hints and exhausted moves. Try `!rotate A 999`, duplicate event IDs via the API test fixture, and fast commands; rejection should not mutate mirrors.
4. Play Zero trust: aim 0°, A −45°, B −45°, C 45°. Vote quarantine, shield, verify in the respective windows. Also test no-vote loss. Check score and achievements against the gameplay guide.
5. Configure actual Twitch credentials privately. Connect as broadcaster, start a new round and have two different viewers submit commands and votes. Confirm duplicate votes are rejected, demo input is disabled, mode stays Twitch after disconnect, and reauthorization works after token revocation.
6. Download local gaze assets. Deny permission once; mouse/keyboard must still work. Grant permission, calibrate all five points with a steady head and test sensitivity. Try glasses/lighting/head movement. Use Stop camera and hide the tab; confirm the browser camera indicator turns off. Record observed accuracy, not assumed precision.
7. Add the transparent OBS HUD over a real scene at 1920 × 1080. Toggle HUD/events, restart the server and verify reconnection. Confirm the operator key, consent screens and camera image are absent from the stream.
8. Test mobile viewing and keyboard-only navigation. Confirm focus remains visible and Escape closes settings. Check at 200% browser zoom and with reduced motion enabled.
9. Lock the operator browser and try a control. It must stay disabled. Reauthenticate, delete history via the explicit confirmation and verify the archive is empty after restart.
10. Record browser/OS, OBS version, webcam, viewer count, defects and follow-up owners. Do not claim live acceptance until these observations exist.
