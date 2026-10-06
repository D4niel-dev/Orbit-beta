// The attachment grid, with images of different proportions.
//
// The bug: every cell took its own image's height, so a 1:1 beside a 16:9 beside
// a 9:16 gave three heights in one row. The tallest set the row, the others
// floated inside it, and the grid stopped reading as a grid.
//
// Dan's rule:
//   - one image        keeps its own proportions — it is the whole message
//   - two or more      square, so no image can disturb another's size
//   - unless EVERY image in the group shares one ratio, in which case keep it
//   - three images     the third centres below the first two
const H = require('./harness.js');
const sharp = require('C:/Users/KHAC DUY/Desktop/Orbit Beta/desktop/node_modules/sharp');

// Real images of known proportions, as data URLs so they are complete
// immediately — naturalWidth is what the settle pass reads.
const make = async (w, h) => {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 70, g: 130, b: 200 } } })
    .png().toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
};

(async () => {
  const square = await make(200, 200);
  const wide = await make(320, 180);
  const tall = await make(180, 320);

  const img = (n, url) => ({ id: n, type: 'image', name: n + '.png', url: url, mimeType: 'image/png' });

  const SEED = {
    orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
    orbit_friends: [{ id: 'p_echo', name: 'Orbit Echo', tag: '0001', status: 'online' }],
    orbit_chats: [{ id: 'p_echo', name: 'Orbit Echo', lastMessage: '', lastTime: H.t(2) }],
    orbit_msg_p_echo: [
      { id: 'one', from: 'p_echo', text: '', time: H.t(90), attachments: [img('a', square)] },
      { id: 'two-mixed', from: 'p_echo', text: '', time: H.t(80), attachments: [img('b', square), img('c', wide)] },
      { id: 'three', from: 'p_echo', text: '', time: H.t(70), attachments: [img('d', square), img('e', wide), img('f', tall)] },
      { id: 'four-mixed', from: 'p_echo', text: '', time: H.t(60), attachments: [img('g', square), img('h', wide), img('i', tall), img('j', square)] },
      { id: 'three-wide', from: 'p_echo', text: '', time: H.t(50), attachments: [img('k', wide), img('l', wide), img('m', wide)] }
    ]
  };

  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);
  await page.evaluate(() => window.openChat('p_echo'));
  await page.waitForTimeout(3000);

  const read = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.message-row').forEach((row) => {
      const id = row.getAttribute('data-msg-id');
      const grid = row.querySelector('.att-grid');
      if (!grid) return;
      const cells = Array.from(grid.querySelectorAll('.att-grid-cell'));
      const px = (el, p) => getComputedStyle(el)[p];
      const gr = grid.getBoundingClientRect();
      out[id] = {
        count: grid.getAttribute('data-count'),
        uniform: grid.getAttribute('data-uniform'),
        cellAspect: cells.map((c) => px(c, 'aspectRatio')),
        // Heights of the first row's cells — the thing that used to differ.
        // The images, not the cells: a grid row stretches its cells to a common
        // height either way, so measuring the cells proves nothing.
        firstRowImgHeights: cells.slice(0, 2).map((c) => {
          const i = c.querySelector('img');
          return i ? Math.round(i.getBoundingClientRect().height) : null;
        }),
        firstRowImgWidths: cells.slice(0, 2).map((c) => {
          const i = c.querySelector('img');
          return i ? Math.round(i.getBoundingClientRect().width) : null;
        }),
        third: cells[2] ? {
          centreOffsetFromGrid: Math.round((cells[2].getBoundingClientRect().left + cells[2].getBoundingClientRect().width / 2) - (gr.left + gr.width / 2)),
          belowFirstRow: Math.round(cells[2].getBoundingClientRect().top - cells[0].getBoundingClientRect().bottom)
        } : null
      };
    });
    return out;
  });
  console.log(JSON.stringify(read, null, 1));

  console.log('\n== one image keeps its own proportions ==');
  H.check('a lone image is not forced square', read.one && read.one.cellAspect[0] === 'auto', read.one);

  console.log('\n== two or more go square ==');
  for (const id of ['two-mixed', 'three', 'four-mixed']) {
    const r = read[id];
    H.check(id + ': every cell is 1:1',
      r && r.cellAspect.every((a) => a === '1 / 1'), r && r.cellAspect);
    H.check(id + ': the two images in the first row are the same size',
      r && r.firstRowImgHeights[0] === r.firstRowImgHeights[1] && r.firstRowImgWidths[0] === r.firstRowImgWidths[1],
      r && { h: r.firstRowImgHeights, w: r.firstRowImgWidths });
  }

  console.log('\n== the third image centres below the first two ==');
  const three = read.three;
  H.check('it is centred, not left-aligned',
    three && Math.abs(three.third.centreOffsetFromGrid) <= 2, three && three.third);
  H.check('and it sits below the first row, not beside it',
    three && three.third.belowFirstRow >= 0, three && three.third);

  console.log('\n== a group that shares one ratio keeps it ==');
  H.check('three 16:9 images stay 16:9', read['three-wide'] && read['three-wide'].uniform === '1', read['three-wide']);
  H.check('and are not squared', read['three-wide'] && read['three-wide'].cellAspect[0] === 'auto', read['three-wide']);

  console.log('\n== a mixed group is not marked uniform ==');
  H.check('four mixed images are squared, not uniform',
    read['four-mixed'] && read['four-mixed'].uniform === null, read['four-mixed']);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
