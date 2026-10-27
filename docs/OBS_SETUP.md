# OBS overlay

Run the application, open **OBS overlay**, choose HUD/events and copy the generated URL. Add an OBS **Browser Source** at 1920 × 1080 using that exact origin. Default development URL: `http://localhost:5173/overlay?hud=1&events=1`. Production normally uses the public HTTPS origin or local server port 3000.

The overlay is a transparent HUD with mission name, score, integrity, target count, mode, phase and the latest three events. Capture the gameplay canvas separately with a window/browser source if desired. HUD and events can each be hidden using `hud=0` or `events=0`. No operator key belongs in the URL. The overlay is read-only and reconnects to current state after a lost connection.

Use a separate OBS source instance from the operator browser. Keep the server running. Match `WEB_ORIGIN` exactly, including port and `localhost` versus `127.0.0.1`, otherwise the WebSocket is rejected. A remote OBS machine cannot use the streamer's loopback address; configure an authenticated HTTPS installation first.

Browser automation confirms a transparent body, rendered live state, and no control buttons. **Native OBS capture has not been tested here.** Before streaming, verify alpha compositing over a scene, 1920 × 1080 framing, reconnect after server restart, source visibility transitions and the absence of private browser UI. Disable camera on tab hide is intentional; keep gaze active in the visible operator browser, never the overlay.
