// E2E: Orbit Echo local chat — send messages, assert bubbles render.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

test.describe('echo-chat', () => {
  let app;
  let page;

  test.beforeEach(async () => {
    ({ app, page } = await launchApp(tmpUserDataDir('echo')));
  });

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  test('typing into #chat-input and pressing Enter renders a message bubble', async () => {
    const text = `hello orbit ${Date.now()}`;
    await page.fill('#chat-input', text);
    await page.press('#chat-input', 'Enter');

    // Own messages render as .message-own rows with a .message-bubble inside.
    const bubble = page.locator('.message-own .message-bubble', { hasText: text });
    await expect(bubble).toBeVisible();
    await expect(page.locator('#chat-message-feed .message-own')).toHaveCount(1);
  });

  test('a second message appends below the first', async () => {
    const firstText = `first ${Date.now()}`;
    const secondText = `second ${Date.now()}`;

    await page.fill('#chat-input', firstText);
    await page.press('#chat-input', 'Enter');
    await expect(page.locator('.message-own .message-bubble', { hasText: firstText })).toBeVisible();

    await page.fill('#chat-input', secondText);
    await page.press('#chat-input', 'Enter');
    await expect(page.locator('.message-own .message-bubble', { hasText: secondText })).toBeVisible();

    // Both own rows exist, and the second one comes after the first in DOM order.
    const ownRows = page.locator('#chat-message-feed .message-own');
    await expect(ownRows).toHaveCount(2);
    const id1 = await page.locator('.message-own', { hasText: firstText }).getAttribute('data-msg-id');
    const id2 = await page.locator('.message-own', { hasText: secondText }).getAttribute('data-msg-id');
    const order = await ownRows.evaluateAll((rows) => rows.map((r) => r.getAttribute('data-msg-id')));
    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(order.indexOf(id2)).toBeGreaterThan(order.indexOf(id1));
  });
});