// The composer's send / mic swap, under an Android-shaped touch sequence.
//
// ⚠ WHAT THIS DOES NOT DO: it does not reproduce the ghost-mic bug.
//
// The bug: Android fires a full set of synthetic mouse events after every
// touchend, aimed at whatever is under the finger WHEN THEY FIRE rather than the
// element the touch began on. Send fires on touchend, which swaps the composer to
// the mic, so the synthetic mousedown lands on the mic and starts a recording the
// mouseup then stops and sends. One tap, a voice message nobody asked for.
//
// I tried to replay that sequence here twice — first with page.tap(), then by
// dispatching touchstart/touchend/mousedown/mouseup by hand at the coordinates.
// Both PASS against the pre-fix build. The recording never actually starts in this
// browser, so the run cannot tell the fix from its absence. A green here means
// nothing about that bug, and saying otherwise would be worse than no test.
//
// What it DOES cover, and why it is still worth keeping: the composer's end state
// after a full sequence, and that exactly one message is sent. Those would catch a
// regression in the swap itself.
const H = require('./harness.js');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [{ id: 'p_echo', name: 'Orbit Echo', tag: '0001', status: 'online' }],
  orbit_chats: [{ id: 'p_echo', name: 'Orbit Echo', lastMessage: '', lastTime: H.t(2) }],
  orbit_msg_p_echo: []
};

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  await page.evaluate(() => window.openChat('p_echo'));
  await page.waitForTimeout(1500);

  console.log('\n== with text, the send button is the one showing ==');
  await page.fill('#chat-input', 'one tap please');
  await page.waitForTimeout(400);

  const typing = await page.evaluate(() => ({
    voiceVisible: getComputedStyle(document.getElementById('btn-voice')).display !== 'none',
    sendVisible: getComputedStyle(document.getElementById('btn-send')).display !== 'none',
    sendDisabled: document.getElementById('btn-send').disabled
  }));
  console.log('  ' + JSON.stringify(typing));
  H.check('the send button is showing, not the mic', typing.sendVisible && !typing.voiceVisible, typing);
  H.check('and it is enabled — lit up, not dimmed', typing.sendDisabled === false, typing);

  console.log('\n== one tap sends one message and leaves the composer clean ==');
  // Android's order: touchstart, touchend, then the compatibility mouse events
  // aimed at whatever is under the point by then.
  await page.evaluate(() => {
    const btn = document.getElementById('btn-send');
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const touch = (target, type) => target.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target, clientX: x, clientY: y })],
      targetTouches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target, clientX: x, clientY: y })],
      changedTouches: [new Touch({ identifier: 1, target, clientX: x, clientY: y })]
    }));
    const mouse = (target, type) => target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }));

    touch(btn, 'touchstart');
    touch(btn, 'touchend');
    const under = document.elementFromPoint(x, y) || document.body;
    window.__under = under.closest ? (under.closest('button') || {}).id || '(none)' : '(none)';
    mouse(under, 'mousedown');
    mouse(under, 'mouseup');
    mouse(under, 'click');
  });
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const msgs = window.MStore.messages['p_echo'] || [];
    return {
      underAfterSwap: window.__under,
      sent: msgs.length,
      attachments: msgs.reduce((n, m) => n + ((m.attachments && m.attachments.length) || 0), 0),
      input: document.getElementById('chat-input').value,
      voiceVisible: getComputedStyle(document.getElementById('btn-voice')).display !== 'none',
      sendVisible: getComputedStyle(document.getElementById('btn-send')).display !== 'none'
    };
  });
  console.log('  after the tap: ' + JSON.stringify(after));
  console.log('  (the swap puts ' + after.underAfterSwap + ' under the finger — that is the bug\'s shape)');

  H.check('exactly one message was sent', after.sent === 1, after);
  H.check('nothing was attached to it', after.attachments === 0, after);
  H.check('the input cleared', after.input === '', after);
  H.check('the composer went back to the mic', after.voiceVisible && !after.sendVisible, after);

  console.log('\n== and it stays settled ==');
  await page.waitForTimeout(1500);
  const settled = await page.evaluate(() => (window.MStore.messages['p_echo'] || []).length);
  H.check('still one message a moment later — no loop', settled === 1, settled);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
