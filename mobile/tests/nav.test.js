// The tab bar: the selected tab shows the FILLED form of its icon.
//
// Lucide renders `<svg fill="none" stroke="currentColor">`. A presentation
// attribute loses to any CSS rule, so `fill: currentColor` on the active icon
// overrides it without touching the markup lucide generates. The guard here is
// that the fill must land on the ACTIVE tab only — if it leaks, every icon goes
// solid and the bar loses its only active indicator.
const H = require('./harness.js');
const path = require('path');

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
    orbit_friends: [{ id: 'echo', name: 'Orbit Echo', tag: 'BOT', status: 'online', avatar: 'icons/app/orbit_1024.png' }],
    orbit_chats: [{ id: 'echo', name: 'Orbit Echo', avatar: 'icons/app/orbit_1024.png', lastMessage: 'ok', lastTime: H.t(3) }]
  });

  // Drive it through the real switch, NOT by toggling classes by hand. Faking
  // `.active` does not survive the nav's own re-render, and the stale read that
  // produced (a colour where `none` was expected) sent me chasing a bug that was
  // in the test.
  const ACCENT = 'rgb(77, 124, 254)';
  const ids = ['chats', 'contacts', 'activity', 'settings'];
  for (const id of ids) {
    await page.evaluate((t) => window.OrbitNav.switchTo(t), id);
    await page.waitForTimeout(700);

    // navigation.js injects a bar into EVERY tab-level panel, so the document
    // holds three bars and three "active" tabs — one per bar. Per bar, exactly
    // one is active; across the document, three is correct.
    const state = await page.evaluate(() => {
      const read = (el) => {
        const svg = el && el.querySelector('svg');
        return svg ? getComputedStyle(svg).fill : null;
      };
      const bars = Array.from(document.querySelectorAll('.orbit-tabbar'));
      const tabs = bars.reduce((acc, b) => acc.concat(Array.from(b.querySelectorAll('.tab'))), []);
      const act = tabs.filter(t => t.classList.contains('active'));
      return {
        bars: bars.length,
        activesPerBar: bars.map(b => b.querySelectorAll('.tab.active').length),
        activeFill: act[0] ? read(act[0]) : null,
        inactiveFills: tabs.filter(t => !t.classList.contains('active')).map(read)
      };
    });

    H.check(id + ': one active tab per bar',
      state.activesPerBar.every(n => n === 1), state.activesPerBar);
    H.check(id + ': the active icon is FILLED with the accent',
      state.activeFill === ACCENT, state.activeFill);
    H.check(id + ': no inactive icon is filled',
      state.inactiveFills.every(f => f === 'none'), state.inactiveFills);
  }

  // The icons chosen so the fill reads as a shape rather than a blob.
  const icons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.mobile-panel.active .orbit-tabbar .tab'))
      .map(t => t.getAttribute('data-tab') + '=' +
        ((t.querySelector('svg') || {}).getAttribute ? t.querySelector('svg').getAttribute('class').replace('lucide ', '').trim() : '?')));
  console.log('\n  icons: ' + icons.join('  '));
  H.check('chats uses message-circle', icons[0].indexOf('message-circle') !== -1, icons[0]);
  H.check('activity uses a fillable icon (history)', icons[2].indexOf('history') !== -1, icons[2]);
  H.check('settings uses a fillable icon (sliders-horizontal)', icons[3].indexOf('sliders-horizontal') !== -1, icons[3]);

  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.mobile-panel.active .orbit-tabbar .tab');
    tabs.forEach(t => t.classList.remove('active'));
    const b = document.querySelector('.mobile-panel.active .orbit-tabbar .tab[data-tab="chats"]');
    if (b) b.classList.add('active');
  });
  await page.waitForTimeout(500);
  const bar = await page.$('.mobile-panel.active .orbit-tabbar');
  if (bar) await bar.screenshot({ path: path.join(H.SHOTS, 'nav-final.png') });

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
