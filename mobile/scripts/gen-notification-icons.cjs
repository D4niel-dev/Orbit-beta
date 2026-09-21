#!/usr/bin/env node
/**
 * Generates the Android notification small-icon drawables from the Lucide icon
 * set that the app already vendors (mobile/src/lib/lucide.min.js).
 *
 * Why generate rather than hand-write: notification icons need to be monochrome
 * alpha shapes, and hand-authored path data is easy to get subtly wrong. Deriving
 * them from Lucide keeps the notifications visually consistent with every other
 * icon in the app, and Lucide is ISC-licensed (already bundled).
 *
 *   node mobile/scripts/gen-notification-icons.cjs
 *
 * Output: mobile/android/app/src/main/res/drawable/ic_notify_*.xml
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE = path.join(ROOT, 'mobile', 'src', 'lib', 'lucide.min.js');
const OUT_DIR = path.join(ROOT, 'mobile', 'android', 'app', 'src', 'main', 'res', 'drawable');

// drawable name -> Lucide icon name
const ICONS = {
  ic_notify_message: 'MessageCircle',   // incoming message
  ic_notify_mention: 'AtSign',          // @mention
  ic_notify_call: 'Phone',              // incoming voice call
  ic_notify_video_call: 'Video',        // incoming video call
  ic_notify_update: 'DownloadCloud',    // app update available
  ic_notify_sync: 'RefreshCw',          // background processing
  ic_notify_alert: 'TriangleAlert',     // failure / error
  ic_notify_check: 'CircleCheck',       // success / finished
  ic_notify_service: 'Wifi'             // persistent "Connected" service notice
};

// ── load the bundle ──
const src = fs.readFileSync(BUNDLE, 'utf8');
const mod = { exports: {} };
new Function('exports', 'module', 'require', src)(mod.exports, mod, require);
const lib = mod.exports.icons || mod.exports;

// ── node -> pathData ──
// Lucide nodes are [tag, attrs] pairs. VectorDrawable has no <circle>/<rect>/
// <line> primitives, so everything is converted to path data.
function toPathData(tag, a) {
  const n = (v) => Number(v);
  switch (tag) {
    case 'path':
      return a.d;
    case 'circle': {
      const cx = n(a.cx), cy = n(a.cy), r = n(a.r);
      // two half-arcs make a full circle
      return `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
    }
    case 'rect': {
      const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height), r = n(a.rx || 0);
      if (!r) return `M${x},${y} h${w} v${h} h${-w} Z`;
      return `M${x + r},${y} h${w - r * 2} a${r},${r} 0 0 1 ${r},${r} v${h - r * 2} ` +
             `a${r},${r} 0 0 1 ${-r},${r} h${-(w - r * 2)} a${r},${r} 0 0 1 ${-r},${-r} ` +
             `v${-(h - r * 2)} a${r},${r} 0 0 1 ${r},${-r} Z`;
    }
    case 'line':
      return `M${n(a.x1)},${n(a.y1)} L${n(a.x2)},${n(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const pts = String(a.points).trim().split(/\s+/).map((p) => p.replace(',', ' '));
      let d = 'M' + pts[0].replace(' ', ',');
      for (let i = 1; i < pts.length; i++) d += ' L' + pts[i].replace(' ', ',');
      return tag === 'polygon' ? d + ' Z' : d;
    }
    default:
      return null;
  }
}

function xml(name, iconName, nodes) {
  const paths = nodes
    .map(([tag, a]) => {
      const d = toPathData(tag, a);
      if (!d) { console.warn(`  ! ${name}: unsupported element <${tag}> skipped`); return null; }
      // Stroke attributes belong on <path>. Putting fillColor/strokeColor on a
      // <group> is invalid (groups only take transforms), and an invalid
      // VectorDrawable fails to inflate — which is what made the status-bar icon
      // vanish. Do NOT "fix" this by filling the paths instead: Lucide is authored
      // for stroking, and filling collapses the tick inside CircleCheck, the bang
      // inside TriangleAlert and the inner ring of AtSign into solid blobs.
      return `    <path\n        android:fillColor="#00000000"\n        android:strokeColor="#FFFFFFFF"\n        android:strokeWidth="2"\n        android:strokeLineCap="round"\n        android:strokeLineJoin="round"\n        android:pathData="${d}" />`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Notification small icon, generated from Lucide's "${iconName}".
  Lucide is ISC-licensed (see mobile/src/lib/lucide.min.js).
  Regenerate with: node mobile/scripts/gen-notification-icons.cjs
  Do not hand-edit; edit the icon map in that script instead.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${paths}
</vector>
`;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let ok = 0, missing = [];
for (const [drawable, iconName] of Object.entries(ICONS)) {
  const nodes = lib[iconName];
  if (!nodes) { missing.push(iconName); continue; }
  fs.writeFileSync(path.join(OUT_DIR, drawable + '.xml'), xml(drawable, iconName, nodes), 'utf8');
  console.log('wrote ' + drawable + '.xml  <- ' + iconName + ' (' + nodes.length + ' node(s))');
  ok++;
}
if (missing.length) {
  console.error('MISSING icons: ' + missing.join(', '));
  process.exit(1);
}
console.log('\n' + ok + ' notification icons generated.');
