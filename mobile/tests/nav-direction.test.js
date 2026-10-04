// Tab transitions must slide the way you are moving, must not fade, and must not
// move the tab bar.
//
// Dan: "why is the mobile transitions only slide to the left? ... when it's from
// the other way round, it's should be slide to the right!"
// then: "and why did you add back the fade in effect to the slide effects?!"
//
// Three things are load-bearing here, and they are easy to break one at a time:
//
//   1. The direction comes from PANEL_ORDER in switchPanel. It used to come from
//      the caller as `tabId === 'chats' ? 'reverse' : 'enter'`, which is really
//      "is the destination Chats?" — so every move not involving Chats went the
//      same way.
//   2. The PANEL must not animate; its CHILDREN do. The tab bar lives inside
//      every panel, so animating the panel slides the bar — the exact bug that
//      was fixed once already by measuring the bar across a switch.
//   3. No `opacity` in the keyframes. The panel keyframes carry a fade; the
//      content keyframes must not, or the slide reads as a cross-dissolve.
const H = require('./harness.js');
const path = require('path');

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'D4niel', tag: '2847', status: 'online' },
    orbit_settings: { theme: 'dark' }
  });

  // Record what animates, on which element, with which keyframes.
  await page.evaluate(() => {
    window.__nav = [];
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        const el = m.target;
        if (!el.classList || !el.classList.contains('mobile-panel')) continue;
        const panelAnim = getComputedStyle(el).animationName;
        // The children are what should be moving.
        const childAnim = {};
        Array.from(el.children).forEach((c) => {
          const a = getComputedStyle(c).animationName;
          if (a && a !== 'none') {
            const key = c.className && c.className.indexOf('orbit-tabbar') !== -1 ? 'tabbar' : 'content';
            childAnim[key] = a;
          }
        });
        window.__nav.push({ id: el.id, panelAnim: panelAnim, children: childAnim });
      }
    });
    document.querySelectorAll('.mobile-panel').forEach((el) =>
      obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
  });

  const move = async (tabId) => {
    await page.evaluate(() => { window.__nav = []; });
    await page.evaluate((t) => {
      const el = document.querySelector('.mobile-nav [data-tab="' + t + '"], .tab[data-tab="' + t + '"]');
      if (el) el.click();
    }, tabId);
    await page.waitForTimeout(700);
    return page.evaluate(() => window.__nav);
  };

  // The INCOMING panel's content animation. The exit fires first, so a naive
  // "first content animation seen" returns panelContentOut* and the assertion
  // reads backwards.
  const entering = (seq) => {
    for (const s of seq) {
      const a = s.children && s.children.content;
      if (a && a.indexOf('panelContentIn') === 0) return a;
    }
    return '(none)';
  };

  console.log('\n== going FORWARD: Chats -> Contacts -> Activity ==');
  let seq = await move('contacts');
  console.log('  Chats -> Contacts   ', entering(seq));
  H.check('forward: the content enters from the RIGHT',
    entering(seq) === 'panelContentIn', entering(seq));

  seq = await move('activity');
  console.log('  Contacts -> Activity', entering(seq));
  H.check('forward again: still from the right',
    entering(seq) === 'panelContentIn', entering(seq));

  console.log('\n== going BACK: Activity -> Contacts -> Chats ==');
  seq = await move('contacts');
  console.log('  Activity -> Contacts', entering(seq));
  H.check('BACK: the content enters from the LEFT — the reported bug',
    entering(seq) === 'panelContentInReverse', entering(seq));

  seq = await move('chats');
  console.log('  Contacts -> Chats   ', entering(seq));
  H.check('back again: still from the left',
    entering(seq) === 'panelContentInReverse', entering(seq));

  console.log('\n== the panel itself must NOT animate ==');
  const anySeq = await move('contacts');
  const panelAnims = anySeq.map((s) => s.panelAnim).filter((a) => a && a !== 'none');
  console.log('  panel animations seen:', JSON.stringify(panelAnims));
  H.check('the panel never animates — that is what drags the tab bar',
    panelAnims.length === 0, panelAnims);

  console.log('\n== the tab bar must not move ==');
  await page.evaluate(() => { const el = document.querySelector('[data-tab="chats"]'); if (el) el.click(); });
  await page.waitForTimeout(600);
  // The ACTIVE panel's bar. There is one bar per panel, so a bare
  // `.orbit-tabbar` picks up the outgoing one and reads 0,0 once it is hidden.
  const barPos = () => page.evaluate(() => {
    const panel = document.querySelector('.mobile-panel.active');
    const t = panel && panel.querySelector('.orbit-tabbar');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return Math.round(r.x) + ',' + Math.round(r.y);
  });

  await page.evaluate(() => { const el = document.querySelector('[data-tab="chats"]'); if (el) el.click(); });
  await page.waitForTimeout(600);
  console.log('  bar before:', await barPos());
  await page.evaluate(() => { const el = document.querySelector('[data-tab="contacts"]'); if (el) el.click(); });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(16);
    seen.push(await barPos());
  }
  const uniq = [...new Set(seen.filter(Boolean))];
  console.log('  bar positions across the switch:', JSON.stringify(uniq));
  H.check('the bar holds one position while the content moves', uniq.length <= 1, uniq);

  console.log('\n== no fade in the content keyframes ==');
  const hasOpacity = await page.evaluate(() => {
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (!r.name || r.name.indexOf('panelContent') !== 0) continue;
        const text = Array.from(r.cssRules || []).map((k) => k.cssText).join(' ');
        if (/opacity/.test(text)) out.push(r.name);
      }
    }
    return out;
  });
  console.log('  content keyframes containing opacity:', JSON.stringify(hasOpacity));
  H.check('the content slide has no opacity — no fade', hasOpacity.length === 0, hasOpacity);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
