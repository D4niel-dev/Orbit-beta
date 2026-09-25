// E2E: sidebar navigation — DMs ↔ Groups tabs and the Folders view.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

test.describe('navigation', () => {
  let app;
  let page;

  test.beforeEach(async () => {
    ({ app, page } = await launchApp(tmpUserDataDir('nav')));
  });

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  test('boots into the DMs view with Orbit Echo in the list', async () => {
    await expect(page.locator('.tabs-container')).toBeVisible();
    const echoRow = page.locator('#friends-list-container .list-row[data-id="local-echo"]');
    await expect(echoRow).toBeVisible();
    await expect(echoRow.locator('.list-row-title')).toHaveText('Orbit Echo');
  });

  test('switches between Friends and Groups, and Friends opens the directory', async () => {
    // DMs view: friends list is rendered.
    await expect(page.locator('#friends-list-container .list-row[data-id="local-echo"]')).toBeVisible();

    // Left-clicking the Friends tab opens the friends directory modal. Located by
    // data-view: matching on the label is a trap now that "Friends" is a prefix of
    // other things.
    await page.locator('.tabs-container .tab[data-view="friends"]').click();
    await expect(page.locator('#all-friends-modal')).toBeVisible();
    await page.locator('#afm-close').click();
    await expect(page.locator('#all-friends-modal')).toHaveCount(0);

    // Groups tab → groups view ("+ Create Group" button).
    const groupsTab = page.locator('.tabs-container .tab[data-view="groups"]');
    await groupsTab.click();
    await expect(page.locator('#btn-create-group')).toBeVisible();
    await expect(page.locator('#friends-list-container .list-row[data-id="local-echo"]')).toHaveCount(0);

    // Back to Friends tab → friends list again. (The directory opens with it, so
    // dismiss it before the test ends.)
    await page.locator('.tabs-container .tab[data-view="friends"]').click();
    await expect(page.locator('#friends-list-container .list-row[data-id="local-echo"]')).toBeVisible();
    await page.locator('#afm-close').click();
    await expect(page.locator('#all-friends-modal')).toHaveCount(0);
  });

  test('switches to the Folders view and back via the left nav rail', async () => {
    // Enable the experimental flags in the live store (left rail re-renders on
    // settings change) and persist them.
    await page.evaluate(() => {
      const s = window.store.getState().settings;
      const next = { ...s, enableExperimental: true, experimentalFolders: true };
      window.store.setState({ settings: next });
      window.orbitAPI.dbSetSetting('settings', next);
    });

    // Folders nav button appears in the left rail.
    const foldersNav = page.locator('#btn-nav-folders');
    await expect(foldersNav).toBeVisible();
    await foldersNav.click();

    // Folders view: rail header renders inside the list container.
    await expect(page.locator('#friends-list-container')).toContainText('Folders (');
    await expect(page.locator('#btn-new-folder')).toBeVisible();

    // DM button escapes back to the friends view.
    await page.click('#btn-nav-dms');
    await expect(page.locator('#friends-list-container .list-row[data-id="local-echo"]')).toBeVisible();
  });
});