// E2E: message persistence — a DB-seeded message survives an app relaunch
// when the same user data dir is reused.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

test.describe('persistence', () => {
  test('a message added to the DB renders after relaunch with the same user-data-dir', async () => {
    const userDataDir = tmpUserDataDir('persist');
    const seedText = `persisted message ${Date.now()}`;

    // Launch #1: seed a message into the default Orbit Echo chat via the preload API.
    let { app, page } = await launchApp(userDataDir);
    await page.evaluate((text) => {
      window.orbitAPI.dbAddMessage('local-echo', {
        id: `e2e-seed-${Date.now()}`,
        sender: 'local-echo',
        text,
        timestamp: new Date().toISOString()
      });
    }, seedText);
    await app.close();
    app = null;

    // Launch #2: same user data dir — the message must render in the feed.
    ({ app, page } = await launchApp(userDataDir));
    const bubble = page.locator('.message-bubble', { hasText: seedText });
    await expect(bubble).toBeVisible();
    await expect(page.locator('#chat-message-feed .message-row')).toHaveCount(1);

    await app.close();
  });
});