# Soft launch

Begin with a private rehearsal using the streamer test script. Assign one operator and one observer; choose a single broadcaster channel and a small invited group. Set an explicit end time and avoid promising competitive ranking or gaze accuracy.

Entry criteria: local harness passes; hosted HTTPS and exact-origin controls pass; Twitch consent/revocation/reconnect are observed with real accounts; camera stop/denial and native OBS transparency work; backup restoration and key rotation are rehearsed. Missing credentials are a blocker to live-mode acceptance, not to the offline demo.

During the session, observe accepted/rejected command counts, queue depth, stream disconnects, frame responsiveness, target-solving time and viewer comprehension. Collect opt-in written feedback without raw chat, OAuth details or camera recordings. The current app does not implement analytics; take minimal manual notes or add privacy-reviewed operational metrics later.

Stop if controls become unauthorized, tokens appear in output, camera tracks fail to stop, the overlay exposes private information, or readiness fails. Disconnect Twitch, stop camera, pause/end the round and take the instance offline if needed. Review anonymous results and a redacted defect log before expanding audience size.
