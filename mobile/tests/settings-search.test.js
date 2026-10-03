// Does the settings search actually hide non-matching rows?
// .settings-item-card.hidden { display: none } lives in mobile.css, but
// redesign.css sets `display: flex !important` on the same element — and
// !important beats a non-important rule regardless of specificity.
const H = require('./harness.js');

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' }
  });

  await page.evaluate(() => window.showSettingsOverlay && window.showSettingsOverlay());
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const el = document.querySelector('.settings-section-card[data-section="appearance"]');
    if (el) el.click();
  });
  await page.waitForTimeout(900);

  const before = await page.evaluate(() =>
    document.querySelectorAll('.settings-item-card').length);

  // Set the value and fire the event directly — the field is not visible in the
  // detail view, and Playwright's fill() refuses to touch an invisible element.
  await page.evaluate(() => {
    const i = document.getElementById('search-settings');
    i.value = 'zoom';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(800);

  const after = await page.evaluate(() => {
    const all = document.querySelectorAll('.settings-item-card');
    return {
      total: all.length,
      gotHiddenClass: document.querySelectorAll('.settings-item-card.hidden').length,
      visuallyHidden: Array.from(all).filter(e => getComputedStyle(e).display === 'none').length
    };
  });

  console.log('rows before:', before);
  console.log('after typing "zoom":', JSON.stringify(after));
  H.check('the query marks rows as hidden', after.gotHiddenClass > 0, after.gotHiddenClass);
  H.check('hidden rows are ACTUALLY hidden on screen', after.visuallyHidden > 0, after.visuallyHidden);
  H.check('no page errors', errors.length === 0, errors);

  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
