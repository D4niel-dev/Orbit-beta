// The Friends / Groups / folders segmented control on the Chats tab.
//
// I hid this during the restyle, reasoning that groups already render inline in
// the Chats list and under GROUPS in Contacts. That was wrong on two counts: it
// removed the only way to scope the list to one kind, and because the hide rule
// was `#home-tabs:not(.has-folders)`, it ALSO meant the folder rail only appeared
// to people who already had a folder — the feature was invisible until you had
// already found it.
const H = require('./harness.js');
const path = require('path');

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: { id: 'u_dan', name: 'D4niel', tag: '2847', status: 'online' },
    orbit_friends: [
      { id: 'echo', name: 'Orbit Echo', tag: 'BOT', status: 'online', avatar: 'icons/app/orbit_1024.png' },
      { id: 'p_mai', name: 'Mai Nguyen', tag: '7714', status: 'online' },
      { id: 'p_ben', name: 'Ben Carter', tag: '0001', status: 'offline' }
    ],
    orbit_groups: [{ id: 'g_crew', name: 'Weekend Crew', members: ['p_mai', 'p_ben', 'u_dan'] }],
    orbit_chats: [
      { id: 'p_mai', name: 'Mai Nguyen', lastMessage: 'see you then', lastTime: new Date().toISOString(), status: 'online', unread: 2 },
      { id: 'echo', name: 'Orbit Echo', lastMessage: 'Echo: hi', lastTime: new Date().toISOString(), status: 'online' },
      { id: 'p_ben', name: 'Ben Carter', lastMessage: 'on main', lastTime: new Date().toISOString(), status: 'offline' },
      { id: 'g_crew', name: 'Weekend Crew', lastMessage: 'saturday', lastTime: new Date().toISOString() }
    ],
    orbit_settings: { theme: 'dark', experimentalFolders: true },
    // Both are needed: getChatFolders() walks chatFolderOrder and looks each id up
    // in chatFolders, so a folder present only in the map is invisible.
    orbit_chatFolders: { folder_1: { id: 'folder_1', name: 'Work', icon: 'folder', chatIds: ['p_ben'] } },
    orbit_chatFolderOrder: ['folder_1']
  });

  await page.evaluate(() => window.OrbitNav && window.OrbitNav.switchTo('chats'));
  await page.waitForTimeout(1400);

  const state = async () => page.evaluate(() => {
    const t = document.getElementById('home-tabs');
    const active = t.querySelector('.home-tab.active');
    return {
      visible: getComputedStyle(t).display !== 'none',
      height: t.getBoundingClientRect().height,
      tabs: Array.from(t.querySelectorAll('.home-tab')).map(b => b.textContent.trim()),
      active: active ? active.getAttribute('data-tab') || active.getAttribute('data-folder-id') : null,
      rows: Array.from(document.querySelectorAll('#chat-list .chat-row')).map(r =>
        (r.querySelector('.chat-row-name') || {}).textContent),
      activeNowVisible: getComputedStyle(document.getElementById('online-friends-section')).display !== 'none',
      // The strip must sit above the Active now row — it scopes everything below.
      tabsAboveActiveNow: (() => {
        const a = t.getBoundingClientRect(), b = document.getElementById('online-friends-section').getBoundingClientRect();
        return a.top < b.top || b.height === 0;
      })()
    };
  });

  console.log('\n== the strip is present and first ==');
  const init = await state();
  console.log(JSON.stringify(init));
  H.check('the tab strip is visible', init.visible && init.height > 0, { visible: init.visible, h: init.height });
  H.check('it sits above the Active now row', init.tabsAboveActiveNow, init);
  H.check('it has Friends and Groups', init.tabs.indexOf('Friends') !== -1 && init.tabs.indexOf('Groups') !== -1, init.tabs);

  console.log('\n== Friends shows direct messages only ==');
  await page.click('#home-tabs .home-tab[data-tab="friends"]');
  await page.waitForTimeout(900);
  const friends = await state();
  console.log(JSON.stringify(friends.rows));
  H.check('the group is filtered out', friends.rows.indexOf('Weekend Crew') === -1, friends.rows);
  H.check('the direct messages are still there', friends.rows.length >= 3, friends.rows);
  H.check('Active now is shown on Friends', friends.activeNowVisible);

  console.log('\n== Groups shows groups only, and drops Active now ==');
  await page.click('#home-tabs .home-tab[data-tab="groups"]');
  await page.waitForTimeout(900);
  const groups = await state();
  console.log(JSON.stringify(groups.rows));
  H.check('only the group is listed', groups.rows.length === 1 && groups.rows[0] === 'Weekend Crew', groups.rows);
  H.check('Active now is hidden on Groups — they are online FRIENDS', !groups.activeNowVisible);
  await page.screenshot({ path: path.join(H.SHOTS, 'home-tabs-groups.png') });

  console.log('\n== folders appear as tabs ==');
  const folders = await page.evaluate(() => Array.from(
    document.querySelectorAll('#home-tabs .home-tab-folder')).map(b => b.textContent.trim()));
  console.log(JSON.stringify(folders));
  H.check('the folder has a tab', folders.indexOf('Work') !== -1, folders);
  H.check('the strip is in its has-folders layout',
    await page.evaluate(() => document.getElementById('home-tabs').classList.contains('has-folders')));

  await page.click('#home-tabs .home-tab-folder');
  await page.waitForTimeout(900);
  const inFolder = await state();
  console.log(JSON.stringify(inFolder.rows));
  H.check('the folder tab filters to its chats', inFolder.rows.length === 1 && inFolder.rows[0] === 'Ben Carter', inFolder.rows);

  await page.click('#home-tabs .home-tab[data-tab="friends"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(H.SHOTS, 'home-tabs-friends.png') });

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
