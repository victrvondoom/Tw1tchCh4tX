import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  retries: 0,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3100',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args:
        process.env.PLAYWRIGHT_SINGLE_PROCESS === '1' ? ['--single-process', '--no-zygote'] : [],
    },
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3100/api/ready',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      NODE_ENV: 'test',
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: '3100',
      WEB_ORIGIN: 'http://localhost:3100',
      TWITCH_REDIRECT_URI: 'http://localhost:3100/auth/twitch/callback',
      DATABASE_URL: ':memory:',
      OPERATOR_KEY: '',
    },
  },
});
