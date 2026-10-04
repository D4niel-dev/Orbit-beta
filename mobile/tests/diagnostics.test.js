const H = require('./harness.js');
const path = require('path');
(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'D4niel', tag: '2847', status: 'online' },
    orbit_friends: [{ id: 'p_mai', name: 'Mai Nguyen', tag: '7714', status: 'offline' }],
    orbit_settings: { theme: 'dark', profileFrames: false }
  });
  // The settings overlay, then the Diagnostics row. showSettingsSection is not on
  // window — the row's click handler is the only entry.
  await page.evaluate(() => window.showSettingsOverlay && window.showSettingsOverlay());
  await page.waitForTimeout(1200);
  await page.click('.settings-section-card[data-section="diagnostics"]');
  await page.waitForTimeout(1400);

  const info = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const cs = (s) => { const e = q(s); return e ? getComputedStyle(e) : null; };
    return {
      heroTitle: (q('.diag-hero-title') || {}).textContent,
      heroSub: (q('.diag-hero-sub') || {}).textContent,
      heroCount: (q('.diag-hero-count') || {}).textContent,
      heroBg: cs('.diag-hero') && cs('.diag-hero').backgroundColor,
      groupLabels: Array.from(document.querySelectorAll('.diag-group-label')).map(e => e.textContent.trim()),
      rows: document.querySelectorAll('.diag-row').length,
      listHasCard: cs('.diag-list') && cs('.diag-list').borderRadius !== '0px',
      reportLines: ((q('.diag-report') || {}).textContent || '').split('\n').length,
      reportText: ((q('.diag-report') || {}).textContent || '').split('\n').slice(0, 3).join(' | '),
      duplicateTitle: document.body.innerText.split('Diagnostics').length - 1,
      copyBtn: !!q('#diag-copy'),
      pageHeight: (document.getElementById('settings-overlay-content') || {}).scrollHeight || 0
    };
  });
  console.log(JSON.stringify(info, null, 1));
  H.check('the hero states a verdict', !!info.heroTitle, info.heroTitle);
  H.check('the hero carries a count', /^\d+\/\d+$/.test(info.heroCount || ''), info.heroCount);
  H.check('the checks are grouped', info.groupLabels.indexOf('Checked') !== -1, info.groupLabels);
  H.check('the rows are inside a card', info.listHasCard, info.listHasCard);
  H.check('the report is shown, not just described', info.reportLines > 4, info.reportLines);
  H.check('the report preview leads with the version', /version=/.test(info.reportText), info.reportText);
  H.check('the Copy button is present', info.copyBtn);

  // The preview and the button must be the same text. They were two separate
  // loops over the same rows, which is the kind of pair that silently drifts —
  // so this captures what Copy actually puts on the clipboard and compares it
  // to what is on screen.
  console.log('\n== the preview and Copy are the same text ==');
  const copied = await page.evaluate(() => {
    return new Promise((resolve) => {
      let captured = null;
      const orig = navigator.clipboard && navigator.clipboard.writeText;
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: (t) => { captured = t; return Promise.resolve(); } }
        });
      } catch (e) { resolve({ error: 'could not stub clipboard: ' + e.message }); return; }
      document.getElementById('diag-copy').click();
      setTimeout(() => {
        try { if (orig) Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: orig } }); } catch (e) {}
        resolve({ captured: captured, preview: document.getElementById('diag-report-preview').textContent });
      }, 400);
    });
  });
  H.check('Copy put something on the clipboard', !!copied.captured, copied.error || copied.captured);
  H.check('the clipboard text matches the on-screen preview exactly',
    copied.captured === copied.preview,
    { same: copied.captured === copied.preview, copied: (copied.captured || '').slice(0, 60), preview: (copied.preview || '').slice(0, 60) });

  H.check('no page errors', errors.length === 0, errors);
  await page.screenshot({ path: path.join(H.SHOTS, 'diag-reworked.png') });
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
