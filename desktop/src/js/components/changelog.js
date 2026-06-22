window.Changelog = {
  show() {
    if (this._overlay) return;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) window.Changelog.close(); });

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-surface);border-radius:16px;padding:24px;max-width:540px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);border:1px solid var(--border-subtle);';

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
        '<h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text-primary);">What\'s New</h2>' +
        '<button id="changelog-close" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:20px;height:20px;"></i></button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:20px;">' +
        versionBlock('0.1.4-beta', 'Latest', [
          ['New Features', [
            'Desktop P2P Bugfix Audit (17 fixes): Socket 8s timeout disabled after connect, write-queue key precedence fix, reconnect .catch() + counter reset on data, preload reconnect args, PIN/UNPIN groupId routing, GROUP_MEMBER_ADDED field update, GROUP_CREATE publicKey enrichment, GROUP_JOIN_REQUEST usertag/avatar/status',
            'P2P Auto-Connection Stabilization: PING/PONG keep-alive (15s heartbeat, 30s idle → close), 8s connection timeout, reconnect with exponential backoff (5 attempts max, 30s cap), stale peer pruning (180s), network change detection (10s IP polling → full restart), auto-connect duplicate protection',
            'Translation Engine Rewrite: In-memory cache, request dedup, AbortController for in-flight requests, inline Retry link on failure',
            'Voice Messages Stabilization: audio/webm content-type fix, onerror auto-retry, chunked transfer audio detection with MIME mapping',
            'Image Viewer: Quick-save button (showSaveFilePicker + Blob fallback), keyboard nav (← → Escape), swipe (mouse drag + touch), download fix (fetch+blob for custom protocol URLs), loading placeholder CSS',
            'Performance Mode: Two-step confirmation, .performance-mode CSS class on &lt;html&gt;, runtime guards in chat-panel and app.js',
            'Mobile Protocol.js Synced: 15+ missing types (MESSAGE_EDIT, CALL_*, FILE_TRANSFER_*, PIN, SYSTEM, PING/PONG, etc.) — full 46-type parity with desktop',
            'Desktop Settings Ported to Mobile: 11 new defaults (notifyVolume, notifySoundType, translateTargetLang, netReconnectInterval, netKeepAlive, logLevel, etc.)',
            'Mobile Settings Wired: logLevel filters debugLog(), tcpPort/udpPort in beacon/P2P, netReconnectInterval in auto-reconnect, netKeepAlive in heartbeat, netBandwidthLimit throttles FILE_CHUNK, networkMode shows/hides UDP field',
            'Mobile Notifications: Sound toggle, volume slider (0-100), sound type select (Chime/Pop/Gentle/Classic)',
            'Mobile Translation: Target language select (30 languages), auto-detect toggle, moved to Chat section',
            'Mobile Network Settings: Reconnect interval, keep-alive select, WebRTC fallback, log level, bandwidth limit',
            'Mobile DB Migration Fixed: Runs before MStore.load() — old unprefixed localStorage keys now picked up correctly',
            'Mobile What\'s New: Full changelog modal in About tab (v0.0.2 through v0.1.4)'
          ]],
          ['Bug Fixes', [
            'Desktop blank window fixed — missing closing paren in app.js:777 ternary chain crashed entire renderer',
            'Mobile GROUP_CREATE/GROUP_JOIN_RESPONSE exempted from chat-existence check (they create the chat)',
            'Mobile group handlers check origin.username || origin.name for name/username mismatch',
            'Mobile toast concatenation operator precedence fixed',
            'Mobile auto-reconnect now reads netReconnectInterval from settings (was hardcoded 5s)',
            'Mobile PING/PONG heartbeat uses netKeepAlive from settings (was not implemented)',
            'Mobile TCP timeout + UDP port now passed from settings to native Java plugin',
            'profileFrame value 0 stored correctly (TCP beacon was converting 0→null via ||)',
            'Desktop group sync fixes: GROUP_OWNER_TRANSFER role, GROUP_LEAVE cleanup, GROUP_INVITE init, PIN/UNPIN routing',
            'Desktop write-queue key collision fixed (key + "" → "" + key operator precedence)',
            'Desktop reconnect .catch() added, counter resets on data, duplicate connection protection'
          ]]
        ]) +
        versionBlock('0.1.3-beta', '', [
          ['New Features', [
            'Native Android System Notifications: Messages now show as real system notifications when app is backgrounded (requires POST_NOTIFICATIONS permission)',
            'Desktop Notification Avatars: Sender/group avatar now shown as notification icon (previously static Orbit icon)',
            'Connection Stats Panel: Live P2P status — online peers, uptime, sent/received message counters (refreshes every 2s)',
            'Video File Support: Upload, render, and view video files in chat — &lt;video&gt; elements with play overlay in message bubbles',
            'Video Preview Modal: Full-screen video player on desktop and mobile (matching image preview UX)',
            'Video Compression: Large videos (>5MB) auto-compressed to 720p/500kbps via MediaRecorder + captureStream before sending',
            'P2P Discovery Optimized: Beacon interval reduced 5s→10s, stale threshold 120s→180s, exponential chunk retry backoff',
            'Group Info UI: Hardcoded colors replaced with theme CSS variables for consistent dark/light mode appearance',
            'Performance Mode: New toggle in Experimental settings with two-step confirmation — disables animations, link previews, GIF playback, and background CPU tasks',
            'Compact Spacing & Swipe-to-Reply settings moved from Experimental to chat settings (always available)',
            'Animated avatars, profile frames, message FX improved CSS implementations for mobile'
          ]],
          ['Bug Fixes & Optimizations', [
            'Image Viewer Fix: Clicking image thumbnails now opens viewer after restart — hit-test fallback when DOM is recreated mid-click, and removed \'friends\' from chat-panel store subscription to stop full re-renders on friend status beacons',
            'JS-Level CPU Optimization: Freeze GIF playback, skip link preview OG fetch, slow offline check to 60s, stop connection stats polling (desktop), stop dev overlay rAF polling (mobile)',
            'Forced Reflow Cascade Eliminated: ResizeObserver disconnected before innerHTML in renderChat, reconnected after all DOM changes; throttled to 1s to prevent cascade from async image loads',
            'data-refreshing Animation Guard: Attribute set on container before innerHTML, removed after requestAnimationFrame — CSS suppresses message entrance animation on re-render',
            'Leaked Offline Check Interval Fixed: Removed duplicate startup setInterval — applySettings() is now single source for offline check interval',
            'Mobile HTML Nesting Fixed: Missing div closing tag concatenation caused broken structure in Performance Mode toggle row',
            'image-viewer.js Null-Safety: openFromMessage now checks store null, falls through to fallback URL when gallery is empty; close() and openVideo() wrapped in try/catch for missing DOM elements; init() uses readyState guard'
          ]]
        ]) +
        versionBlock('0.1.2-beta', '', [
          ['Bug Fixes', [
            'Manual Connect Bug Fixed: "Add a Friend" IP connect no longer creates duplicate TCP connections — socket remapping now works when peerId is "manual"',
            'Hardcoded type strings eliminated: store.js (16) and mobile/app.js (5) now use Protocol.Types constants — no more silent failures on unknown type strings'
          ]],
          ['Technical', [
            'Protocol Type Unification: All 47 types unified across shared/ and desktop/ protocol.js — cross-platform call/file-transfer/group compatibility guaranteed',
            'Build Pipeline Overhaul: Android assembleRelease, SHA256 checksums, artifact verification, build metadata (version/commit/date), asset size table in release notes'
          ]]
        ]) +
        versionBlock('0.1.1-beta', 'Latest Stable', [
          ['New Features', [
            'Voice & Video Calls (P2P): Full WebRTC call system with incoming notification, mute/speaker controls, timer, ICE exchange',
            'Group Calls (Mesh): Each participant gets their own RTCPeerConnection; video grid or avatar circles for audio-only',
            'Camera Toggle: On/off during calls with deterministic HSL avatar placeholder when camera is off',
            'Message Forwarding: Forward messages with attachments to any chat via chat picker modal (desktop + mobile)',
            'Block User: Block/unblock from context menu and profile sidebar; P2P filter drops blocked packets',
            'Search Within a Chat: Scoped search with chatId filter, sender filter, date inputs, context-aware placeholders',
            'Export Chat History: JSON or TXT export with timestamped downloads via Data Manager',
            'Save/Load Themes: Export current theme as JSON; import via file picker in Appearance tab',
            'Message Translate Unlocked: Always-on translate button (no experimental gate), default enabled in Appearance tab'
          ]],
          ['Bug Fixes', [
            'Mobile Reply fromName Fix: fromName now set on ALL outgoing MESSAGE packets — cross-platform reply consistency',
            'Lucide Icon Null Fix: All querySelector(\'i\') changed to querySelector(\'svg\') — createIcons replaces i tags with svg',
            'Camera Placeholder Refactored: Pre-rendered in HTML — no dynamic DOM creation; just toggles display:none',
            'Call Modal UI: Proper centering, audio wave bars, hover button effects, local video as full grid tile in groups'
          ]],
          ['Polish', [
            'Online Status: lastSeen on BEACON, 30s interval checks for stale connections (120s timeout)',
            'Inline code/pre CSS styling for both platforms'
          ]]
        ]) +
        versionBlock('0.1.0-beta', '', [
          ['Performance', [
            'Performance: Up to 5× faster startup and rendering — selective store subscriptions, setStateBatch microtask coalescing, insertAdjacentHTML, event delegation for all message actions',
            'Startup: ~40% faster (5s → 3s) — deferred init phases (setTimeout(0) + requestIdleCallback), batched store IPC (7+ calls → 1), lazy message loading (last 50 per chat, load on demand)',
            'freezeGifImages: Canvas cache via _frozenCache Map; expanded selectors (orbit-db://, .avatar img); global call on Reduce Motion toggle; mobile feed re-render on toggle'
          ]],
          ['Bug Fixes', [
            'Bug fix: orbit-db://attachment/ 404 — base64 data URL extraction in addMessage for both privacy and non-privacy modes',
            'Bug fix: Selective subscriber undefined changedState — store.notify() without args no longer throws',
            'Bug fix: Message avatar click moved from re-attached attachEvents to initDelegatedActions (registered once)',
            'Bug fix: loadFullChatMessages was dropping existing messages (only stored the diff, not full result)'
          ]],
          ['New', [
            'Data Manager "Load All Stored Data" — double-confirmation button loads all messages from DB into memory on demand'
          ]]
        ]) +
        versionBlock('0.0.9.3-beta', '', [
          ['New Features', [
            'Group Info Panel overhaul — Add Member (friend picker), Leave Group, Transfer Ownership, member search, created date, online/total count',
            'DM context menus — right-click on desktop, long-press on mobile: Pin/Unpin, Mute, View Profile, Copy ID, Close DM (removes friend from DB)',
            'Pinned DMs — pinned state sorted first in sidebar with pin icon',
            'Close DM removes friend — calls dbDeleteFriend; persists closedDMs; auto-reopens on new message',
            'P2P Diagnostics panel — logs, errors, peer info, connection stats via button in connection stats overlay',
            'Debug log buffer — window._debugLogBuffer captures last 500 console entries',
            'Global Gallery type filters — All/Images/Files, non-images render with file icons, gallery view mode persisted to DB',
            'Create Group modal — shows friend avatars with profile frames'
          ]],
          ['Bug Fixes', [
            'Gallery sidebar Files tab fix — Format.bytes→fileSize, download button replaces window.open for custom protocol URLs',
            'Context menu fix — data-action attribute never set; rewritten to use DOM methods with captured onClick',
            'P2P protocol audit — isPeerConnected key mismatch, protocol type string fixes, TCP merge IP strip port'
          ]],
          ['Technical', [
            'GROUP_MEMBER_ADDED and GROUP_OWNER_TRANSFER protocol types — cross-platform support'
          ]]
        ]) +
        versionBlock('0.0.9.2-beta', '', [
          ['New Features', [
            'Mobile initP2P Logging — detailed debug logs throughout P2P initialization and lifecycle',
            'Dev Mode DevTools — toggling Developer Mode loads eruda on-device inspector panel',
            'Debug Log Buffer — scrollable log overlay when dev mode is active'
          ]],
          ['Bug Fixes', [
            'Bug #1: Desktop sends messages to mobile (socket.remoteAddress as BEACON IP fallback)',
            'Bug #2: Mobile peer merging (host:port→UUID dedup)'
          ]],
          ['Technical', [
            'Cross-platform v0.0.9.1-beta version sync',
            'Cross-platform v0.0.9.2-beta version sync'
          ]]
        ]) +
        versionBlock('0.0.9-beta', '', [
          ['Bug Fixes', [
            'Android P2P Stability — 8 Java plugin fixes (multicast lock, beacon gating, TCP buffer, connection tracking) + 4 JS bridge fixes',
            'Desktop P2P Stability — 9 fixes (write queue, oversized frames, socket errors, self-beacon filter, transfer backpressure, restart)',
            'Desktop Socket Write Queue — per-connection queue prevents TCP byte interleaving on length-prefixed frames',
            'Android Add Friend — no more P2P Preview gate; cleartext traffic flag; plugin retry mechanism',
            'Mobile DB Fix — migration runs after user load to prevent identity corruption on restart',
            'Desktop Bug Fixes — require(crypto) → window.crypto in sidebar-middle; PIN_MESSAGE groupId in payload'
          ]],
          ['New Features', [
            'Mobile Group Info Panel — full panel: edit name/description, avatar change, invite code + share, pin/mute, members with roles + join dates, promote/demote/remove, leave/delete',
            'Pinned Messages — pin/unpin in action bar; pinned section in group info; cross-platform sync via shared protocol',
            'Message Search — search bar filters messages in real-time on mobile chat header',
            'Member Join Dates — shows "Joined Jan 15, 2026" in group member list',
            'Enhanced Message FX — particle confetti system (both platforms); safe CSS (no color-mix, no overflow:hidden)',
            'Mobile Settings — Font Size (S/M/L), Message Animation (Slide/Fade), Auto-Reconnect toggle, Connection Timeout (5/10/30/60s)',
            'Avatar in P2P Beacons — cross-platform avatar sharing in discovery packets'
          ]],
          ['Technical', [
            'Cross-Platform Group Sync — GROUP_CREATE/GROUP_LEAVE broadcast compatible between mobile and desktop'
          ]]
        ]) +
        versionBlock('0.0.8-beta', '', [
          ['New Features', [
            'Rich Link Previews v2 — Open Graph metadata (title, description, image) fetched via Electron IPC',
            'Message Link Styling — URLs in chat text now clickable with hover/active color states (both desktop + mobile)',
            'Cross-Platform P2P — Desktop ↔ Android LAN discovery and messaging via TCP/UDP',
            'Mobile Settings Wired — All toggles now have real behavior (time format, avatars, images, notifications, etc.)',
            'Mobile Toast Overhaul — Type-based accent bar, icons, slide-in animation, progress bar',
            'Mobile Notification Sound — Web Audio beep on incoming P2P messages',
            'Desktop Settings Tabs — Notifications (volume/sound/test), Network (collapsibles), About (version info)',
            'Chat Background Patterns — Diagonal Stripes, Crosshatch, Circles'
          ]],
          ['Bug Fixes', [
            'QR Code Fixes — Both desktop and mobile QR generation fixed; mobile QR moved to Add Friend modal',
            'Desktop Bug Fixes — MIME mapping, cache headers, media retry, attachment URL stability'
          ]]
        ]) +
        versionBlock('0.0.7-beta', '', [
          ['New Features', [
            'First-Time User Tutorial (Welcome Tour) — skippable and replayable via Settings',
            'Link Previews — Rich URL cards rendered directly in chat messages',
            'Activity Center Overhaul — Modern notification timeline with Tabs (All, Mentions, Files, System Logs)',
            'Shared Media Gallery — Revamped right-side panel with Images, Files, and Links grouped chronologically',
            'Privacy Mode Overhaul — Attachments and thumbnails are properly handled and cleaned up'
          ]],
          ['Technical', [
            'Android Port Architecture — Core cross-platform abstractions built for upcoming mobile release'
          ]],
          ['Bug Fixes', [
            'Numerous UI polish and stability bug fixes (Attachment 404s, CSP blocks, Layout quirks, etc.)'
          ]]
        ]) +
        versionBlock('0.0.6-beta', '', [
          ['Bug Fixes', [
            'XSS fixes — all onclick handlers use data-attributes + addEventListener',
            'CSS injection fix — profile banner set via style property, not string concat',
            'Network packet null-safety — all packet.payload handlers guarded against malformed packets',
            'Store immutability — addMessage, editMessage use immutable patterns',
            'Fixed duplicate addMemberToGroup definition (lost joinedAt preservation)',
            'Data cleanup on removeGroup — messages, pins, counts, mute state cleaned up',
            'Added removeFriend() with full data cleanup',
            'Fixed unhandled promise rejection in avatar upload',
            'Button loading/disabled states on backup, restore, connect operations',
            'Fixed require(crypto) in renderer — replaced with crypto.getRandomValues',
            'Unguarded networkSend calls — all guarded with if (window.orbitAPI)',
            'Consistent clipboard — IPC clipboard with navigator.clipboard fallback'
          ]],
          ['New Features', [
            'Keyboard accessibility for settings collapsible sections',
            'Null guards on settings/profile DOM element lookups',
            'Dev Mode master gate — controls all Advanced settings (debug + experimental)',
            'True Dark theme — neutral grays + blue accent; old dark renamed to Dark Purple',
            'Custom theme dropdown — pre-made themes: Midnight, Sunset, Nord, Seasonal',
            'Seasonal theme — auto-rotates by meteorological season (4 CSS files)',
            'Custom Colors modal — live preview editor for all UI color categories',
            'Experimental badges — yellow EXPERIMENTAL pill on all experimental toggles',
            'Experimental Features section — separate collapsible in Advanced tab',
            'Profile Frames — 42 decorative frame overlays on avatars (experimental)',
            'Animated Avatars — subtle pulse animation (experimental)',
            'Enhanced Message FX — sparkle effect on sent messages (experimental)',
            'Message Translate — translate button on message hover via MyMemory API (experimental)',
            'Compact Spacing — tighter message layout (experimental)',
            'Chat input area shadow — theme-adaptive elevation effect',
            'App Zoom slider — preview with restart notification (no more UI breakage)',
            'Chat settings: Enter to Send, Show Avatars, Image Previews',
            'Orbit Echo always persisted in database for testing',
            'Toast notification types — info/success/warning/error icons'
          ]]
        ]) +
        versionBlock('0.0.5-beta', 'Stable', [
          ['New Features', [
            'Backup & Restore (.orzip / .zip) with database transaction safety',
            'Database Health Check with integrity verification',
            'Database Repair — VACUUM, REINDEX, orphan removal',
            'Unread badges with count on DM and group rows',
            '@mention highlighting in chat messages',
            'Mention badges (distinct red badge) for @mentions',
            'Jump to first unread button in chat feed',
            'Unread messages divider in chat',
            'Read receipts — see when your message was read',
            'Edit message sync — edits now broadcast to peers',
            'Per-chat mute/unmute from right-click menu',
            'Mute toggle in profile sidebar',
            'Muted chat indicator (bell-off icon) in sidebar',
            'Keyboard shortcuts: Ctrl+K search, Ctrl+Shift+M mute, / to focus input',
            'Transfer cancellation with retry (3x backoff) and error banners',
            'Disk space check before receiving files',
            'File size enforcement (configurable max, default 500MB)',
            'Group roles: Owner, Admin, Member with promote/demote',
            'Group Info Panel with role badges (Owner/Admin)',
            'Group context menu: Pin, Info, Mute, Copy Invite, Leave, Delete',
            'Share invite codes directly in chat',
            'Clickable invite code chips with Join button',
            'Join request Accept/Deny modal for group owners',
            'Group row polish: sender preview, online member count',
            'Message Search v2: relevance ranking + sender/date filters',
            'Admin can remove non-admin, non-owner members',
            'Network Dashboard with live peer stats',
            'Do Not Disturb mode with live status banner',
            'Custom attachment auto-delete timer (1 min — 24 hours)',
            'Privacy Mode toggle — ephemeral attachments only',
            'Clear All Saved Attachments button',
            'Chat background patterns: Dots, Grid',
            'End-to-end encryption (ECDH + AES-256-GCM) for DMs — toggle in Data Manager',
            'E2EE public key exchange via LAN discovery beacons',
            'Developer Mode — opens Electron DevTools via IPC',
            'Experimental Features toggle with notification',
            'Settings tabs redesigned with collapsible sections: Account (live preview), Appearance, Notifications, Advanced, About',
            'Activity Center — unified recent messages modal with sender avatars and attachment icons',
            'Storage button — opens Data Manager directly from left sidebar',
            'Sidebar buttons visibility toggles in Appearance → Text & Layout (Activity, Gallery, Storage)',
            'Fixed sidebar width persistence on startup',
            'Groups button removed from left sidebar (accessible via middle sidebar tabs)'
          ]],
          ['Technical', [
            'GROUP_LEAVE protocol — broadcasts leave to all peers'
          ]]
        ]) +
        versionBlock('0.0.4-beta', '', [
          ['New Features', [
            'Group chat creation and joining',
            'Invite code system for groups',
            'Pinned messages',
            'Message reactions',
            'Image gallery sidebar',
            'Global gallery tab',
            'Transfer progress UI',
            'File transfer system with TCP'
          ]]
        ]) +
        versionBlock('0.0.3-beta', '', [
          ['New Features', [
            'LAN peer discovery via UDP broadcasting',
            'Local echo channel for testing',
            'Friend list with online status'
          ]]
        ]) +
        versionBlock('0.0.2-beta', '', [
          ['New Features', [
            'Early development release with core messaging infrastructure',
            'User identity and profile system',
            'Settings and preferences framework'
          ]]
        ]) +
      '</div>';

    function changelogEntry(version, tag, items) {
      var tagHtml = tag ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:4px;padding:2px 6px;margin-left:8px;text-transform:uppercase;">' + tag + '</span>' : '';
      var itemsHtml = items.map(function(i) { return '<li style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' + i + '</li>'; }).join('');
      return '<div style="border-bottom:1px solid var(--border-subtle);padding-bottom:16px;">' +
        '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">v' + version + tagHtml + '</div>' +
        '<ul style="margin:0;padding-left:20px;">' + itemsHtml + '</ul>' +
      '</div>';
    }

    function versionBlock(version, tag, sections) {
      var tagHtml = tag ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:4px;padding:2px 6px;margin-left:8px;text-transform:uppercase;">' + tag + '</span>' : '';
      var bodyHtml = sections.map(function(s) {
        var itemsHtml = s[1].map(function(i) { return '<li style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' + i + '</li>'; }).join('');
        return '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin:12px 0 4px 0;">' + s[0] + '</div>' +
          '<ul style="margin:0;padding-left:20px;">' + itemsHtml + '</ul>';
      }).join('');
      return '<div style="border-bottom:1px solid var(--border-subtle);padding-bottom:16px;">' +
        '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">v' + version + tagHtml + '</div>' +
        bodyHtml +
      '</div>';
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this._overlay = overlay;

    if (window.lucide) window.lucide.createIcons({ root: modal });

    modal.querySelector('#changelog-close').addEventListener('click', function() { window.Changelog.close(); });

    document.addEventListener('keydown', this._escHandler = function(e) {
      if (e.key === 'Escape') window.Changelog.close();
    });
  },

  close() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }
};
