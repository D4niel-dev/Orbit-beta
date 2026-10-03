// "What's New" must not fall behind the app version.
//
// This is a plain Node check — no browser, no server. It exists because the
// hand-maintained What's New lists DID fall behind: the mobile's stopped at
// 0.7.5-beta while the app was on 0.8.1-beta, so anyone who updated opened
// What's New and saw nothing newer than 0.7.5. Nothing failed; there was simply
// no check that the newest entry is the version being shipped.
//
// There are TWO hand-maintained lists, in two files, on two platforms:
//
//   mobile/src/js/app.js               showChangelog()  -> vBlock('…', 'Latest', …)
//   desktop/src/js/components/changelog.js              -> versionBlock('…', 'Latest', …)
//
// Different function names, so a grep for one finds nothing in the other. Both
// are checked here, because updating one and forgetting the other is exactly the
// shape of the bug.
//
// A release is not done until the newest block matches the version in the
// manifests. That is what this asserts.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else {
    results.fail.push(label);
    console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  }
}

function versionFromPkg(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8')).version;
}

/** The version of the FIRST block tagged 'Latest' — i.e. what the user sees on top. */
function newestBlock(file, fnName) {
  const src = fs.readFileSync(file, 'utf8');
  const re = new RegExp(fnName + "\\(\\s*'([0-9][^']*)'\\s*,\\s*'Latest'");
  const m = src.match(re);
  if (m) return m[1];
  // No 'Latest' tag at all is its own bug — the tag is what the UI shows.
  const any = src.match(new RegExp(fnName + "\\(\\s*'([0-9][^']*)'"));
  return any ? { noLatestTag: any[1] } : null;
}

console.log('\n== the mobile What\'s New (app.js) ==');
const appVer = versionFromPkg(path.join(REPO, 'mobile/package.json'));
const appBlock = newestBlock(path.join(REPO, 'mobile/src/js/app.js'), 'vBlock');
console.log('  app version: ' + appVer + '   newest block: ' + JSON.stringify(appBlock));
check('the newest block carries the Latest tag', appBlock && typeof appBlock === 'string',
  appBlock && appBlock.noLatestTag ? 'no Latest tag — top entry is ' + appBlock.noLatestTag : appBlock);
check('the newest block IS the version in mobile/package.json', appBlock === appVer,
  { block: appBlock, package: appVer });

console.log('\n== the desktop What\'s New (changelog.js) ==');
const deskVer = versionFromPkg(path.join(REPO, 'desktop/package.json'));
const deskBlock = newestBlock(path.join(REPO, 'desktop/src/js/components/changelog.js'), 'versionBlock');
console.log('  app version: ' + deskVer + '   newest block: ' + JSON.stringify(deskBlock));
check('the newest block carries the Latest tag', deskBlock && typeof deskBlock === 'string',
  deskBlock && deskBlock.noLatestTag ? 'no Latest tag — top entry is ' + deskBlock.noLatestTag : deskBlock);
check('the newest block IS the version in desktop/package.json', deskBlock === deskVer,
  { block: deskBlock, package: deskVer });

console.log('\n== the two platforms agree ==');
check('both platforms show the same newest version', appBlock === deskBlock,
  { mobile: appBlock, desktop: deskBlock });

// A version that appears twice would mean an entry was renamed rather than added,
// which is how a released version once vanished from the README history.
console.log('\n== no version appears twice ==');
for (const [label, file, fn] of [
  ['mobile', 'mobile/src/js/app.js', 'vBlock'],
  ['desktop', 'desktop/src/js/components/changelog.js', 'versionBlock']
]) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  const all = [...src.matchAll(new RegExp(fn + "\\(\\s*'([0-9][^']*)'", 'g'))].map(m => m[1]);
  const dupes = all.filter((v, i) => all.indexOf(v) !== i);
  check(label + ': every version appears once', dupes.length === 0, dupes);
}

console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
if (results.fail.length) {
  results.fail.forEach(f => console.log('  ! ' + f));
  process.exitCode = 1;
}
