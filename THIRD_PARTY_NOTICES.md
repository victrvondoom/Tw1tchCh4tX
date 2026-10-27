# Third-party notices

The application source is MIT licensed. Dependencies retain their own licenses; consult the installed package LICENSE files and package-lock.json for the exact dependency graph. Major components include React, Vite, Fastify, Zod, ws, Vitest, Playwright, TypeScript and MediaPipe Tasks Vision.

MediaPipe source/packages are distributed under their upstream license, including Apache-2.0 notices where applicable. The optional face landmark model is downloaded from Google's official versioned model endpoint and checked against a pinned SHA-256; it is not committed or included in the source ZIP. Review Google's model distribution terms and notices before redistributing model assets. [MediaPipe repository](https://github.com/google-ai-edge/mediapipe) · [Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)

Twitch and OpenAI names identify integrations and implementation tooling. Their trademarks remain with their owners. This project is not affiliated with or endorsed by either company. The app uses no copied brand logo assets or third-party illustration files; its prism mark and arena are code-drawn.

The local browser used for validation is an external Chrome for Testing runtime and is not part of the source distribution. CI installs its own Playwright-managed browser.
