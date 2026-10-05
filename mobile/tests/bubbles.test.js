// The conversation screen: each kind of content gets the treatment it needs.
//
// Before this, everything a message carried lived inside ONE `.message-bubble` —
// text, images, files, video, audio — so a photo had a bubble around it (a frame
// around a frame) and a file was whatever was left over. The attachments moved
// out into a sibling `.msg-attachments`, and:
//
//   text        a bubble, unchanged
//   images      no bubble, natural aspect, hairline
//   files       a bubble of their own, with an icon that matches the type
//   video/audio no bubble, a shadow
//
// Your own messages also stopped being a solid block of accent.
const H = require('./harness.js');

const img = (n) => ({ type: 'image', url: 'icons/app/orbit_1024.png', name: n, mimeType: 'image/png' });
const file = (n, mime) => ({ type: 'file', url: '', name: n, mimeType: mime, size: 1024 });

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [{ id: 'p_mai', name: 'Mai Nguyen', tag: '7714', status: 'online' }],
  orbit_chats: [{ id: 'p_mai', name: 'Mai Nguyen', lastMessage: 'ok', lastTime: H.t(2) }],
  orbit_msg_p_mai: [
    { id: 'm1', from: 'p_mai', text: 'a plain text message', time: H.t(60) },
    { id: 'm2', from: 'me', text: 'and one of mine', time: H.t(58) },
    { id: 'm3', from: 'p_mai', text: '', time: H.t(50), attachments: [img('sunset.png')] },
    { id: 'm4', from: 'p_mai', text: 'and the archive', time: H.t(40), attachments: [file('orbit-source.zip', 'application/zip')] },
    { id: 'm5', from: 'p_mai', text: '', time: H.t(30), attachments: [file('settings.json', 'application/json')] },
    { id: 'm6', from: 'p_mai', text: '', time: H.t(20), attachments: [file('notes.pdf', 'application/pdf')] }
  ]
};

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  await page.evaluate(() => window.openChat('p_mai'));
  await page.waitForTimeout(1500);

  const rows = await page.evaluate(() => {
    const px = (el, prop) => el ? getComputedStyle(el)[prop] : null;
    const out = {};
    document.querySelectorAll('.message-row').forEach((r) => {
      const id = r.getAttribute('data-msg-id');
      if (!id) return;
      const bubble = r.querySelector('.message-bubble');
      const atts = r.querySelector('.msg-attachments');
      const imgEl = atts && atts.querySelector('.att-grid-cell img');
      const cell = imgEl && imgEl.parentElement;
      const fileCell = atts && atts.querySelector('.att-file-cell');
      const svg = fileCell && fileCell.querySelector('svg');
      out[id] = {
        side: r.classList.contains('mine') ? 'mine' : 'other',
        hasBubble: !!bubble,
        bubbleBg: bubble ? (px(bubble, 'backgroundColor') + ' | ' + px(bubble, 'backgroundImage')).replace(/\s+/g, ' ') : null,
        bubbleText: bubble ? bubble.textContent.trim() : null,
        hasAtts: !!atts,
        attsInsideBubble: !!(bubble && bubble.querySelector('.msg-attachments')),
        imgFit: imgEl ? px(imgEl, 'objectFit') : null,
        imgAspect: cell ? px(cell, 'aspectRatio') : null,
        fileIcon: svg ? (Array.from(svg.classList).find((c) => c.indexOf('lucide-') === 0) || '').replace('lucide-', '') : null
      };
    });
    return out;
  });

  console.log('\n== text keeps a bubble ==');
  H.check('a text message has a bubble', rows.m1 && rows.m1.hasBubble, rows.m1);
  H.check('and its text is in it', rows.m1 && rows.m1.bubbleText === 'a plain text message', rows.m1 && rows.m1.bubbleText);

  console.log('\n== your own messages match theirs ==');
  H.check('mine has a bubble too', rows.m2 && rows.m2.hasBubble, rows.m2);
  H.check('with the SAME fill as theirs — no more accent block',
    rows.m1 && rows.m2 && rows.m1.bubbleBg === rows.m2.bubbleBg,
    { mine: rows.m2 && rows.m2.bubbleBg, theirs: rows.m1 && rows.m1.bubbleBg });

  console.log('\n== an image on its own gets no bubble ==');
  H.check('no empty bubble above the photo', rows.m3 && rows.m3.hasBubble === false, rows.m3);
  H.check('the image is not square-cropped', rows.m3 && rows.m3.imgFit === 'contain', rows.m3 && rows.m3.imgFit);
  H.check('and keeps its natural aspect', rows.m3 && rows.m3.imgAspect === 'auto', rows.m3 && rows.m3.imgAspect);

  console.log('\n== attachments live outside the bubble ==');
  H.check('text + file: the bubble holds the text', rows.m4 && rows.m4.hasBubble && rows.m4.bubbleText === 'and the archive', rows.m4);
  H.check('and the attachment is not inside it', rows.m4 && rows.m4.attsInsideBubble === false, rows.m4);

  console.log('\n== the icon matches the file type ==');
  H.check('.zip gets file-archive', rows.m4 && rows.m4.fileIcon === 'file-archive', rows.m4 && rows.m4.fileIcon);
  H.check('.json gets file-code', rows.m5 && rows.m5.fileIcon === 'file-code', rows.m5 && rows.m5.fileIcon);
  H.check('.pdf gets file-text', rows.m6 && rows.m6.fileIcon === 'file-text', rows.m6 && rows.m6.fileIcon);

  console.log('\n== the classic toggle brings the accent back ==');
  const classic = await page.evaluate(() => {
    window.MStore.settings.classicBubbles = true;
    if (window.applyClassicBubbles) window.applyClassicBubbles();
    const mine = document.querySelector('.message-row.mine .message-bubble');
    const theirs = document.querySelector('.message-row.other .message-bubble');
    return {
      attr: document.documentElement.getAttribute('data-classic-bubbles'),
      mine: mine ? getComputedStyle(mine).backgroundColor : null,
      theirs: theirs ? getComputedStyle(theirs).backgroundColor : null
    };
  });
  console.log('  ' + JSON.stringify(classic));
  H.check('the flag reaches the document', classic.attr === 'true', classic.attr);
  H.check('and mine is the accent again, while theirs is not',
    classic.mine && classic.theirs && classic.mine !== classic.theirs, classic);

  // The bug this whole rework started from: the bubble fills were HARDCODED, so
  // in the light theme the incoming bubble stayed dark while the text went dark
  // with the rest of the app. The message was there and unreadable. Assert the
  // contrast, in both themes, rather than the colours — the colours are allowed
  // to change, the readability is not.
  // Back to the default first — the classic block above leaves the accent on,
  // and the contrast of the DEFAULT is what this is here to protect.
  await page.evaluate(() => {
    window.MStore.settings.classicBubbles = false;
    if (window.applyClassicBubbles) window.applyClassicBubbles();
  });

  console.log('\n== the text is readable on its own bubble, in both themes ==');
  const contrastIn = async (theme) => {
    return page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      const lum = (rgb) => {
        const m = /rgba?\((\d+), *(\d+), *(\d+)/.exec(rgb || '');
        if (!m) return null;
        const [r, g, b] = [1, 2, 3].map((i) => {
          const v = parseInt(m[i], 10) / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (fg, bg) => {
        const a = lum(fg), b2 = lum(bg);
        if (a === null || b2 === null) return null;
        const hi = Math.max(a, b2), lo = Math.min(a, b2);
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      };
      const out = {};
      document.querySelectorAll('.message-row').forEach((r) => {
        const bubble = r.querySelector('.message-bubble');
        if (!bubble) return;
        const side = r.classList.contains('mine') ? 'mine' : 'other';
        const cs = getComputedStyle(bubble);
        // A gradient fill leaves backgroundColor transparent; resolve the
        // effective backdrop from the theme's own surface token instead.
        const bg = cs.backgroundColor === 'rgba(0, 0, 0, 0)'
          ? getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim()
          : cs.backgroundColor;
        out[side] = { fg: cs.color, bg: bg, ratio: ratio(cs.color, bg) };
      });
      return out;
    }, theme);
  };

  for (const theme of ['dark', 'light']) {
    const res = await contrastIn(theme);
    console.log('  ' + theme + ': ' + JSON.stringify(res));
    for (const side of ['mine', 'other']) {
      const r = res[side];
      H.check(theme + '/' + side + ' text is readable on its bubble (>= 4.5:1)',
        r && r.ratio !== null && r.ratio >= 4.5, r);
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  // The classic mode is deliberately NOT held to AA: white on the accent is
  // 3.73:1. Recorded rather than asserted so the number is visible in the run —
  // fixing it means changing the accent or the text colour, which is Dan's call,
  // not a test's.
  const classicContrast = await page.evaluate(() => {
    window.MStore.settings.classicBubbles = true;
    if (window.applyClassicBubbles) window.applyClassicBubbles();
    const b = document.querySelector('.message-row.mine .message-bubble');
    const cs = getComputedStyle(b);
    const lum = (rgb) => {
      const m = /rgba?\((\d+), *(\d+), *(\d+)/.exec(rgb || '');
      if (!m) return null;
      const [r, g, bl] = [1, 2, 3].map((i) => {
        const v = parseInt(m[i], 10) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const bg = cs.backgroundColor === 'rgba(0, 0, 0, 0)'
      ? getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
      : cs.backgroundColor;
    const a = lum(cs.color), c = lum(bg);
    return Math.round(((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)) * 100) / 100;
  });
  console.log('  classic mode: white on the accent = ' + classicContrast + ':1  (AA wants 4.5)');
  H.check('the classic mode still renders at all', classicContrast > 1, classicContrast);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
