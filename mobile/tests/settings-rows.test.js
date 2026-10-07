// Settings rows that open something must actually open it.
//
// What's New did nothing when tapped, and the cause was a malformed entry in the
// hand-maintained list: a line had landed between the `Fixes` array's closing
// `]]` and the next section, so a section's value was a string instead of an
// array and `s[1].map(...)` threw. The tap was fine; the render threw.
//
// `changelog.test.js` checks that the newest block MATCHES the app version. It
// does not check that the block is shaped correctly, so it stayed green while the
// button was dead. A source scan for the malformation was tried and reported
// "well-formed" while the bug was live — so this opens the thing and looks.
const H = require('./harness.js');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [], orbit_chats: []
};

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.showSettingsOverlay());
  await page.waitForTimeout(700);
  await page.evaluate(() => window.showSettingsSection('about'));
  await page.waitForTimeout(900);

  console.log('\n== the About screen has the rows ==');
  const rows = await page.evaluate(() => ({
    whatsNew: !!document.getElementById('row-show-changelog'),
    checkUpdate: !!document.getElementById('row-check-update')
  }));
  H.check('the What\u2019s New row is there', rows.whatsNew, rows);

  console.log('\n== and tapping it opens the changelog ==');
  await page.evaluate(() => {
    const row = document.getElementById('row-show-changelog');
    if (row) row.click();
  });
  await page.waitForTimeout(900);

  const opened = await page.evaluate(() => {
    const o = document.getElementById('changelog-overlay');
    if (!o) return { open: false };
    const body = o.textContent || '';
    return {
      open: getComputedStyle(o).display !== 'none',
      hasClose: !!document.getElementById('changelog-close-mobile'),
      length: body.trim().length,
      mentionsLatest: /Latest/.test(body),
      // A version heading, so it rendered entries rather than an empty shell.
      hasVersion: /v0\.8\.\d/.test(body)
    };
  });
  console.log('  ' + JSON.stringify(opened));
  H.check('the overlay opened', opened.open, opened);
  H.check('it rendered a version heading', opened.hasVersion, opened);
  H.check('it has real content, not an empty shell', opened.length > 200, opened);
  H.check('it has a close button', opened.hasClose, opened);

  // THE POINT: a throw during render leaves the overlay absent AND logs an error.
  H.check('nothing threw while rendering it', errors.length === 0, errors.slice(0, 2));

  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
