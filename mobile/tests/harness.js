// Shared harness for the mobile UI probes.
//
// WHY THIS EXISTS
// The mobile app has no test suite. `node --check` catches syntax and nothing
// else, and the regressions that actually shipped — a clipped settings row,
// SETTINGS_SYNC dead for two releases, `save()` not persisting messages, a
// search that could only ever find messages in the open chat — were all found by
// driving the real UI in a browser. Those checks used to be throwaway scripts
// that got deleted. They live here now.
//
// The mobile web UI is plain scripts with no bundler, so it runs in any browser.
// This serves mobile/src and drives it with Playwright against the INSTALLED
// Edge (`channel: 'msedge'`), so there is no Playwright browser download.
//
//   node mobile/tests/<name>.test.js
//
// Two traps baked in here:
//   * `path.resolve` on BOTH sides of the containment check. Resolving only the
//     joined path leaves the root with forward slashes, and on Windows every
//     request 404s.
//   * The seed goes in through addInitScript, so it is in localStorage before
//     any app script runs. Writing it after load is too late — the store has
//     already booted with an empty account.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');
const SHOTS = process.env.ORBIT_SHOTS || path.resolve(__dirname, '.shots');

// playwright-core lives in the desktop package. Resolve it explicitly rather
// than relying on node_modules hoisting.
const PW_PATHS = [
  path.resolve(__dirname, '..', '..', 'desktop', 'node_modules', 'playwright-core'),
  'playwright-core'
];
let chromium;
for (const p of PW_PATHS) {
  try { chromium = require(p).chromium; break; } catch (e) { /* try the next */ }
}
if (!chromium) {
  console.error('Could not load playwright-core. Run `npm install` in desktop/ first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.json': 'application/json',
  '.ico': 'image/x-icon'
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.resolve(path.join(ROOT, p));
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); res.end(''); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/** Launch the app with `seed` written to localStorage before any script runs. */
async function boot(server, seed) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  await page.addInitScript((s) => {
    for (const k of Object.keys(s)) localStorage.setItem(k, JSON.stringify(s[k]));
    localStorage.setItem('orbit_migrated_v2', 'true');
  }, seed || {});
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html',
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3800);
  return { browser, page, errors };
}

const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else {
    results.fail.push(label);
    console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  }
}
function report() {
  console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
  if (results.fail.length) {
    results.fail.forEach(f => console.log('  ! ' + f));
    process.exitCode = 1;
  }
}

/** ISO timestamp `mins` minutes ago — for seeding messages. */
const t = (mins) => new Date(Date.now() - mins * 60000).toISOString();

module.exports = { serve, boot, check, report, results, t, SHOTS, ROOT };
