// Shared helpers for Orbit Electron E2E tests.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron: electron } = require('@playwright/test');

const DESKTOP_DIR = path.resolve(__dirname, '../..');

// Fresh, per-test user data dir (SQLite DB + electron-store live under userData).
function tmpUserDataDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `orbit-e2e-${label}-`));
}

// Launch the Electron app against the given user data dir.
// The app's own Electron binary is used — no Playwright browsers involved.
// extraArgs are appended as Chromium switches (e.g. fake media flags for the
// voice recorder spec). Passed per-test rather than via a second Playwright
// project, because the launch happens here in the helper, not in the config.
async function launchApp(userDataDir, extraArgs = []) {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, ...extraArgs],
    cwd: DESKTOP_DIR
  });
  const page = await app.firstWindow();
  // Wait for the renderer to finish booting (chat panel rendered for Orbit Echo).
  await page.waitForSelector('#chat-input', { timeout: 30000 });
  // The startup tutorial overlay can appear ~1s after boot and blocks pointer
  // events over the whole window. Dismiss it deterministically: mark it
  // completed in the store (identical to pressing "Skip") and click Skip if the
  // overlay already rendered.
  await page.evaluate(() => {
    const s = window.store.getState().settings;
    window.store.setState({ settings: { ...s, tutorialCompleted: true } });
    if (window.orbitAPI) window.orbitAPI.dbSetSetting('settings', { ...s, tutorialCompleted: true });
  });
  const skip = page.locator('.tutorial-btn-skip');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
  await page.locator('#tutorial-overlay').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  return { app, page };
}

// Read the persisted settings object from the SQLite DB (renderer context).
function getPersistedSettings(page) {
  return page.evaluate(() => window.orbitAPI.dbGetSetting('settings', {}));
}

// Merge + persist the full settings object (renderer context).
function setPersistedSettings(page, patch) {
  return page.evaluate((p) => {
    const current = window.orbitAPI.dbGetSetting('settings', {});
    const next = { ...current, ...p };
    window.orbitAPI.dbSetSetting('settings', next);
    return next;
  }, patch);
}

// Seed N fake friends into the store (persisted via dbSaveFriend) so the
// create-group friend picker has real entries to overflow and select.
function seedFriends(page, count) {
  return page.evaluate((n) => {
    const peers = [];
    for (let i = 1; i <= n; i++) {
      peers.push({
        userId: 'seed-peer-' + i,
        username: 'Seed Peer ' + i,
        usertag: String(1000 + i),
        status: 'online',
        avatar: null,
        bio: '',
        ip: null,
        publicKey: null,
        lastSeen: Date.now()
      });
    }
    peers.forEach((p) => window.store.addOrUpdatePeer(p));
    return peers.length;
  }, count);
}

module.exports = { DESKTOP_DIR, tmpUserDataDir, launchApp, getPersistedSettings, setPersistedSettings, seedFriends };