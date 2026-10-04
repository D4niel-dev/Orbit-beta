// Tab transitions must slide the way you are moving.
//
// Dan: "why is the mobile transitions only slide to the left? where is the slide
// to the right? like when user's go from 'Chat' to 'Contacts' left is ok, but
// when it's from the other way round, it's should be slide to the right!"
//
// Two separate faults, and the second one hid the first:
//
//   1. The direction came from the CALLER, and the only caller passed
//      `tabId === 'chats' ? 'reverse' : 'enter'` — so the direction was really
//      "is the destination Chats?" and every move that did not involve Chats
//      went the same way. Chats -> Contacts -> Activity -> Contacts slid left on
//      the last step, which is backwards.
//   2. redesign.css switched ALL SIX panel animations off with
//      `animation: none !important`. So nothing animated anywhere, and the
//      complaint about direction could not be reproduced as stated.
//
// This asserts the animation name that actually lands, in both directions.
const H = require('./harness.js');
const path = require('path');

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'D4niel', tag: '2847', status: 'online' },
    orbit_settings: { theme: 'dark' }
  });

  // Record every animation name that lands on a panel, with the panel it is on.
  await page.evaluate(() => {
    window.__nav = [];
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        const el = m.target;
        if (!el.classList || !el.classList.contains('mobile-panel')) continue;
        const anim = getComputedStyle(el).animationName;
        if (!anim || anim === 'none') continue;
        window.__nav.push({ id: el.id, anim: anim });
      }
    });
    document.querySelectorAll('.mobile-panel').forEach((el) =>
      obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
  });

  // Tap a tab and return the pair of animations it produced.
  const move = async (tabId) => {
    await page.evaluate(() => { window.__nav = []; });
    await page.evaluate((t) => {
      const el = document.querySelector('.mobile-nav [data-tab="' + t + '"], .tab[data-tab="' + t + '"]');
      if (el) el.click();
    }, tabId);
    await page.waitForTimeout(700);
    return page.evaluate(() => window.__nav);
  };

  const names = (seq) => seq.map((s) => s.anim).join(' + ');
  const entering = (seq) => (seq.find((s) => /Enter/.test(s.anim)) || {}).anim || '(none)';

  console.log('\n== going FORWARD: Chats -> Contacts -> Activity ==');
  let seq = await move('contacts');
  console.log('  Chats -> Contacts   ', names(seq));
  H.check('forward: the incoming panel enters from the right',
    entering(seq) === 'panelEnter', names(seq));

  seq = await move('activity');
  console.log('  Contacts -> Activity', names(seq));
  H.check('forward again: still enters from the right',
    entering(seq) === 'panelEnter', names(seq));

  console.log('\n== going BACK: Activity -> Contacts -> Chats ==');
  seq = await move('contacts');
  console.log('  Activity -> Contacts', names(seq));
  H.check('BACK: the incoming panel enters from the LEFT — this is the reported bug',
    entering(seq) === 'panelEnterReverse', names(seq));

  seq = await move('chats');
  console.log('  Contacts -> Chats   ', names(seq));
  H.check('back again: still enters from the left',
    entering(seq) === 'panelEnterReverse', names(seq));

  console.log('\n== every transition animates at all ==');
  const any = await move('contacts');
  H.check('a tab switch produces an animation, not a jump',
    any.length > 0, any);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
