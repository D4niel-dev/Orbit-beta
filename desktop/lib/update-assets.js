// desktop/lib/update-assets.js
//
// The two pure decisions the desktop's updater makes about untrusted input: which hosts
// it will download from, and what filename it will write.
//
// Extracted from main.js so they can be tested. They were closures inside the ipcMain
// handler, which made them unreachable from a test — and after the mobile updater turned
// out to have three defects that no test had ever touched, "unreachable from a test" is
// the property worth removing. Same logic, same call sites, now covered.
'use strict';

const path = require('path');

// GitHub serves release assets, then redirects the download to
// objects.githubusercontent.com. The host check runs on the URL as given (fetch follows
// redirects), so both have to be allowed or every real download fails at the redirect.
function isAllowedUpdateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'github.com' || h.endsWith('.github.com') || h.endsWith('.githubusercontent.com');
}

// The asset name comes from the release, so it is untrusted: basename it (no traversal),
// strip anything that is not filename-safe, and cap the length.
function safeAssetName(name) {
  const base = path.basename(String(name || 'Orbit-installer'));
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120);
  return cleaned || 'Orbit-installer';
}

module.exports = { isAllowedUpdateHost, safeAssetName };
