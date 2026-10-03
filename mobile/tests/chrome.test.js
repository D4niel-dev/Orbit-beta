// Shared chrome: the profile frame and the toasts.
//
// The frame bug is worth pinning because of HOW it broke, not what it looked
// like. `img.pfp-frame` (components.css) is (0,1,1) and carries `!important`;
// redesign.css's `.profile-avatar-wrapper img` is ALSO (0,1,1) and also
// `!important`. Equal weight means `!important` does not decide it — LOAD ORDER
// does, and redesign.css loads last. So a bare `img` rule in the restyle layer
// silently put a solid fill behind every profile frame.
//
// The fix was two-part: scope the avatar rule with `:not(.pfp-frame)`, and make
// the frame's own rule (0,2,1) so it cannot be beaten on weight again. This test
// would have caught it: it asserts the computed background, not the markup.
const H = require('./harness.js');
const path = require('path');

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, {
    orbit_user: {
      id: 'u_dan', name: 'D4niel-dev', tag: '2847', status: 'online',
      bio: 'D4niel, the dev', avatar: 'icons/app/orbit_1024.png'
    },
    orbit_settings: { theme: 'dark', profileFrames: true, profileFrame: 7, appZoom: 100 }
  });
  await page.evaluate(() => document.documentElement.setAttribute('data-exp-frames', 'true'));

  console.log('\n== the profile frame ==');
  await page.evaluate(() => window.showProfileSheet && window.showProfileSheet());
  await page.waitForTimeout(1500);

  const f = await page.evaluate(() => {
    const frame = document.querySelector('.profile-avatar-wrapper img.pfp-frame');
    const avatar = document.querySelector('.profile-avatar-wrapper img:not(.pfp-frame)');
    if (!frame) return { error: 'no frame rendered' };
    const fs = getComputedStyle(frame);
    return {
      bg: fs.backgroundColor,
      bgImage: fs.backgroundImage,
      w: fs.width,
      radius: fs.borderRadius,
      avatarBg: avatar ? getComputedStyle(avatar).backgroundColor : null
    };
  });
  if (f.error) { H.check('a frame renders', false, f.error); }
  H.check('the frame has no background fill',
    f.bg === 'rgba(0, 0, 0, 0)' || f.bg === 'transparent', f.bg);
  H.check('the frame has no background image', f.bgImage === 'none', f.bgImage);
  H.check('the frame is still 125% of the avatar', f.w === '110px', f.w + ' (88px wrapper)');
  H.check('the frame has no corner radius', f.radius === '0px', f.radius);
  H.check('the AVATAR still gets its own fill — the rule was scoped, not deleted',
    f.avatarBg && f.avatarBg !== 'rgba(0, 0, 0, 0)', f.avatarBg);

  const hero = await page.$('.profile-hero');
  if (hero) await hero.screenshot({ path: path.join(H.SHOTS, 'chrome-frame.png') });
  await page.evaluate(() => window.closeProfileSheet && window.closeProfileSheet());
  await page.waitForTimeout(800);

  console.log('\n== the toasts ==');
  await page.evaluate(() => {
    window.showToast('Message copied to clipboard', 'success');
    window.showToast('Could not reach the peer', 'error');
    window.showToast('This file is larger than 500 MB', 'warning');
    window.showToast('Mai Nguyen is now online', 'info');
  });
  await page.waitForTimeout(900);

  const t = await page.evaluate(() => {
    const all = document.querySelectorAll('.toast-mobile');
    if (!all.length) return { error: 'no toasts' };
    const first = all[0];
    const fs = getComputedStyle(first);
    const icon = first.querySelector('svg, i');
    const bar = first.querySelector('.toast-bar');
    return {
      count: all.length,
      radius: fs.borderRadius,
      font: fs.fontFamily.split(',')[0].replace(/["']/g, ''),
      before: getComputedStyle(first, '::before').display,
      iconBg: icon ? getComputedStyle(icon).backgroundColor : null,
      iconW: icon ? getComputedStyle(icon).width : null,
      // The INFO toast specifically. An info toast carries no type class, so it is
      // the one that used to inherit --text-primary and draw a white line.
      infoBarColor: (() => {
        const info = Array.from(all).find(x => !/toast-(success|error|warning)/.test(x.className));
        const b = info && info.querySelector('.toast-bar');
        return b ? getComputedStyle(b).color : null;
      })(),
      successBarColor: bar ? getComputedStyle(bar).color : null
    };
  });
  if (t.error) { H.check('toasts render', false, t.error); }
  H.check('all four types render', t.count === 4, t.count);
  H.check('the radius comes from the ladder, not a hardcoded 12px', t.radius !== '12px', t.radius);
  H.check('the old left accent bar is gone', t.before === 'none', t.before);
  H.check('the icon is a 30px tile, not a bare 20px glyph', t.iconW === '30px', t.iconW);
  H.check('the icon tile is tinted', t.iconBg && t.iconBg !== 'rgba(0, 0, 0, 0)', t.iconBg);
  H.check('the progress bar is tinted per type',
    t.successBarColor === 'rgb(52, 211, 153)', t.successBarColor);
  H.check('an INFO toast bar takes the accent, not inherited white',
    t.infoBarColor === 'rgb(77, 124, 254)', t.infoBarColor);

  await page.screenshot({ path: path.join(H.SHOTS, 'chrome-toasts.png') });

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
