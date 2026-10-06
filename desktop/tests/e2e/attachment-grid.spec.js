// The desktop's attachment grid.
//
// A regression guard for a specificity tie that the mobile suite could not see.
// The grid's own rules were written UNPREFIXED — `.att-grid:not([data-count="1"])
// > .att-thumb img` — and lost to an earlier, more specific
// `.message-row .msg-attachments .att-thumb:has(img) img`. Both were !important,
// so the more specific one won, and its `height: auto` + `object-fit: contain`
// made every image in a grid render at its natural height inside a square cell:
// a 360x200 at width 139 came out 139x77, so half the tile was empty.
//
// The assertions therefore measure the IMAGE, not the cell. A grid row stretches
// its cells to a common size whatever the CSS says, so a cell-only assertion
// passes either way.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

const TMP = 'C:/Users/KHAC DUY/AppData/Local/Temp';

async function makeAssets() {
  const dir = path.join(TMP, 'grid-spec-assets');
  fs.mkdirSync(dir, { recursive: true });
  const specs = [
    ['sq.png', 240, 240, { r: 70, g: 130, b: 200 }],
    ['wide.png', 360, 200, { r: 210, g: 120, b: 70 }],
    ['tall.png', 200, 360, { r: 90, g: 180, b: 130 }],
    ['sq2.png', 240, 240, { r: 160, g: 100, b: 200 }]
  ];
  const out = [];
  for (const [name, w, h, bg] of specs) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) await sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toFile(p);
    out.push(p);
  }
  return out;
}

test('images in a grid fill their cell, whatever their own proportions are', async () => {
  const files = await makeAssets();
  const { app, page } = await launchApp(tmpUserDataDir('grid-spec'));
  try {
    await page.evaluate(() => { const r = document.querySelectorAll('[data-chat-id]'); if (r.length) r[0].click(); });
    await page.waitForTimeout(1200);

    const send = async (label, batch) => {
      await page.fill('#chat-input', label);
      await page.setInputFiles('#file-input', batch);
      await page.waitForTimeout(900);
      await page.click('#btn-send');
      await page.waitForTimeout(400);
      const proceed = page.locator('.btn-av-warning-proceed');
      if (await proceed.isVisible().catch(() => false)) await proceed.click();
      await page.waitForTimeout(1600);
    };
    await send('Two', [files[0], files[1]]);
    await send('Three', [files[0], files[1], files[2]]);
    await send('Four', files);
    await page.waitForTimeout(800);

    const grids = await page.evaluate(() => {
      const r = (el) => { const q = el.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height) }; };
      return Array.from(document.querySelectorAll('.att-grid')).map((g) => ({
        count: g.getAttribute('data-count'),
        grid: r(g),
        cells: Array.from(g.querySelectorAll('.att-thumb')).map((c) => {
          const i = c.querySelector('img');
          return { cell: r(c), img: i ? r(i) : null, fit: i ? getComputedStyle(i).objectFit : null };
        })
      }));
    });

    expect(grids.length).toBe(3);
    const byCount = {};
    for (const g of grids) byCount[g.count] = g;

    // The container shapes.
    expect(Math.abs(byCount['2'].grid.w / byCount['2'].grid.h - 2)).toBeLessThan(0.1);
    expect(Math.abs(byCount['3'].grid.w / byCount['3'].grid.h - 1.5)).toBeLessThan(0.1);
    expect(Math.abs(byCount['4'].grid.w / byCount['4'].grid.h - 1)).toBeLessThan(0.1);

    // THE POINT: every image fills its cell, so no tile is half empty. A wide
    // image used to render 139x77 inside a 139x139 cell.
    for (const g of grids) {
      for (const c of g.cells) {
        expect(c.img, 'every grid cell holds an image').not.toBeNull();
        expect(c.fit, 'images are cropped to fill, not letterboxed').toBe('cover');
        expect(Math.abs(c.img.w - c.cell.w), 'image width matches its cell').toBeLessThanOrEqual(1);
        expect(Math.abs(c.img.h - c.cell.h), 'image height matches its cell').toBeLessThanOrEqual(1);
      }
    }

    // Every tile in the 2x2 is the same size, and so are the pair.
    const four = byCount['4'].cells.map((c) => c.cell);
    for (const c of four) {
      expect(Math.abs(c.w - four[0].w)).toBeLessThanOrEqual(1);
      expect(Math.abs(c.h - four[0].h)).toBeLessThanOrEqual(1);
    }
  } finally {
    await app.close().catch(() => {});
  }
});
