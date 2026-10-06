// The attachment grid, laid out the way Discord does it.
//
// The bug it replaced: every cell took its own image's height, so a 1:1 beside a
// 16:9 beside a 9:16 gave three heights in one row. The tallest set the row, the
// others floated inside it, and the grid stopped reading as a grid. Measured on
// the pre-fix build — a 1:1 image at 138 tall beside a 16:9 at 78.
//
// The layouts:
//   1  the image, whole
//   2  two squares side by side          container 2:1
//   3  one large square, two stacked     container 1:1
//   4  2x2                               container 1:1
//   5+ 2x2 with a "+N" on the last tile
const H = require('./harness.js');
const sharp = require('C:/Users/KHAC DUY/Desktop/Orbit Beta/desktop/node_modules/sharp');

const make = async (w, h, rgb) => {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: rgb } })
    .png().toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
};

(async () => {
  const sq = await make(240, 240, { r: 70, g: 130, b: 200 });
  const wide = await make(360, 200, { r: 210, g: 120, b: 70 });
  const tall = await make(200, 360, { r: 90, g: 180, b: 130 });
  const img = (n, url) => ({ id: n, type: 'image', name: n + '.png', url: url, mimeType: 'image/png' });

  const SEED = {
    orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
    orbit_friends: [{ id: 'p_echo', name: 'Orbit Echo', tag: '0001', status: 'online' }],
    orbit_chats: [{ id: 'p_echo', name: 'Orbit Echo', lastMessage: '', lastTime: H.t(2) }],
    orbit_msg_p_echo: [
      { id: 'one', from: 'p_echo', text: '', time: H.t(90), attachments: [img('a', wide)] },
      { id: 'two', from: 'p_echo', text: '', time: H.t(80), attachments: [img('b', sq), img('c', wide)] },
      { id: 'three', from: 'p_echo', text: '', time: H.t(70), attachments: [img('d', sq), img('e', wide), img('f', tall)] },
      { id: 'four', from: 'p_echo', text: '', time: H.t(60), attachments: [img('g', sq), img('h', wide), img('i', tall), img('j', sq)] },
      { id: 'seven', from: 'p_echo', text: '', time: H.t(50), attachments: [img('k', sq), img('l', wide), img('m', tall), img('n', sq), img('o', wide), img('p', tall), img('q', sq)] }
    ]
  };

  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);
  await page.evaluate(() => window.openChat('p_echo'));
  await page.waitForTimeout(3000);

  const read = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.message-row').forEach((row) => {
      const grid = row.querySelector('.att-grid');
      if (!grid) return;
      const cs = getComputedStyle(grid);
      const gr = grid.getBoundingClientRect();
      const cells = Array.from(grid.querySelectorAll('.att-grid-cell'));
      const rect = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) }; };
      out[row.getAttribute('data-msg-id')] = {
        count: grid.getAttribute('data-count'),
        total: grid.getAttribute('data-total'),
        gridRatio: Number((gr.width / gr.height).toFixed(2)),
        gap: cs.gap,
        cells: cells.length,
        cellRects: cells.map(rect),
        more: cells[3] ? cells[3].getAttribute('data-more') : null,
        moreClass: cells[3] ? cells[3].classList.contains('att-grid-more') : null,
        innerRadius: cells.length > 1 ? getComputedStyle(cells[1]).borderTopLeftRadius : null
      };
    });
    return out;
  });
  console.log(JSON.stringify(read, null, 1));

  console.log('\n== one image keeps its own shape ==');
  const one = read.one;
  H.check('it is not squared', one && one.cellRects[0].w !== one.cellRects[0].h, one && one.cellRects[0]);

  console.log('\n== two: a pair of squares ==');
  const two = read.two;
  H.check('the container is twice as wide as tall', two && Math.abs(two.gridRatio - 2) < 0.06, two && two.gridRatio);
  H.check('both cells are square', two && two.cellRects.every((c) => Math.abs(c.w - c.h) <= 1), two && two.cellRects);

  console.log('\n== three: one large square, two stacked ==');
  const three = read.three;
  // 3:2, not square — the large tile is two thirds of both dimensions, which is
  // what makes it and the two small ones all square.
  H.check('the container is 3:2', three && Math.abs(three.gridRatio - 1.5) < 0.06, three && three.gridRatio);
  H.check('the first cell is about twice the height of the others',
    three && Math.abs(three.cellRects[0].h - three.cellRects[1].h * 2) <= 3, three && three.cellRects.map((c) => c.h));
  H.check('the first cell is square', three && Math.abs(three.cellRects[0].w - three.cellRects[0].h) <= 1, three && three.cellRects[0]);
  H.check('the other two sit beside it, not below',
    three && three.cellRects[1].left > three.cellRects[0].left, three && three.cellRects.map((c) => c.left));

  console.log('\n== four: 2x2 ==');
  const four = read.four;
  H.check('the container is square', four && Math.abs(four.gridRatio - 1) < 0.06, four && four.gridRatio);
  H.check('four cells in two rows',
    four && four.cells === 4 &&
    Math.abs(four.cellRects[0].top - four.cellRects[1].top) <= 1 &&
    four.cellRects[2].top > four.cellRects[0].top, four && four.cellRects);

  console.log('\n== past four: a "+N" on the last tile ==');
  const seven = read.seven;
  H.check('only four cells are drawn', seven && seven.cells === 4, seven && seven.cells);
  H.check('the real total is carried', seven && seven.total === '7', seven && seven.total);
  H.check('the fourth tile shows +3', seven && seven.more === '+3', seven && seven.more);

  console.log('\n== the group reads as one object ==');
  H.check('the tiles touch — a hairline gap', two && two.gap === '2px', two && two.gap);
  H.check('inner corners are square, so only the outside is rounded',
    two && two.innerRadius === '0px', two && two.innerRadius);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
