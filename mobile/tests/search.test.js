// Global search in the Chats header.
//
// The bug this guards: _buildSearchResults read `MStore.messages[chatId]`
// directly, but the store LAZY-LOADS — only the open conversation is in memory —
// so message search could only ever find messages in the chat you were already
// looking at. Every query for anything else came back empty.
const H = require('./harness.js');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [
    { id: 'echo', name: 'Orbit Echo', tag: 'BOT', status: 'online', avatar: 'icons/app/orbit_1024.png' },
    { id: 'p_mai', name: 'Mai Nguyen', tag: '7714', status: 'online' },
    { id: 'p_ben', name: 'Ben Carter', tag: '0001', status: 'offline' }
  ],
  orbit_chats: [
    { id: 'echo', name: 'Orbit Echo', avatar: 'icons/app/orbit_1024.png', lastMessage: 'ok', lastTime: H.t(5) },
    { id: 'p_mai', name: 'Mai Nguyen', lastMessage: 'see you', lastTime: H.t(3) },
    { id: 'p_ben', name: 'Ben Carter', lastMessage: 'later', lastTime: H.t(9) }
  ],
  orbit_msg_p_mai: [
    { id: 'm1', from: 'p_mai', text: 'did the mobile build land', time: H.t(40) },
    { id: 'm2', from: 'me', text: 'yes the build landed', time: H.t(38) }
  ],
  orbit_msg_p_ben: [
    { id: 'b1', from: 'p_ben', text: 'the build is on main', time: H.t(60) }
  ]
};

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  const openSearch = () => page.evaluate(() => document.getElementById('btn-search-home').click());
  const type = async (q) => {
    await page.evaluate((v) => {
      const i = document.getElementById('home-search-input');
      i.value = v;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }, q);
    await page.waitForTimeout(700);
  };
  const snap = () => page.evaluate(() => {
    const c = document.getElementById('chat-list');
    return {
      rows: c.querySelectorAll('.search-result-item').length,
      pills: Array.from(c.querySelectorAll('.search-filter-btn')).map(x => x.textContent.trim()),
      sections: Array.from(c.querySelectorAll('.search-results-section-header')).map(x => x.textContent.trim()),
      highlighted: c.querySelectorAll('.search-result-preview strong, .search-result-name strong').length,
      onlineHidden: getComputedStyle(document.getElementById('online-friends-section')).display === 'none',
      chatRows: document.querySelectorAll('#chat-list .chat-row').length
    };
  });

  await openSearch();
  await page.waitForTimeout(500);

  console.log('\n== a word that only appears in message bodies ==');
  await type('build');
  let s = await snap();
  console.log('  ' + JSON.stringify(s));
  H.check('finds messages in chats that are NOT open', s.rows === 3, s.rows);
  H.check('marks the matched run', s.highlighted === 3, s.highlighted);
  H.check('"Active now" is hidden during a search', s.onlineHidden);
  H.check('filter pills show the counts', s.pills.join('|') === 'All3|Chats0|People0|Messages3', s.pills);

  console.log('\n== filters ==');
  await page.evaluate(() => window._searchSetType('messages'));
  await page.waitForTimeout(600);
  H.check('Messages filter keeps the messages', (await snap()).rows === 3);
  await page.evaluate(() => window._searchSetType('chats'));
  await page.waitForTimeout(600);
  H.check('Chats filter is empty for a word in no chat name', (await snap()).rows === 0);
  await page.evaluate(() => window._searchSetType('all'));
  await page.waitForTimeout(600);

  console.log('\n== a person, by name and by tag ==');
  await type('mai');
  s = await snap();
  console.log('  ' + JSON.stringify(s.sections));
  H.check('name search finds the chat and the person', s.rows >= 2, s.rows);
  await type('7714');
  s = await snap();
  H.check('searching the tag finds the person', s.rows >= 1, s.rows);

  console.log('\n== clearing ==');
  await type('');
  s = await snap();
  H.check('the chat list comes back', s.chatRows === 3, s.chatRows);
  H.check('"Active now" comes back', !s.onlineHidden);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
