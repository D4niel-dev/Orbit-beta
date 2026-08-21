// E2E: chat folders (experimental) — enable via persisted settings, relaunch,
// then create a folder through the sidebar UI.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, setPersistedSettings } = require('./helpers');

test.describe('folders', () => {
  test('enabled folders feature: create a folder via the sidebar UI', async () => {
    const userDataDir = tmpUserDataDir('folders');

    // Launch #1: enable the experimental feature flags in the DB.
    let { app, page } = await launchApp(userDataDir);
    await setPersistedSettings(page, {
      enableExperimental: true,
      experimentalFolders: true
    });
    await app.close();
    app = null;

    // Launch #2: folders are enabled at boot → Folders nav button exists.
    ({ app, page } = await launchApp(userDataDir));
    const foldersNav = page.locator('#btn-nav-folders');
    await expect(foldersNav).toBeVisible();
    await foldersNav.click();

    // Folders rail renders with the "New Folder" button.
    const newFolderBtn = page.locator('#btn-new-folder');
    await expect(newFolderBtn).toBeVisible();
    await expect(page.locator('#friends-list-container')).toContainText('Folders (0)');

    // Create a folder via the inline input.
    await newFolderBtn.click();
    const folderInput = page.locator('#new-folder-input');
    await expect(folderInput).toBeVisible();
    const folderName = `QA Folder ${Date.now()}`;
    await folderInput.fill(folderName);
    await folderInput.press('Enter');

    // The folder row appears in the rail and the header count updates.
    const folderRow = page.locator('.folder-row', { hasText: folderName });
    await expect(folderRow).toBeVisible();
    await expect(folderRow.locator('.folder-row-name')).toHaveText(folderName);
    await expect(page.locator('#friends-list-container')).toContainText('Folders (1)');

    // It also persisted to the settings DB.
    const persistedFolders = await page.evaluate(() =>
      window.orbitAPI.dbGetSetting('settings', {}).chatFolders || []
    );
    expect(persistedFolders.some((f) => f.name === folderName)).toBe(true);

    await app.close();
  });
});