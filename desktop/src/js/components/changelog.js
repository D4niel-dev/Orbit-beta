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
        changelogEntry('0.1.2-beta', 'Latest Stable', [
          'Manual Connect Bug Fixed: "Add a Friend" IP connect no longer creates duplicate TCP connections — socket remapping now works when peerId is "manual"',
          'Protocol Type Unification: All 47 types unified across shared/ and desktop/ protocol.js — cross-platform call/file-transfer/group compatibility guaranteed',
          'Build Pipeline Overhaul: Android assembleRelease, SHA256 checksums, artifact verification, build metadata (version/commit/date), asset size table in release notes',
          'Hardcoded type strings eliminated: store.js (16) and mobile/app.js (5) now use Protocol.Types constants — no more silent failures on unknown type strings'
        ]) +
        changelogEntry('0.1.1-beta', '', [
          'Voice & Video Calls (P2P): Full WebRTC call system with incoming notification, mute/speaker controls, timer, ICE exchange',
          'Group Calls (Mesh): Each participant gets their own RTCPeerConnection; video grid or avatar circles for audio-only',
          'Camera Toggle: On/off during calls with deterministic HSL avatar placeholder when camera is off',
          'Message Forwarding: Forward messages with attachments to any chat via chat picker modal (desktop + mobile)',
          'Block User: Block/unblock from context menu and profile sidebar; P2P filter drops blocked packets',
          'Search Within a Chat: Scoped search with chatId filter, sender filter, date inputs, context-aware placeholders',
          'Export Chat History: JSON or TXT export with timestamped downloads via Data Manager',
          'Save/Load Themes: Export current theme as JSON; import via file picker in Appearance tab',
          'Message Translate Unlocked: Always-on translate button (no experimental gate), default enabled in Appearance tab',
          'Mobile Reply fromName Fix: fromName now set on ALL outgoing MESSAGE packets — cross-platform reply consistency',
          'Lucide Icon Null Fix: All querySelector(\'i\') changed to querySelector(\'svg\') — createIcons replaces i tags with svg',
          'Online Status: lastSeen on BEACON, 30s interval checks for stale connections (120s timeout)',
          'Camera Placeholder Refactored: Pre-rendered in HTML — no dynamic DOM creation; just toggles display:none',
          'Call Modal UI: Proper centering, audio wave bars, hover button effects, local video as full grid tile in groups',
          'Inline code/pre CSS styling for both platforms'
        ]) +
        changelogEntry('0.1.0-beta', '', [
          'Performance: Up to 5× faster startup and rendering — selective store subscriptions, setStateBatch microtask coalescing, insertAdjacentHTML, event delegation for all message actions',
          'Startup: ~40% faster (5s → 3s) — deferred init phases (setTimeout(0) + requestIdleCallback), batched store IPC (7+ calls → 1), lazy message loading (last 50 per chat, load on demand)',
          'freezeGifImages: Canvas cache via _frozenCache Map; expanded selectors (orbit-db://, .avatar img); global call on Reduce Motion toggle; mobile feed re-render on toggle',
          'Bug fix: orbit-db://attachment/ 404 — base64 data URL extraction in addMessage for both privacy and non-privacy modes',
          'Bug fix: Selective subscriber undefined changedState — store.notify() without args no longer throws',
          'Bug fix: Message avatar click moved from re-attached attachEvents to initDelegatedActions (registered once)',
          'Bug fix: loadFullChatMessages was dropping existing messages (only stored the diff, not full result)',
          'New: Data Manager "Load All Stored Data" — double-confirmation button loads all messages from DB into memory on demand'
        ]) +
        changelogEntry('0.0.9.3-beta', '', [
          'Group Info Panel overhaul — Add Member (friend picker), Leave Group, Transfer Ownership, member search, created date, online/total count',
          'GROUP_MEMBER_ADDED and GROUP_OWNER_TRANSFER protocol types — cross-platform support',
          'DM context menus — right-click on desktop, long-press on mobile: Pin/Unpin, Mute, View Profile, Copy ID, Close DM (removes friend from DB)',
          'Pinned DMs — pinned state sorted first in sidebar with pin icon',
          'Close DM removes friend — calls dbDeleteFriend; persists closedDMs; auto-reopens on new message',
          'P2P Diagnostics panel — logs, errors, peer info, connection stats via button in connection stats overlay',
          'Debug log buffer — window._debugLogBuffer captures last 500 console entries',
          'Global Gallery type filters — All/Images/Files, non-images render with file icons, gallery view mode persisted to DB',
          'Gallery sidebar Files tab fix — Format.bytes→fileSize, download button replaces window.open for custom protocol URLs',
          'Create Group modal — shows friend avatars with profile frames',
          'Context menu fix — data-action attribute never set; rewritten to use DOM methods with captured onClick',
          'P2P protocol audit — isPeerConnected key mismatch, protocol type string fixes, TCP merge IP strip port'
        ]) +
        changelogEntry('0.0.9.2-beta', '', [
          'Mobile initP2P Logging — detailed debug logs throughout P2P initialization and lifecycle',
          'Dev Mode DevTools — toggling Developer Mode loads eruda on-device inspector panel',
          'Debug Log Buffer — scrollable log overlay when dev mode is active',
          'Cross-platform v0.0.9.1-beta version sync',
          'Bug #1: Desktop sends messages to mobile (socket.remoteAddress as BEACON IP fallback)',
          'Bug #2: Mobile peer merging (host:port→UUID dedup)',
          'Cross-platform v0.0.9.2-beta version sync'
        ]) +
        changelogEntry('0.0.9-beta', '', [
          'Android P2P Stability — 8 Java plugin fixes (multicast lock, beacon gating, TCP buffer, connection tracking) + 4 JS bridge fixes',
          'Desktop P2P Stability — 9 fixes (write queue, oversized frames, socket errors, self-beacon filter, transfer backpressure, restart)',
          'Desktop Socket Write Queue — per-connection queue prevents TCP byte interleaving on length-prefixed frames',
          'Android Add Friend — no more P2P Preview gate; cleartext traffic flag; plugin retry mechanism',
          'Mobile Group Info Panel — full panel: edit name/description, avatar change, invite code + share, pin/mute, members with roles + join dates, promote/demote/remove, leave/delete',
          'Cross-Platform Group Sync — GROUP_CREATE/GROUP_LEAVE broadcast compatible between mobile and desktop',
          'Mobile DB Fix — migration runs after user load to prevent identity corruption on restart',
          'Pinned Messages — pin/unpin in action bar; pinned section in group info; cross-platform sync via shared protocol',
          'Message Search — search bar filters messages in real-time on mobile chat header',
          'Member Join Dates — shows "Joined Jan 15, 2026" in group member list',
          'Enhanced Message FX — particle confetti system (both platforms); safe CSS (no color-mix, no overflow:hidden)',
          'Mobile Settings — Font Size (S/M/L), Message Animation (Slide/Fade), Auto-Reconnect toggle, Connection Timeout (5/10/30/60s)',
          'Desktop Bug Fixes — require(crypto) → window.crypto in sidebar-middle; PIN_MESSAGE groupId in payload',
          'Avatar in P2P Beacons — cross-platform avatar sharing in discovery packets'
        ]) +
        changelogEntry('0.0.8-beta', '', [
          'Rich Link Previews v2 — Open Graph metadata (title, description, image) fetched via Electron IPC',
          'Message Link Styling — URLs in chat text now clickable with hover/active color states (both desktop + mobile)',
          'Cross-Platform P2P — Desktop ↔ Android LAN discovery and messaging via TCP/UDP',
          'QR Code Fixes — Both desktop and mobile QR generation fixed; mobile QR moved to Add Friend modal',
          'Mobile Settings Wired — All toggles now have real behavior (time format, avatars, images, notifications, etc.)',
          'Mobile Toast Overhaul — Type-based accent bar, icons, slide-in animation, progress bar',
          'Mobile Notification Sound — Web Audio beep on incoming P2P messages',
          'Desktop Settings Tabs — Notifications (volume/sound/test), Network (collapsibles), About (version info)',
          'Chat Background Patterns — Diagonal Stripes, Crosshatch, Circles',
          'Desktop Bug Fixes — MIME mapping, cache headers, media retry, attachment URL stability'
        ]) +
        changelogEntry('0.0.7-beta', '', [
          'First-Time User Tutorial (Welcome Tour) — skippable and replayable via Settings',
          'Link Previews — Rich URL cards rendered directly in chat messages',
          'Activity Center Overhaul — Modern notification timeline with Tabs (All, Mentions, Files, System Logs)',
          'Shared Media Gallery — Revamped right-side panel with Images, Files, and Links grouped chronologically',
          'Privacy Mode Overhaul — Attachments and thumbnails are properly handled and cleaned up',
          'Android Port Architecture — Core cross-platform abstractions built for upcoming mobile release',
          'Numerous UI polish and stability bug fixes (Attachment 404s, CSP blocks, Layout quirks, etc.)'
        ]) +
        changelogEntry('0.0.6-beta', '', [
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
          'Consistent clipboard — IPC clipboard with navigator.clipboard fallback',
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
        ]) +
        changelogEntry('0.0.5-beta', 'Stable', [
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
          'GROUP_LEAVE protocol — broadcasts leave to all peers',
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
        ]) +
        changelogEntry('0.0.4-beta', '', [
          'Group chat creation and joining',
          'Invite code system for groups',
          'Pinned messages',
          'Message reactions',
          'Image gallery sidebar',
          'Global gallery tab',
          'Transfer progress UI',
          'File transfer system with TCP'
        ]) +
        changelogEntry('0.0.3-beta', '', [
          'LAN peer discovery via UDP broadcasting',
          'Local echo channel for testing',
          'Friend list with online status'
        ]) +
        changelogEntry('0.0.2-beta', '', [
          'Initial release with basic messaging',
          'User identity system',
          'Settings and preferences'
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
