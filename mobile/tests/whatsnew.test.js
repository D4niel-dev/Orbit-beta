// Does the mobile's What's New actually render the v0.8.1-beta notes?
//
// The mobile does NOT have a hardcoded list — update-check.js builds the
// highlights from the GitHub release body, falling back to CHANGELOG.md at the
// tag. So this stubs the GitHub responses and checks what the phone shows.
const H = require('./harness.js');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

// The real release body if it is on this machine, otherwise a fixture with the
// same shape. `plans/` is gitignored, so the file is not in a fresh clone —
// this test must not fail there for that reason.
const BODY_PATH = path.join(REPO, 'plans/docs/Orbit v0.8.1-beta Release Body.md');
let BODY;
if (fs.existsSync(BODY_PATH)) {
  // The file carries its own header block above a `---` rule; a human pastes
  // everything below it.
  BODY = fs.readFileSync(BODY_PATH, 'utf8').split('---').slice(1).join('---').trim();
} else {
  BODY = [
    'The account travels from the desktop to the phone.',
    '',
    "## What's new",
    '',
    '- **Your account, from the desktop to your phone** — scan a code and it comes across.',
    '- **The mobile UI is finished** — filled tab icons and a three-control composer.',
    '- **Search actually searches** — it used to find nothing outside the open chat.',
    '- **The gallery names its conversation.**',
    '- **The profile card opens from the header avatar.**',
    '- **Settings sections are full-bleed again.**',
    '',
    '## Technical',
    '',
    '- The transfer\u2019s threat model is the design.',
    '- Test Suites \u2014 ten unit suites.'
  ].join('\n');
  console.log('(using the fixture body \u2014 the real release body is not on this machine)');
}

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' }
  });

  // Stub the two endpoints the update check uses.
  await page.route('**/api.github.com/**', (route) => {
    const url = route.request().url();
    if (/\/releases\/tags\/|\/releases\/latest/.test(url)) {
      return route.fulfill({ status: 404, body: '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        tag_name: 'v0.8.1-beta',
        name: 'v0.8.1-beta',
        body: BODY,
        prerelease: true,
        draft: false,
        published_at: new Date().toISOString(),
        html_url: 'https://github.com/D4niel-dev/Orbit-beta/releases/tag/v0.8.1-beta',
        assets: []
      }])
    });
  });
  // The CHANGELOG fallback must not be what answers this.
  await page.route('**/raw.githubusercontent.com/**', (route) =>
    route.fulfill({ status: 404, body: '' }));

  // The global is `window.Orbit.UpdateCheck` — update-notice.js resolves it that
  // way. There is no `window.OrbitUpdateCheck`.
  const res = await page.evaluate(async () => {
    const uc = window.Orbit && window.Orbit.UpdateCheck;
    if (!uc || !uc.check) return { error: 'no update-check module' };
    return await uc.check({ force: true });
  });

  console.log('\n-- what the update check produced --');
  console.log('current:', res && res.current, ' latest:', res && res.latest, ' hasUpdate:', res && res.hasUpdate);
  console.log('highlights (' + ((res && res.highlights) || []).length + '):');
  ((res && res.highlights) || []).forEach((h, i) => console.log('  ' + (i + 1) + '. ' + h));

  H.check('the check found v0.8.1-beta', res && String(res.latest || '').indexOf('0.8.1') !== -1, res && res.latest);
  H.check('it produced highlights', res && res.highlights && res.highlights.length > 0,
    res && res.highlights && res.highlights.length);
  H.check('the transfer is the first highlight',
    res && res.highlights && /account|phone/i.test(res.highlights[0] || ''), res && res.highlights && res.highlights[0]);
  H.check('no Technical section leaked in',
    res && res.highlights && !res.highlights.some(h => /^Test Suites|^The transfer's threat model/i.test(h)),
    res && res.highlights);
  H.check('no page errors', errors.length === 0, errors);

  // Render the dialog itself — the highlights array is the input, this is what
  // a phone actually shows.
  await page.evaluate((r) => {
    if (window.UpdateNotice && window.UpdateNotice.openModal) {
      window.UpdateNotice.openModal(r);
    }
  }, res);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(H.SHOTS, 'whatsnew-mobile.png') });
  console.log('\ndialog screenshot written');

  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
