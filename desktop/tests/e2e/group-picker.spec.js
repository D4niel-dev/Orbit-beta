// E2E: Orbit "Create New Group" modal — friend list overflow, footer visibility,
// scroll-to-reveal, member selection, and group creation in the chat list.
// Selectors: Groups tab (.tab in #middle-sidebar-container), #btn-create-group,
// #group-name-input, .group-member-cb, #btn-confirm-group, .list-row[data-type="group"].
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedFriends } = require('./helpers');

const FRIEND_COUNT = 10;

test.describe('group-picker', () => {
  let app;
  let page;

  test.beforeEach(async () => {
    ({ app, page } = await launchApp(tmpUserDataDir('group-picker')));
    await seedFriends(page, FRIEND_COUNT);
  });

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  test('create-group modal: overflow, footer, scroll reveals friends, select 3, create', async () => {
    // Open the Groups tab (empty state renders the wide "+ Create Group" button)
    await page.locator('#middle-sidebar-container .tab', { hasText: 'Groups' }).click();
    await expect(page.locator('#btn-create-group')).toBeVisible();
    await page.click('#btn-create-group');

    // Modal is open with all 10 seeded friends in the picker
    await expect(page.locator('#group-name-input')).toBeVisible();
    await expect(page.locator('.friend-picker-option')).toHaveCount(FRIEND_COUNT);

    // The friend list scroll container (parent of the picker options) overflows
    const friendList = page.locator('.friend-picker-option').first().locator('..');
    const metrics = await friendList.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    // Footer (name field + create/cancel buttons) is visible next to the list
    await expect(page.locator('#group-name-input')).toBeVisible();
    await expect(page.locator('#btn-confirm-group')).toBeVisible();
    await expect(page.locator('#btn-cancel-group')).toBeVisible();

    // The last friend is clipped by the overflow until the list is scrolled
    const lastOption = page.locator('.friend-picker-option', { hasText: 'Seed Peer ' + FRIEND_COUNT });
    await expect(lastOption).not.toBeInViewport();
    await friendList.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(lastOption).toBeInViewport();

    // Select 3 friends, name the group, create it
    await page.locator('.group-member-cb').nth(0).check();
    await page.locator('.group-member-cb').nth(4).check();
    await page.locator('.group-member-cb').nth(8).check();
    const groupName = 'E2E Squad ' + Date.now();
    await page.fill('#group-name-input', groupName);
    await page.click('#btn-confirm-group');

    // Modal closes and the new group appears in the Groups chat list
    await expect(page.locator('#group-name-input')).toHaveCount(0);
    const groupRow = page.locator('#friends-list-container .list-row[data-type="group"]', { hasText: groupName });
    await expect(groupRow).toBeVisible();
  });
});