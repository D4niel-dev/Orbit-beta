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
const fs = require('fs');
const path = require('path');
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
    const modal = o.querySelector('div');
    const body = o.textContent || '';
    // The wrapper vBlock() emits per version. Counting THESE is the point.
    const blocks = modal ? (modal.innerHTML.match(/border-bottom:1px solid/g) || []).length : 0;
    return {
      open: getComputedStyle(o).display !== 'none',
      hasClose: !!document.getElementById('changelog-close-mobile'),
      length: body.trim().length,
      mentionsLatest: /Latest/.test(body),
      // A version heading, so it rendered entries rather than an empty shell.
      hasVersion: /v0\.8\.\d/.test(body),
      blocks: blocks
    };
  });
  console.log('  ' + JSON.stringify(opened));
  H.check('the overlay opened', opened.open, opened);
  H.check('it rendered a version heading', opened.hasVersion, opened);

  // ⚠ "A version heading exists" was too weak and let a real bug through: the
  // list is one long `A + B + C` expression, and a stray COMMA where a `+`
  // belonged made JavaScript take only the LAST operand — so the panel rendered
  // exactly ONE version (the newest, via the comma's other side) and silently
  // dropped the other 57. Everything still "had a version heading". Count the
  // blocks, not their existence.
  // Count the entries in the SOURCE list — reading the same DOM twice would be a
  // tautology that passes whatever the renderer does.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'app.js'), 'utf8');
  const expected = (src.match(/^\s*vBlock\('/gm) || []).length;
  H.check('it rendered MORE than one version, not just the newest', opened.blocks > 1,
    { rendered: opened.blocks, expected: expected });
  H.check('it rendered every version in the list', opened.blocks === expected,
    { rendered: opened.blocks, expected: expected });
  // And the oldest must be reachable, because that is what "the other versions"
  // means to someone scrolling.
  const oldest = await page.evaluate(() => {
    const o = document.getElementById('changelog-overlay');
    return /v0\.0\.\d-beta/.test(o ? o.textContent : '');
  });
  H.check('the oldest release is in the list too', oldest, oldest);
  H.check('it has real content, not an empty shell', opened.length > 200, opened);
  H.check('it has a close button', opened.hasClose, opened);

  // THE POINT: a throw during render leaves the overlay absent AND logs an error.
  H.check('nothing threw while rendering it', errors.length === 0, errors.slice(0, 2));

  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
