// E2E: Orbit voice memo recorder — denied-mic regression + fake-media happy path.
// Launch args: the app's own Electron binary is launched by helpers.launchApp, so
// the fake-media Chromium switches are passed per-test via launchApp's extraArgs
// (no second Playwright project needed; workers:1 + TCP port 46000 unchanged).
// Selectors: #btn-mic, #voice-rec-bar, #voice-rec-timer, #voice-rec-meter,
// .voice-rec-meter-bar, #btn-voice-stop, #file-preview-area, .oap-placeholder.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

const FAKE_MEDIA_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const DENIED_SETTLE_MS = 1500;

test.describe('voice-recorder', () => {
  test('denied mic: voice bar never sticks and mic icon resets', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('voice-denied'));
    try {
      // ENVIRONMENT NOTE: this dev machine has a real mic that Electron grants
      // by default (no permission handler in main.js) — the recording actually
      // starts here without fake flags, and Chromium's --deny-permission-prompts
      // is NOT honored by Electron. So the denial path is forced deterministically
      // by stubbing getUserMedia to reject like a denied permission
      // (NotAllowedError) — no fake-media flags involved. The app's real catch
      // path runs: _hideVoiceBar() + _setMicRecordingUI(false).
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(
          Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
        );
      });

      // Quick click < 300ms starts recording; poll ~1.5s for the rejection to settle.
      await page.click('#btn-mic');
      await page.waitForTimeout(DENIED_SETTLE_MS);

      await expect(page.locator('#voice-rec-bar')).not.toBeVisible();
      // _setMicRecordingUI(false) restores <i data-lucide="mic"> → .lucide-mic
      await expect(page.locator('#btn-mic .lucide-mic')).toBeVisible();
      await expect(page.locator('#btn-mic .lucide-square')).toHaveCount(0);
    } finally {
      await app.close().catch(() => {});
    }
  });

  test('fake media: record, timer advances, 32 meter bars, stop sends audio bubble', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('voice-fake'), FAKE_MEDIA_ARGS);
    try {
      await page.click('#btn-mic');
      await expect(page.locator('#voice-rec-bar')).toBeVisible();

      // Timer advances past 0:00 (updates every 250ms)
      await expect.poll(
        () => page.locator('#voice-rec-timer').textContent(),
        { timeout: 5000 }
      ).not.toBe('0:00');

      // Meter is rendered with exactly 32 bars (see _showVoiceBar)
      await expect(page.locator('#voice-rec-meter .voice-rec-meter-bar')).toHaveCount(32);

      await page.click('#btn-voice-stop');

      // Bar hides immediately on stop…
      await expect(page.locator('#voice-rec-bar')).not.toBeVisible();
      // …the clip is staged into the preview area…
      await expect(page.locator('#file-preview-area')).toBeVisible();
      // …send it. Audio/video sends hit the app's "Unstable Transfer Warning"
      // guard first — proceed past it, then the own audio bubble (.oap-placeholder)
      await page.click('#btn-send');
      const proceed = page.locator('.btn-av-warning-proceed');
      if (await proceed.isVisible().catch(() => false)) {
        await proceed.click();
      }
      await expect(page.locator('.message-own .oap-placeholder')).toBeVisible();
    } finally {
      await app.close().catch(() => {});
    }
  });
});