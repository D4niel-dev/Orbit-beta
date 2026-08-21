// E2E: settings persistence — a setting written via dbSetSetting survives a
// relaunch and is applied by the app.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, setPersistedSettings } = require('./helpers');

test.describe('settings', () => {
  test('experimentalCompactSpacing persists across relaunch and is loaded into store state', async () => {
    const userDataDir = tmpUserDataDir('settings');

    // Launch #1: toggle a real setting key (exists in store.js defaults).
    let { app, page } = await launchApp(userDataDir);
    await setPersistedSettings(page, { experimentalCompactSpacing: true });
    await app.close();
    app = null;

    // Launch #2: same data dir — value must still be in the DB...
    ({ app, page } = await launchApp(userDataDir));
    const persisted = await page.evaluate(() =>
      window.orbitAPI.dbGetSetting('settings', {})
    );
    expect(persisted.experimentalCompactSpacing).toBe(true);

    // ...and applied into the live store state the app booted with.
    const applied = await page.evaluate(
      () => window.store.getState().settings.experimentalCompactSpacing
    );
    expect(applied).toBe(true);

    await app.close();
  });

  test('a setting changed via dbSetSetting is reflected by dbGetSetting in the same session', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('settings-live'));
    await setPersistedSettings(page, { experimentalCompactSpacing: true });

    const readBack = await page.evaluate(() =>
      window.orbitAPI.dbGetSetting('settings', {})
    );
    expect(readBack.experimentalCompactSpacing).toBe(true);

    await app.close();
  });
});