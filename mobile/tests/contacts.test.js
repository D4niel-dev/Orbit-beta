// The Contacts list must stay the GROUPED list.
//
// There were two renderers writing to the same `#friends-list` container:
// `OrbitHome.renderFriendsList()` (grouped — Online / Offline / Groups) and
// `renderFriends()` in app.js (flat, with a chevron and a cat footer). Whichever
// ran last won, and the flat one is called from a dozen places, so the list
// flipped to flat on almost any friend update. Dan saw it as "correct, then
// incorrect" and the trigger he hit was typing in the search box.
//
// app.js now delegates. This test drives the search box — the exact path that
// used to flip it — and asserts the list is still grouped and filtered.
const H = require('./harness.js');
const path = require('path');

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'D4niel', tag: '2847', status: 'online' },
    orbit_friends: [
      { id: 'echo', name: 'Orbit Echo', tag: 'BOT', status: 'online', avatar: 'icons/app/orbit_1024.png' },
      { id: 'p_mai', name: 'Mai Nguyen', tag: '7714', status: 'online', bio: 'designs things' },
      { id: 'p_ben', name: 'Ben Carter', tag: '0001', status: 'offline' },
      { id: 'p_sof', name: 'Sofia Reyes', tag: '3390', status: 'offline' }
    ],
    orbit_groups: [
      { id: 'g_crew', name: 'Weekend Crew', members: ['p_mai', 'p_ben', 'u_dan'] }
    ]
  });

  await page.evaluate(() => window.OrbitNav && window.OrbitNav.switchTo('contacts'));
  await page.waitForTimeout(1200);

  const shape = async () => page.evaluate(() => {
    const c = document.getElementById('friends-list');
    return {
      labels: Array.from(c.querySelectorAll('.list-label')).map(e => e.textContent.trim()),
      rows: c.querySelectorAll('.friend-row').length,
      hasCat: !!c.querySelector('.end-of-list-cat'),
      hasChevron: !!c.querySelector('i[data-lucide="chevron-right"], svg.lucide-chevron-right'),
      hasMessageBtn: !!c.querySelector('.friend-action'),
      emptyText: (c.querySelector('.empty-title, .orbit-empty-title') || {}).textContent || null
    };
  });

  console.log('\n== before typing (the grouped render) ==');
  const before = await shape();
  console.log(JSON.stringify(before));
  H.check('it renders group labels', before.labels.length >= 2, before.labels);
  H.check('it has the Online label', before.labels.some(l => /online/i.test(l)), before.labels);
  H.check('it has the Groups label', before.labels.some(l => /group/i.test(l)), before.labels);
  H.check('rows carry a Message action, not a chevron', before.hasMessageBtn && !before.hasChevron,
    { message: before.hasMessageBtn, chevron: before.hasChevron });
  H.check('no cat footer', !before.hasCat);

  // THE FLIP. Typing here calls renderFriends() in app.js, which used to replace
  // the grouped list with the flat one.
  console.log('\n== after typing in the search box (used to flip it flat) ==');
  await page.fill('#search-friends', 'mai');
  await page.waitForTimeout(900);
  const after = await shape();
  console.log(JSON.stringify(after));
  H.check('it is STILL grouped — this is the bug', after.labels.length >= 1, after.labels);
  H.check('it is still not the flat renderer', !after.hasChevron && !after.hasCat,
    { chevron: after.hasChevron, cat: after.hasCat });
  H.check('the filter actually filtered', after.rows === 1, after.rows);
  H.check('the matching friend is the one shown',
    (await page.evaluate(() => (document.querySelector('#friends-list .chat-row-name') || {}).textContent)) === 'Mai Nguyen',
    await page.evaluate(() => (document.querySelector('#friends-list .chat-row-name') || {}).textContent));

  console.log('\n== a query that matches nothing ==');
  await page.fill('#search-friends', 'zzzz');
  await page.waitForTimeout(800);
  const none = await shape();
  H.check('it shows an empty state rather than a stray group', none.rows === 0 && !none.hasCat, none);

  console.log('\n== clearing the query restores everything ==');
  await page.fill('#search-friends', '');
  await page.waitForTimeout(800);
  const cleared = await shape();
  // 4 friends + 1 group — the group is a row in this list too.
  H.check('all rows are back', cleared.rows === 5, cleared.rows);
  H.check('the group labels are back', cleared.labels.length >= 2, cleared.labels);

  H.check('no page errors', errors.length === 0, errors);
  await page.screenshot({ path: path.join(H.SHOTS, 'contacts-grouped.png') });
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
