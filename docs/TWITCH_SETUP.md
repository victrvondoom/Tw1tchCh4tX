# Twitch setup

The adapter uses **Authorization Code OAuth** and **EventSub WebSockets**, not an IRC bot or browser-held token. The broadcaster signs in to their own channel; the only requested scope is `user:read:chat`. The app reads chat and does not send Twitch messages, moderate users, or run viewer-supplied code.

1. Register an application in the Twitch developer console. Add the exact redirect URI, e.g. `http://localhost:5173/auth/twitch/callback` for the default demo.
2. Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in server `.env`. Optionally restrict consent with the numeric `TWITCH_CHANNEL_ID`.
3. Set `WEB_ORIGIN` and `TWITCH_REDIRECT_URI` to the same browser origin; the callback path must be `/auth/twitch/callback`. Restart the server.
4. Unlock streamer controls, open settings, select **Connect Twitch**, and consent as the intended broadcaster.
5. Wait for **CONNECTED**. Start a new mission; its badge must say **TWITCH ROUND**. Send `!status`, `!rotate A -15`, and a defense vote from actual channel viewers.
6. Disconnect in settings to forget credentials. Start a new round to return to demo mode.

State is cryptographically random, bound to the operator session, expires in five minutes and is consumed once. Tokens stay in server memory. The server checks token client, user and scope, validates every 55 minutes, refreshes on HTTP 401, and subscribes to `channel.chat.message` version 1 only after welcome. A restart requires new authorization.

Reconnect migration accepts only `wss://eventsub.wss.twitch.tv/ws` with no credentials, custom port or fragment. Migration keeps the old socket until the new welcome and does not create another subscription. Ordinary transport loss uses bounded backoff and a fresh subscription. Missing chat is not replayed; event IDs prevent duplicates entering the game. Revocation and malformed protocol state fail closed with a reconnect message.

Local tests mock Twitch token, validation, subscription, migration and refresh behavior. **Live credentials and Twitch acceptance have not been verified.** Token revocation, reconnect while streaming and simultaneous viewers are required manual launch checks. Never include OAuth callback query strings or tokens in screenshots, logs, issues or reverse-proxy access logs.

Official references consulted for the adapter:

- [Chat authentication](https://dev.twitch.tv/docs/chat/authenticating/)
- [OAuth grants](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Token refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/)
- [Token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/)
- [EventSub WebSocket handling](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
- [EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
