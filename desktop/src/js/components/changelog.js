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
        changelogEntry('0.0.7-beta', 'Latest', [
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
        changelogEntry('0.0.5-beta', '', [
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
