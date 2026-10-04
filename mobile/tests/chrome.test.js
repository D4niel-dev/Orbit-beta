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

  // ── The profile banner ──
  //
  // The banner used to be an inline `background-image` on .profile-hero, and the
  // restyle sets `background: transparent !important` on that element. The
  // shorthand resets background-image, and a stylesheet `!important` beats a
  // non-important inline style — so every custom banner was invisible. It is an
  // <img> now, which no background rule can reach.
  console.log('\n== the profile banner ==');
  // A self-contained SVG data URL, so this test does not depend on any generated
  // asset being on the machine.
  const BANNER = 'data:image/svg+xml;base64,' + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
    '<rect width="64" height="64" fill="#2f6f4f"/><circle cx="32" cy="32" r="18" fill="#d9b44a"/></svg>'
  ).toString('base64');

  await page.evaluate((banner) => {
    // Both places the own-profile hero reads from.
    if (window.MStore.user) window.MStore.user.banner = banner;
    if (window.MStore.currentUser) window.MStore.currentUser.banner = banner;
    window.MStore.save();
    if (window.showProfileSheet) window.showProfileSheet();
  }, BANNER);
  await page.waitForTimeout(1500);

  const banner = await page.evaluate(() => {
    // There is more than one `.profile-hero` in the DOM — the profile tab renders
    // one and the sheet renders another — so a bare querySelector('.profile-hero')
    // asserts about whichever happens to come first. Pick the hero that actually
    // carries the banner, falling back to the first.
    const heroes = Array.from(document.querySelectorAll('.profile-hero'));
    const img = document.querySelector('.profile-hero-banner');
    const hero = (img && img.closest('.profile-hero')) || heroes[0] || null;
    const accent = hero ? hero.querySelector('.profile-hero-bg') : null;
    return {
      hasClass: hero ? hero.classList.contains('has-banner') : null,
      imgFound: !!img,
      imgW: img ? Math.round(img.getBoundingClientRect().width) : 0,
      objectFit: img ? getComputedStyle(img).objectFit : null,
      // The bug in one line: the banner must not be carried as a CSS background,
      // because that is what the !important rule kills.
      heroBgImage: hero ? getComputedStyle(hero).backgroundImage : null,
      accentHidden: accent ? getComputedStyle(accent).display === 'none' : null,
      // A BAND, not a backdrop. `inset: 0` made the photo cover the whole hero.
      bannerH: img ? Math.round(img.getBoundingClientRect().height) : 0,
      heroH: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
      // The buttons must stay pinned to the corners. A blanket `position: relative`
      // on the hero's children outranked their own `position: absolute` and dropped
      // both into normal flow, stacked down the left edge.
      buttons: ['btn-profile-sheet-accounts', 'btn-profile-sheet-action'].map((id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const hr = hero.getBoundingClientRect();
        return { id: id, pos: cs.position, top: Math.round(r.top - hr.top),
          left: Math.round(r.left - hr.left), right: Math.round(hr.right - r.right) };
      })
    };
  });
  console.log(JSON.stringify(banner));
  H.check('a custom banner renders an <img> layer', banner.imgFound, banner);
  H.check('the hero carries the has-banner class', banner.hasClass, banner.hasClass);
  H.check('the banner image covers the hero', banner.imgW > 200 && banner.objectFit === 'cover',
    { w: banner.imgW, fit: banner.objectFit });
  H.check('the blurred accent steps aside when a banner is present', banner.accentHidden, banner.accentHidden);
  H.check('the banner is NOT a CSS background on the hero — that is the bug',
    banner.heroBgImage === 'none', banner.heroBgImage);
  H.check('the banner is a band, not a full-height backdrop',
    banner.bannerH > 0 && banner.bannerH < banner.heroH, { banner: banner.bannerH, hero: banner.heroH });

  // The avatar must STRADDLE the band's bottom edge, not sit inside it. With the
  // hero's own 44px padding an 88px avatar ends at 132px — entirely within the
  // band — so nothing crossed the edge and the whole hero read as crammed against
  // the top with dead space under it.
  const straddle = await page.evaluate(() => {
    // Scoped to the hero that HAS the banner. There are three `.profile-hero`
    // elements in the DOM — the profile tab renders one — and a bare
    // querySelector picks up whichever comes first. I made this exact mistake in
    // the banner block above and then made it again here.
    const band = document.querySelector('.profile-hero-banner');
    const hero = band ? band.closest('.profile-hero') : document.querySelector('.profile-hero');
    const av = hero && hero.querySelector('.profile-avatar-wrapper');
    if (!hero || !band || !av) return null;
    const h = hero.getBoundingClientRect();
    const bandBottom = band.getBoundingClientRect().bottom - h.top;
    const avTop = av.getBoundingClientRect().top - h.top;
    const avBottom = av.getBoundingClientRect().bottom - h.top;
    const img = av.querySelector('img');
    return {
      bandBottom: Math.round(bandBottom),
      avatarTop: Math.round(avTop),
      avatarBottom: Math.round(avBottom),
      crossesBy: Math.round(avBottom - bandBottom),
      ring: img ? getComputedStyle(img).borderTopWidth : null
    };
  });
  console.log(JSON.stringify(straddle));
  H.check('the avatar straddles the band rather than sitting inside it',
    straddle && straddle.crossesBy > 20, straddle);
  H.check('the avatar keeps its ring so it separates from the photo',
    straddle && parseFloat(straddle.ring) >= 3, straddle && straddle.ring);

  // The space between the tag and the edit form. It was ~79px of nothing —
  // 30 hero padding-bottom + 6 hero margin + 16 on the form's wrapper + 10 on the
  // section — and Dan reported it as "the gap below the name is too big".
  const gap = await page.evaluate(() => {
    const band = document.querySelector('.profile-hero-banner');
    const hero = band && band.closest('.profile-hero');
    const tag = hero && hero.querySelector('.profile-id');
    const heading = document.querySelector('.profile-edit-body .settings-section-title');
    if (!tag || !heading) return null;
    return Math.round(heading.getBoundingClientRect().top - tag.getBoundingClientRect().bottom);
  });
  // Cropping a banner must reach the hero, through the <img> layer.
  //
  // The live preview used to write `heroEl.style.backgroundImage`, which
  // `background: transparent !important` on .profile-hero resets — so the crop
  // modal closed, the URL field filled in, and the hero did not move. Asserting
  // on the save path does NOT catch this: the sheet re-renders from the store, so
  // a saved banner appears anyway. It has to be the live preview.
  console.log('\n== cropping a banner reaches the hero ==');
  // Close first: showProfileSheet() is a no-op on an already-open sheet, and the
  // picker button would not be there to click.
  await page.evaluate(() => {
    // Remove EVERY overlay, not just the first. `showProfileSheet` is a no-op on
    // an open sheet, and a stale one leaves two `#btn-pick-banner` elements —
    // the click then waits on the hidden one and times out.
    document.querySelectorAll('#profile-sheet-overlay').forEach((el) => el.remove());
    window.showProfileSheet && window.showProfileSheet();
  });
  await page.waitForTimeout(1200);
  const sheetCount = await page.evaluate(() => document.querySelectorAll('#profile-sheet-overlay').length);
  const pickerCount = await page.evaluate(() => document.querySelectorAll('#btn-pick-banner').length);
  console.log('  sheets in the DOM:', sheetCount, ' banner pickers:', pickerCount);
  const pickerThere = pickerCount > 0;
  H.check('the sheet offers a banner picker to drive', pickerThere, pickerThere);
  await page.evaluate(() => {
    // Start from no banner, so anything that appears came from the crop.
    if (window.MStore.user) window.MStore.user.banner = '';
    const band = document.querySelector('.profile-hero-banner');
    if (band) band.remove();
    const hero = document.querySelector('.profile-hero');
    if (hero) hero.classList.remove('has-banner');
  });

  const beforeCrop = await page.evaluate(() => ({
    hasBand: !!document.querySelector('.profile-hero-banner')
  }));

  // A real image, handed to the picker's own file chooser.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAAV0lEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvBsYAAABK5D4hAAAAABJRU5ErkJggg==',
    'base64');

  let cropOk = false, cropperOpened = false;
  try {
    // Click the picker to set its internal mode, then hand the file straight to
    // the input it uses. Waiting on a `filechooser` event does not work here —
    // the input is created by the sheet and clicked programmatically, so the
    // event never reaches the driver.
    await page.click('#btn-pick-banner');
    await page.waitForTimeout(300);
    await page.setInputFiles('#profile-file-input', { name: 'banner.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(2000);
    cropperOpened = await page.evaluate(() => document.querySelectorAll('.ic-action-btn').length >= 2);
    if (cropperOpened) {
      // Apply Crop is the second action button; Cancel is first.
      const btns = await page.$$('.ic-action-btn');
      await btns[1].click();
      await page.waitForTimeout(1600);
      cropOk = true;
    }
  } catch (e) {
    console.log('  (crop flow could not be driven: ' + e.message.slice(0, 60) + ')');
  }

  const afterCrop = await page.evaluate(() => {
    const hero = document.querySelector('.profile-hero');
    const band = hero && hero.querySelector('.profile-hero-banner');
    return {
      hasBand: !!band,
      hasClass: hero ? hero.classList.contains('has-banner') : null,
      bandSrcLen: band ? String(band.getAttribute('src')).length : 0,
      inlineBg: hero ? hero.style.backgroundImage.slice(0, 16) : null
    };
  });
  console.log('  before:', JSON.stringify(beforeCrop));
  console.log('  after :', JSON.stringify(afterCrop));
  // NOT `!cropOk || …`. If the flow cannot be driven, the assertion has to fail —
  // a green that passes because nothing ran is worse than a red.
  H.check('the crop flow was actually driven', cropOk, { cropOk: cropOk, cropperOpened: cropperOpened });
  H.check('the cropper opened on a chosen banner', cropperOpened, cropperOpened);
  H.check('applying a crop puts a band in the hero — not a background image',
    afterCrop.hasBand, afterCrop);
  H.check('the band carries the cropped image', afterCrop.bandSrcLen > 100, afterCrop);

  // The frame picker must offer every frame that exists. It stopped at 42 while
  // 55 exist, so the phone was twelve short of the desktop — and a picker missing
  // its last entries looks exactly like a picker that ends there.
  console.log('\n== the frame picker offers every frame ==');
  const frames = await page.evaluate(async () => {
    const btn = document.getElementById('frame-picker-btn');
    if (!btn) return { skipped: true };
    btn.click();
    await new Promise((r) => setTimeout(r, 800));
    const opts = Array.from(document.querySelectorAll('.frame-option'));
    const nums = opts.map((el) => parseInt(el.getAttribute('data-frame'), 10)).filter((n) => !isNaN(n));
    const real = nums.filter((n) => n > 0);
    return {
      options: opts.length,
      realFrames: real.length,
      highest: real.length ? Math.max.apply(null, real) : 0,
      declared: (window.ProfileFrames && window.ProfileFrames.COUNT) || null
    };
  });
  console.log('  ' + JSON.stringify(frames));
  H.check('the picker lists every declared frame',
    frames.skipped || (frames.declared !== null && frames.realFrames === frames.declared), frames);
  H.check('the highest frame offered is the last one that exists',
    frames.skipped || frames.highest === frames.declared, frames);

  console.log('  gap from the tag to Edit Profile:', gap + 'px');
  // 36 rather than the 18 this state measures, because the exact figure depends
  // on which avatar and frame are seeded. The bug being guarded against was ~79px.
  H.check('the gap under the name is tight, not a hole', gap !== null && gap <= 36, gap + 'px');

  // Both sheet buttons are pinned to opposite top corners. They were stacked down
  // the left edge when a blanket `position: relative` took them out of absolute.
  const acct = banner.buttons[0], act = banner.buttons[1];
  H.check('both sheet buttons exist', !!acct && !!act, banner.buttons);
  H.check('both are absolutely positioned', acct && act && acct.pos === 'absolute' && act.pos === 'absolute',
    banner.buttons.map((b) => b && b.pos));
  H.check('the account button is pinned top-LEFT', acct && acct.top === 10 && acct.left === 12,
    acct && { top: acct.top, left: acct.left });
  H.check('the close button is pinned top-RIGHT, not under the first one',
    act && act.top === 10 && act.right === 12 && act.left > 200,
    act && { top: act.top, right: act.right, left: act.left });

  const hero2 = await page.$('.profile-hero');
  if (hero2) await hero2.screenshot({ path: path.join(H.SHOTS, 'chrome-banner.png') });
  await page.evaluate(() => window.closeProfileSheet && window.closeProfileSheet());
  await page.waitForTimeout(700);

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
