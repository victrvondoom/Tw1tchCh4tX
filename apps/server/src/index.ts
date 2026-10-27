import { configFrom } from './config';
import { createApp } from './app';
const config = configFrom(process.env),
  { app } = await createApp(config);
try {
  await app.listen({ host: config.SERVER_HOST, port: config.SERVER_PORT });
  console.info(
    `Prism X listening on port ${config.SERVER_PORT}. Demo needs no Twitch credentials.`,
  );
} catch {
  console.error('Startup failed. Check port, configuration and storage.');
  await app.close();
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close();
  });
