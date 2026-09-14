// E2E: Add-a-Friend modal (IP / QR tabs) + profile frame in the chat header.
//
// Two regressions this guards:
//   1. The DM chat header avatar was missing its profile frame overlay even
//      though the chat list, message bubbles, profile sidebar and own-avatar
//      all rendered one.
//   2. "Add a Friend" only accepted a raw IP. It now has a tab switcher whose
//      QR tab mounts the shared image scanner inline (paste / drop / choose).
//
// Selectors: #btn-add-friend, .af-tab[data-tab], #connect-ip-input,
// #btn-confirm-connect, .qr-inline-zone, .qr-inline-choose, .qr-inline-file,
// .chat-header-avatar.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

// The default chat on a fresh profile is the local echo bot.
const ECHO_ID = 'local-echo';
const FRAME_NUM = 3;

test.describe('add-friend modal + chat header frame', () => {
  let app;
  let page;

  test.beforeEach(async () => {
    ({ app, page } = await launchApp(tmpUserDataDir('add-friend-qr')));
  });

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  /* -- 1. chat header profile frame -- */

  // Mirrors store.addOrUpdatePeer: a friends-only setState. This is how peer
  // presence *and* a peer's profile frame actually arrive over the network, so
  // the header must repaint for it — without rebuilding the message feed.
  const pushFriend = (frame, status) =>
    page.evaluate(({ id, frame, status }) => {
      const st = window.store.getState();
      const friends = st.friends.map((f) =>
        f.userId === id ? { ...f, profileFrame: frame, status } : f
      );
      window.store.setState({ friends });
    }, { id: ECHO_ID, frame, status });

  test('chat header repaints on a friends-only change (frame + presence)', async () => {
    const header = page.locator('.chat-header');
    const headerAvatar = page.locator('.chat-header-avatar').first();
    await expect(headerAvatar).toBeVisible();
    // No frame by default (profileFrame defaults to 0).
    await expect(headerAvatar.locator('img[src*="pfp_frame_"]')).toHaveCount(0);

    await pushFriend(FRAME_NUM, 'away');

    // The frame appears AND the presence label updates — the header was
    // previously frozen here because `friends` was not in the subscriber's
    // relevant-state list.
    await expect(headerAvatar.locator(`img[src*="pfp_frame_${FRAME_NUM}.png"]`)).toHaveCount(1);
    await expect(header).toContainText('Away');
  });

  test('friends-only change does not rebuild the message feed', async () => {
    // renderChat unconditionally does `feed.scrollTop = feed.scrollHeight`, so a
    // friends-only change must take the header-only path or presence blips would
    // yank the user to the bottom of the chat.
    const feedSurvived = await page.evaluate(({ id, frame }) => {
      const before = document.getElementById('chat-message-feed');
      const st = window.store.getState();
      const friends = st.friends.map((f) => (f.userId === id ? { ...f, profileFrame: frame } : f));
      window.store.setState({ friends });
      return document.getElementById('chat-message-feed') === before;
    }, { id: ECHO_ID, frame: FRAME_NUM });
    expect(feedSurvived).toBe(true);
  });

  test('chat header frame is removed when the friend frame resets', async () => {
    const headerAvatar = page.locator('.chat-header-avatar').first();
    await pushFriend(FRAME_NUM, 'online');
    await expect(headerAvatar.locator('img[src*="pfp_frame_"]')).toHaveCount(1);

    await pushFriend(0, 'online');
    await expect(headerAvatar.locator('img[src*="pfp_frame_"]')).toHaveCount(0);
  });

  test('chat header avatar click still opens the profile after a repaint', async () => {
    // _refreshHeaderStrip swaps innerHTML; the avatar click is delegated from
    // the container, so it must survive.
    await pushFriend(FRAME_NUM, 'online');
    await page.locator('.chat-header-avatar').first().click();
    await expect(page.locator('#btn-close-profile-sidebar')).toBeVisible();
  });

  /* -- 2. add-a-friend modal tabs -- */

  test('modal opens on the IP tab and switches to the QR tab and back', async () => {
    await page.click('#btn-add-friend');

    // Default: IP tab, Connect is the primary action.
    await expect(page.locator('#connect-ip-input')).toBeVisible();
    await expect(page.locator('#btn-confirm-connect')).toBeVisible();
    await expect(page.locator('.qr-inline-zone')).toHaveCount(0);

    // QR tab: inline scanner replaces the input, Connect is irrelevant.
    await page.locator('.af-tab[data-tab="qr"]').click();
    await expect(page.locator('.qr-inline-zone')).toBeVisible();
    await expect(page.locator('.qr-inline-choose')).toBeVisible();
    await expect(page.locator('#connect-ip-input')).toHaveCount(0);
    await expect(page.locator('#btn-confirm-connect')).toBeHidden();

    // Back to IP: the inline scanner must be torn down, not left in the DOM.
    await page.locator('.af-tab[data-tab="ip"]').click();
    await expect(page.locator('#connect-ip-input')).toBeVisible();
    await expect(page.locator('.qr-inline-zone')).toHaveCount(0);
    await expect(page.locator('#btn-confirm-connect')).toBeVisible();

    // Cancel closes everything.
    await page.click('#btn-cancel-connect');
    await expect(page.locator('#connect-ip-input')).toHaveCount(0);
  });

  test('QR tab pairs a peer from a pasted QR image', async () => {
    await page.click('#btn-add-friend');
    await page.locator('.af-tab[data-tab="qr"]').click();
    await expect(page.locator('.qr-inline-zone')).toBeVisible();

    // Render a real Orbit pairing payload as a QR PNG inside the renderer, then
    // hand the bytes to the hidden file input. Empty ips[] keeps the test
    // offline: the peer is stored and discovery is expected to find it later.
    const dataUrl = await page.evaluate(() => {
      const payload = Orbit.QRPairing.buildPayload(
        { userId: 'e2e-qr-peer', username: 'QR Peer', usertag: '4242' },
        { ips: [], port: 46000 }
      );
      const qr = window.QRCode(0, 'M');
      qr.addData(payload);
      qr.make();
      const count = qr.getModuleCount();
      const scale = 6;
      const margin = 4 * scale;
      const size = count * scale + margin * 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) ctx.fillRect(margin + c * scale, margin + r * scale, scale, scale);
        }
      }
      return canvas.toDataURL('image/png');
    });

    await page.setInputFiles('.qr-inline-file', {
      name: 'orbit-pairing.png',
      mimeType: 'image/png',
      buffer: Buffer.from(dataUrl.split(',')[1], 'base64')
    });

    // Paired → the modal closes itself and the peer lands in the store.
    await expect(page.locator('#connect-ip-input')).toHaveCount(0);
    await expect(page.locator('.qr-inline-zone')).toHaveCount(0);
    const stored = await page.evaluate(() =>
      window.store.getState().friends.some((f) => f.userId === 'e2e-qr-peer')
    );
    expect(stored).toBe(true);
  });

  test('QR tab reports an unreadable image without closing the modal', async () => {
    await page.click('#btn-add-friend');
    await page.locator('.af-tab[data-tab="qr"]').click();

    // 8x8 solid white PNG — no QR in it.
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 8;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 8, 8);
      return canvas.toDataURL('image/png');
    });

    await page.setInputFiles('.qr-inline-file', {
      name: 'blank.png',
      mimeType: 'image/png',
      buffer: Buffer.from(dataUrl.split(',')[1], 'base64')
    });

    // Modal stays open so the user can try another image.
    await expect(page.locator('.qr-inline-zone')).toBeVisible();
  });

  // The refactor moved the decode/paste plumbing into wireScanner(), shared by
  // the inline panel and the standalone overlay. Settings > "Scan a QR code…"
  // still uses the overlay, so guard it.
  test('standalone QR overlay still opens and closes', async () => {
    await page.evaluate(() => window.OrbitQRScanner.open());
    await expect(page.locator('#qr-scanner-overlay')).toBeVisible();
    await expect(page.locator('#qr-scan-zone')).toBeVisible();

    await page.click('#qr-scan-close');
    await expect(page.locator('#qr-scanner-overlay')).toHaveCount(0);
  });
});
