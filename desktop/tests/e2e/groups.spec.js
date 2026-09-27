// E2E: the group lifecycle, after creation.
//
// `group-picker.spec.js` already covers creating a group through the modal. What
// had no coverage at all was everything after that: opening it, the empty state,
// sending, persistence, and what group info shows the owner.
//
// Selectors: #middle-sidebar-container .tab (Groups), #btn-create-group,
// #group-name-input, .group-member-cb, #btn-confirm-group,
// .list-row[data-type="group"][data-id], #chat-input, #btn-send, .message-row,
// #chat-header-strip, #btn-group-info, #chat-message-feed, .oe-root.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedFriends } = require('./helpers');

test.describe('groups', () => {
  let app;
  let page;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  async function createGroup(page, name, memberCount) {
    await page.locator('#middle-sidebar-container .tab', { hasText: 'Groups' }).click();
    await page.click('#btn-create-group');
    await expect(page.locator('#group-name-input')).toBeVisible();
    await page.fill('#group-name-input', name);
    const boxes = page.locator('.group-member-cb');
    for (let i = 0; i < memberCount; i++) await boxes.nth(i).check();
    await page.click('#btn-confirm-group');
    await page.waitForTimeout(700);
    return page.locator('.list-row[data-type="group"]', { hasText: name });
  }

  test('a new group opens, holds its messages, survives a restart, and shows the owner their controls', async () => {
    const dir = tmpUserDataDir('groups-lifecycle');
    ({ app, page } = await launchApp(dir));
    await seedFriends(page, 6);

    // ── create ────────────────────────────────────────────────────────────
    const row = await createGroup(page, 'Orbit Test Group', 3);
    await expect(row).toHaveCount(1);

    // ── open it ───────────────────────────────────────────────────────────
    await row.first().click();
    await page.waitForTimeout(800);
    await expect(page.locator('#chat-input')).toBeVisible();

    // the header names the group, and the empty state welcomes you to it
    const header = await page.locator('#chat-header-strip').innerText();
    expect(header).toContain('Orbit Test Group');
    const empty = page.locator('.oe-root');
    await expect(empty).toHaveCount(1);
    await expect(empty).toContainText('Welcome to Orbit Test Group');

    // and it sits in the middle of the feed rather than at the top — the feed is a
    // plain block here, so this is the min-height:100% half of the fill variant
    const centred = await page.evaluate(() => {
      const feed = document.getElementById('chat-message-feed');
      const oe = feed && feed.querySelector('.oe-root');
      if (!feed || !oe) return null;
      const fr = feed.getBoundingClientRect(), or = oe.getBoundingClientRect();
      return {
        fill: oe.classList.contains('is-fill'),
        offset: Math.round((or.top + or.height / 2) - (fr.top + fr.height / 2))
      };
    });
    expect(centred).not.toBeNull();
    expect(centred.fill).toBe(true);
    expect(Math.abs(centred.offset)).toBeLessThanOrEqual(40);

    // ── send ──────────────────────────────────────────────────────────────
    await page.fill('#chat-input', 'Hello group, this is a test message');
    await page.click('#btn-send');
    await page.waitForTimeout(700);
    await expect(page.locator('.message-row.message-own')).toHaveCount(1);
    await expect(page.locator('.message-row.message-own').first()).toContainText('Hello group, this is a test message');
    // the empty state is gone once there is something to show
    await expect(page.locator('.oe-root')).toHaveCount(0);

    // ── group info ────────────────────────────────────────────────────────
    await page.click('#btn-group-info');
    await page.waitForTimeout(700);
    const infoText = await page.locator('body').innerText();
    expect(infoText).toContain('Orbit Test Group');
    // the creator plus the three members that were selected
    expect(infoText).toMatch(/4\s*members|members\s*4/i);

    // ── restart: the group and its message persist ────────────────────────
    await app.close();
    ({ app, page } = await launchApp(dir));
    await page.waitForTimeout(900);
    // The sidebar comes back on the Chats tab, so the group is only rendered once
    // the Groups tab is active. Without this the check reads as "groups do not
    // persist", which is not what it means.
    await page.locator('#middle-sidebar-container .tab', { hasText: 'Groups' }).click();
    await page.waitForTimeout(500);
    const afterRestart = page.locator('.list-row[data-type="group"]', { hasText: 'Orbit Test Group' });
    await expect(afterRestart).toHaveCount(1);
    await afterRestart.first().click();
    await page.waitForTimeout(900);
    await expect(page.locator('.message-row.message-own').first()).toContainText('Hello group, this is a test message');

    // ── the owner's controls ──────────────────────────────────────────────
    // Worth pinning down, because it is a deliberate asymmetry rather than a gap:
    // "Leave Group" is rendered only for non-owners (sidebar-middle.js guards it with
    // !isOwner), and an owner leaves by deleting the group or transferring ownership
    // — both of which they do have. The creator of this group is the owner, so the
    // leave button must NOT be here and the ownership-transfer control must be.
    await page.click('#btn-group-info');
    await page.waitForTimeout(800);
    await expect(page.locator('#group-info-members-list')).toBeVisible();
    await expect(page.locator('#group-info-leave-group')).toHaveCount(0);
    await expect(page.locator('.group-info-transfer-ownership').first()).toBeVisible();
  });

  test('a group with no messages shows the welcome state, and sending replaces it', async () => {
    const dir = tmpUserDataDir('groups-empty');
    ({ app, page } = await launchApp(dir));
    await seedFriends(page, 3);

    const row = await createGroup(page, 'Empty Group', 1);
    await row.first().click();
    await page.waitForTimeout(800);

    // named for the group, not a generic line
    await expect(page.locator('.oe-root')).toContainText('Welcome to Empty Group');
    await expect(page.locator('.oe-root')).toContainText('Send the first message');

    await page.fill('#chat-input', 'first');
    await page.click('#btn-send');
    await page.waitForTimeout(700);
    await expect(page.locator('.oe-root')).toHaveCount(0);
    await expect(page.locator('.message-row')).toHaveCount(1);
  });
});
