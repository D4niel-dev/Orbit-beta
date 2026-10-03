// In-chat search: scoped to the open conversation, with type filters.
const H = require('./harness.js');

const img = (n) => ({ type: 'image', url: 'icons/app/orbit_1024.png', name: n, mimeType: 'image/png' });
const aud = (n) => ({ type: 'audio', url: 'sounds/x.mp3', name: n, mimeType: 'audio/mpeg' });

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [
    { id: 'p_mai', name: 'Mai Nguyen', tag: '7714', status: 'online' },
    { id: 'p_ben', name: 'Ben Carter', tag: '0001', status: 'offline' }
  ],
  orbit_chats: [
    { id: 'p_mai', name: 'Mai Nguyen', lastMessage: 'ok', lastTime: H.t(2) },
    { id: 'p_ben', name: 'Ben Carter', lastMessage: 'later', lastTime: H.t(9) }
  ],
  // "build" appears in THIS chat...
  orbit_msg_p_mai: [
    { id: 'm1', from: 'p_mai', text: 'did the mobile build land', time: H.t(40) },
    { id: 'm2', from: 'me', text: 'yes, see https://orbit.example/notes', time: H.t(38) },
    { id: 'm3', from: 'p_mai', text: 'screenshot attached', time: H.t(30), attachments: [img('shot.png')] },
    { id: 'm4', from: 'me', text: '', time: H.t(20), attachments: [aud('voice-note.m4a')] },
    { id: 'm5', from: 'p_mai', text: 'unrelated chatter', time: H.t(10) }
  ],
  // ...and in the OTHER chat too. In-chat search must never reach it.
  orbit_msg_p_ben: [
    { id: 'b1', from: 'p_ben', text: 'the build is on main', time: H.t(60) },
    { id: 'b2', from: 'p_ben', text: 'also https://elsewhere.example', time: H.t(58) }
  ]
};

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  await page.evaluate(() => window.openChat('p_mai'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getElementById('btn-chat-search').click());
  await page.waitForTimeout(700);

  const type = async (q) => {
    await page.evaluate((v) => {
      const i = document.getElementById('chat-search-input');
      i.value = v;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }, q);
    await page.waitForTimeout(600);
  };
  const setType = async (t) => {
    await page.evaluate((v) => {
      document.querySelector('.chat-search-filter[data-ctype="' + v + '"]').click();
    }, t);
    await page.waitForTimeout(600);
  };
  const snap = () => page.evaluate(() => ({
    shown: document.querySelectorAll('#message-feed .message-row').length,
    count: (document.getElementById('chat-search-count') || {}).textContent,
    activePill: (document.querySelector('.chat-search-filter.active') || {}).textContent,
    text: document.getElementById('message-feed').textContent
  }));

  console.log('\n== text search is scoped to this chat ==');
  await type('build');
  let s = await snap();
  console.log('  ' + JSON.stringify({ shown: s.shown, count: s.count }));
  H.check('only this chat\'s match shows (1, not 2)', s.shown === 1, s.shown);
  H.check('the other chat\'s matching message is absent', s.text.indexOf('on main') === -1);
  H.check('says how many matched', s.count === '1 match', s.count);

  console.log('\n== type filters ==');
  await type('');
  await setType('media');
  s = await snap();
  H.check('Media shows only the image message', s.shown === 1, s.shown);
  H.check('Media pill is active', s.activePill === 'Media', s.activePill);

  await setType('voice');
  s = await snap();
  H.check('Voice shows only the voice note', s.shown === 1, s.shown);

  await setType('links');
  s = await snap();
  H.check('Links shows only the message with a URL', s.shown === 1, s.shown);
  H.check('Links found the right one', s.text.indexOf('orbit.example') !== -1);

  console.log('\n== text + type together ==');
  await setType('all');
  await type('zzzznothing');
  s = await snap();
  H.check('a query with no match says so', s.count === 'No matches', s.count);

  await setType('all');
  await type('');
  s = await snap();
  H.check('clearing shows the whole conversation', s.shown === 5, s.shown);
  H.check('the count clears too', s.count === '', s.count);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
