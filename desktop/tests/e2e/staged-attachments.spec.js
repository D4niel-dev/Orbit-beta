// E2E: the staged-attachment strip above the composer.
//
// This is the desktop half of v0.8.6 item 6. Three things were wrong and two of
// them are the same shape as the mobile's were:
//
//   - a staged image was a bare <img>, so a photo that took a moment to decode
//     was an empty 64px box with nothing happening in it;
//   - ⚠ the REMOVE BUTTON was never rendered. The document-level handler for
//     `.btn-remove-file` has existed the whole time — it splices the file out and
//     revokes the blob — so the handler matched nothing and a staged file could
//     not be taken back. A feature that has existed in the source and has never
//     once run.
//
// ⚠ AND ONE PRE-EXISTING BUG THIS EXPOSED. Staging pre-decodes each image to read
// its dimensions and then called `URL.revokeObjectURL(img.src)` — but `img.src`
// is the ENTRY's url, the same one the tile renders and the message is sent
// with. Every staged image's url was dead the moment it was measured; the tile
// still worked because it had already decoded and cached, and anything later
// failed. That is asserted here directly, because it is invisible from the strip.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

// Flat colour decodes instantly and would hide the very state under test.
function makeImage(sharp, opts) {
  return sharp({ create: opts }).png().toBuffer();
}

test.describe('staged attachments', () => {
  test('the strip shows loading, offers remove, and views without sending', async () => {
    const sharp = require('sharp');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-attach-'));
    const paths = [1, 2, 3].map((n) => path.join(dir, 'att-' + n + '.png'));
    fs.writeFileSync(paths[0], await makeImage(sharp, {
      width: 4000, height: 3000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 }
    }));
    fs.writeFileSync(paths[1], await makeImage(sharp, { width: 200, height: 200, channels: 3, background: { r: 200, g: 90, b: 40 } }));
    fs.writeFileSync(paths[2], await makeImage(sharp, { width: 200, height: 200, channels: 3, background: { r: 40, g: 90, b: 200 } }));

    const { app, page } = await launchApp(tmpUserDataDir('attach'));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));

    // Watch from the moment of attach, so the loading state is caught if it
    // happens at all rather than being inferred from the markup.
    const sawLoading = page.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      const tick = () => {
        const t = document.querySelector('#file-preview-area .fp-tile');
        if (t && t.classList.contains('is-loading')) { resolve(true); return; }
        if (++frames > 900) { resolve(false); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));

    await page.setInputFiles('#file-input', paths);
    const loadingSeen = await sawLoading;
    await page.waitForTimeout(2500);

    const tiles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#file-preview-area .fp-tile')).map((t) => ({
        hasSpinner: !!t.querySelector('.fp-spin'),
        hasX: !!t.querySelector('.btn-remove-file'),
        xShown: (t.querySelector('.btn-remove-file') || {}) ? getComputedStyle(t.querySelector('.btn-remove-file')).display !== 'none' : false,
        shadow: getComputedStyle(t).boxShadow,
        loading: t.classList.contains('is-loading')
      })));

    expect(tiles.length).toBe(3);
    expect(tiles.every((t) => t.hasSpinner)).toBe(true);
    // The one that had never been rendered.
    expect(tiles.every((t) => t.hasX && t.xShown)).toBe(true);
    expect(tiles.every((t) => t.shadow && t.shadow !== 'none')).toBe(true);
    expect(tiles.every((t) => t.loading === false)).toBe(true);
    expect(loadingSeen).toBe(true);

    // ── Remove the middle one; the rest must survive ────────────────────────
    await page.locator('#file-preview-area .btn-remove-file').nth(1).click();
    await page.waitForTimeout(800);
    expect(await page.locator('#file-preview-area .fp-tile').count()).toBe(2);
    expect(await page.evaluate(() => window.ChatPanel.stagedFiles.length)).toBe(2);

    // ── Clicking a tile VIEWS it ────────────────────────────────────────────
    // ⚠ Assert on the SEND, not on the message count. The local-echo chat posts
    // its own greeting on a timer, so comparing counts measures the bot — which
    // is exactly how this test failed the first time.
    await page.evaluate(() => {
      window.__sendCalls = 0;
      const real = window.ChatPanel.sendMessage;
      window.ChatPanel.sendMessage = function () { window.__sendCalls++; return real.apply(this, arguments); };
    });

    await page.locator('#file-preview-area .fp-tile').first().click();
    await page.waitForTimeout(1200);

    const viewer = await page.evaluate(() => {
      const el = document.getElementById('image-viewer-modal');
      const img = document.getElementById('iv-image');
      return {
        open: el ? getComputedStyle(el).display !== 'none' : false,
        // ⚠ A blob: src proves the url is still alive. It was not, before the
        // revoke fix — this is the assertion that catches that bug.
        blobSrc: !!(img && img.src && img.src.indexOf('blob:') === 0),
        title: (document.getElementById('iv-title') || {}).innerText || ''
      };
    });
    expect(viewer.open).toBe(true);
    expect(viewer.blobSrc).toBe(true);
    // Two images remain, so the gallery should say so and page between them.
    expect(viewer.title).toContain('(1/2)');
    expect(await page.evaluate(() => window.__sendCalls)).toBe(0);

    expect(errors).toEqual([]);
    await app.close();
  });
});
