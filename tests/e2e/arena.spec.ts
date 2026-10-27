import { test as base, expect } from '@playwright/test';
// The constrained execution environment may require one fresh browser per test.
// Normal local and CI runs use Playwright's standard isolated-context fixture.
const test =
  process.env.PLAYWRIGHT_SINGLE_PROCESS === '1'
    ? base.extend({
        context: async ({ playwright, baseURL, viewport }, use) => {
          const browser = await playwright.chromium.launch({
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
            args: ['--single-process', '--no-zygote'],
          });
          const context = await browser.newContext({ baseURL, viewport });
          try {
            await use(context);
          } finally {
            await browser.close();
          }
        },
      })
    : base;
test('play, solve, vote, persist, advance, pause, and view the OBS overlay', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play demo ↗' })).toBeEnabled();
  await page.screenshot({ path: 'docs/screenshots/landing.png', fullPage: true });
  await page.getByRole('button', { name: 'Play demo ↗' }).click();
  await expect(page.getByRole('heading', { name: 'First light', exact: true })).toBeVisible();
  await page.getByLabel('Mouse aim').uncheck();
  await page.getByRole('button', { name: 'Aim 0°', exact: true }).click();
  await page.getByLabel('Chat command', { exact: true }).fill('!rotate A -15');
  await page.getByRole('button', { name: 'Send chat command' }).click();
  await expect(page.getByTestId('mirror-A')).toHaveText('-45°');
  await expect(page.getByRole('button', { name: 'quarantine 0' })).toBeEnabled();
  await page.getByRole('button', { name: 'quarantine 0' }).click();
  await expect(page.getByRole('log')).toContainText('Defense vote locked: quarantine');
  await page.screenshot({ path: 'docs/screenshots/arena.png', fullPage: true });
  await expect(page.getByRole('region', { name: 'Mission results' })).toContainText(
    'You kept the light alive.',
    { timeout: 15000 },
  );
  await page.getByRole('button', { name: 'Score archive', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'won', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Next mission →' }).click();
  await expect(page.getByRole('heading', { name: 'Chain reaction', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ⅱ Pause', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mission paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume mission', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mission paused' })).toHaveCount(0);
  const overlay = await context.newPage();
  await overlay.goto('/overlay?hud=1&events=1');
  await expect(overlay.getByLabel('OBS overlay')).toContainText('Chain reaction');
  await expect(overlay.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(overlay.getByRole('button')).toHaveCount(0);
  await overlay.screenshot({ path: 'docs/screenshots/overlay.png', omitBackground: true });
  await overlay.close();
  expect(errors).toEqual([]);
});
test('select a mission, reject malformed chat, reset and recover from denied camera access', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => {
          throw new DOMException('Denied', 'NotAllowedError');
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore missions →' }).click();
  await page.getByRole('button', { name: 'Play Zero trust →' }).click();
  await expect(page.getByRole('heading', { name: 'Zero trust', exact: true })).toBeVisible();
  await page.getByLabel('Mouse aim').uncheck();
  await page.getByLabel('Chat command', { exact: true }).fill('!rotate A 999');
  await page.getByRole('button', { name: 'Send chat command' }).click();
  await expect(page.getByRole('log')).toContainText('Rotations must be');
  await expect(page.getByTestId('mirror-A')).toHaveText('-15°');
  await page.getByRole('button', { name: '↻ Reset', exact: true }).click();
  await expect(page.getByTestId('score')).toHaveText('0000');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('button', { name: 'Connect Twitch ↗' })).toBeDisabled();
  await page.getByRole('button', { name: 'Enable camera & calibrate' }).click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByText(/Camera permission denied/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop camera now' }).click();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Aim 0°', exact: true }).click();
  await expect(page.getByLabel('Emitter angle')).toHaveValue('0');
});
test('mobile layout stays within viewport and dialogs close with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play demo ↗' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Play demo ↗' }).click();
  await expect(page.getByRole('heading', { name: 'First light', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
test('spectator controls stay locked and transport failure is visible', async ({ page }) => {
  await page.goto('/?play=1');
  await expect(page.getByRole('button', { name: 'Unlock controls', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aim 0°', exact: true })).toBeDisabled();
  await page.routeWebSocket('**/ws', (ws) => ws.close());
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'Connecting to the game server' }),
  ).toBeVisible();
});
