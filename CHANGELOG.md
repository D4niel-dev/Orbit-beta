# Orbit Changelog

## v0.0.8-beta **Current Version**

### Features & Enhancements
- **Link Previews v2:** Rich preview cards now fetch Open Graph metadata (title, description, image) from shared URLs via Electron IPC. Cards auto-expand to message bubble width, with colored left accent bar, hover/active link color states (white → dark blue → green), and CSS-class-based styling. New "Link Previews" toggle in Chat settings. Mobile link previews added with styled cards and clickable URL text.
- **Message Link Styling:** URLs in message text now render as actual `<a>` tags with hover (dark blue `#1a3a6b`) and active (green `#2d7a2d`) color states. Own messages show links in white by default. Mobile received the same `linkifyText()` treatment.
- **Cross-Platform P2P Connectivity:** Desktop and Android now discover each other via LAN multicast beacons and establish TCP connections. Mobile `initP2P()` rewritten with beacon build/discovery, auto-adds friends, auto-creates chats, and handles TYPING/REACTION packets.
- **Desktop Protocol Compatibility:** `shared/network/protocol.js` (and mobile copy) unified with `BEACON` type and `from` field. Desktop `discovery.js` and `socket.js` accept `packet.from || packet.senderId` for self-filtering and peer registration.
- **QR Code Generation Fix (Both Platforms):** Root cause was `window.QRCode` not being properly exposed — desktop unpkg `qrcode.js` set global `qrcode` but not `window.QRCode`; mobile library called `qrcode()` (instance) instead of `qrcode` (constructor). Both fixed with proper direct `QRCode(0, 'M')` call.
- **Mobile QR Code Relocated:** Removed from profile overlay, added as "My QR" tab in Add Friend modal. QR renders on first tab switch.
- **QR Scanner Performance:** Added `{ willReadFrequently: true }` to `getContext('2d')` in `scanFrame()` — eliminates repeated `getImageData` console violation.
- **Desktop Settings Tabs:** Notifications (volume slider 0–100%, sound type select, test button), Network (restyled collapsibles + timeout/keep-alive/auto-reconnect/bandwidth), About (version/electron/node info, GitHub link, report-issue link).
- **Chat Background Patterns:** Added Diagonal Stripes, Crosshatch, Circles. Diagonal Stripes fixed by removing conflicting `background-size`.
- **Empty State Icons:** Added `wifi-off` to "No friends online", `user-x` to "No friends available", `radio` to "No peers online" (Network tab).
- **Mobile Toast Overhaul:** Type-based left accent bar, lucide icons per type (info/success/error/warning), slide-in animation, progress bar that shrinks over duration.
- **Mobile Modal Tabs:** Add Friend modal now has "Add Friend" and "My QR" tabs. Create Group hides tabs and uses the Add Friend tab content.
- **Mobile Settings Wired:** All settings now have real behavior — `timeFormat24` (12h/24h toggle), `showChatAvatars` (hide chat list avatars), `showImagePreviews` (toggle inline image rendering), `notifyDnd`/`notifyPreview`/`notifySound`/`notifyGroupMentions` (notification controls), `showMessageIds` (message IDs in bubbles), `devMode`/`debugDisplay`/`showConnectionStats` (debug overlay), `logNetworkPackets` (console P2P logging), `maxFileSize` (file size enforcement), `experimentalCompactSpacing` (CSS data attribute), `deleteAttachmentsAfter` (auto-cleanup timer), `networkMode` (show/hide port fields), experimental toggles (CSS data-* attributes).
- **Mobile Notification Sound:** Plays a short 660Hz beep via Web Audio API on incoming P2P messages when `notifySound` is enabled.
- **Clear Network Cache Button:** Now calls `window.orbitAPI.networkStart(user)` to reset discovery/socket connections.

### Bug Fixes
- **Desktop `positionCard()` brace mismatch** — Fixed syntax error in card layout logic.
- **Desktop `contentTypeFromAtt()` MIME mapping** — Added proper MIME types for 6 protocol handler paths, fixing Chromium rejection of custom-protocol image loads.
- **Desktop `cacheHeaders()`** — Added `Cache-Control: no-cache, no-store, must-revalidate` on all `orbit-db://` responses to prevent stale cached error responses.
- **Desktop `handleMediaError`** — Added auto-retry for media load failures.
- **Desktop `sendMessage()`** — Now always uses `orbit-db://` URLs with `path: file.path || file.name` fallback; removed blob URL fallback to avoid `ERR_FILE_NOT_FOUND`.
- **Add Friend Modal + Create Group Modal** — `showCreateGroup()` hides tab bar and shows Add Friend content; `resetModalToAddFriend()` restores tab state. Removed duplicate `modalInput.onkeydown` assignments.
- **Diagonal Stripes Pattern** — Removed conflicting `background-size` that created visible tile boundaries.
- **Mobile Create Group Modal** — Fixed bug where modal showed with wrong tabs/corrupted state.

### Technical
- **OG Metadata Fetch:** Added `ipcMain.handle('fetch-og')` in `main.js` — fetches page HTML via Electron `net.fetch`, parses `<title>`, `og:title`, `og:description`, `og:image` with 5s abort timeout. Results cached in `window._linkPreviewCache`.
- **Message Link Sanitization:** Desktop `sanitize.js` URL regex now uses class `msg-link` instead of inline styles. Mobile added `linkifyText()` helper for the same purpose.
- **Mobile `initP2P()`:** Full rewrite with `buildBeacon()`, LAN discovery, desktop-compatible beacon parsing, auto-add friend + create chat, auto TCP connect, handles both `from`/`senderId` fields, TYPING/REACTION support, friend status update on disconnect.
- **Mobile Beacon Format:** Passed as JS object to Java plugin — `call.getObject("beacon", ...)` required for correct deserialization.
- **TCP Framing:** 4-byte length prefix + JSON encoding is compatible between desktop (Node.js `Buffer`) and mobile (Java `DataInputStream`/`DataOutputStream`).
- **Store Defaults:** Added `showLinkPreviews: true` to both desktop and mobile default settings.
- **Version:** Bumped to `0.0.8-beta` across all manifests and About tabs.

## v0.0.7-beta

### Features & Enhancements
- **First-Time User Tutorial:** An 8-page Welcome Tour introduces new users to Orbit's core concepts — chats, file sharing, LAN/Wi-Fi modes, groups, search, privacy, and settings. Skippable at any time, replayable from Settings → About → Welcome Tour. Tutorial state (`tutorialCompleted`, `tutorialSkipped`, `showTutorialOnStartup`) persists across restarts.
- **Link Previews:** URLs in chat messages are automatically detected and rendered as rich preview cards below the message bubble, showing the domain name and a styled placeholder. Cards adapt to the user's bubble theme.
- **Activity Center Overhaul:** Transformed from a basic grouped-chat modal into a unified notification timeline with four tabs — All (chronological stream of all messages), Mentions (`@username` and `@everyone`), Files (shared attachments), and System (peer connect/disconnect events). Includes "Clear All" dismissal that sets a timestamp marker without deleting actual data. Clicking an event card navigates directly to the message in chat.
- **Shared Media Gallery:** The right-side Image Gallery panel has been completely rewritten into a tabbed "Shared Media" hub with three views — Images (grid with hover overlays showing sender name and zoom action), Files (list with type-aware icons for audio/video/document), and Links (extracted URLs with domain parsing). All content is grouped chronologically with sticky date headers (Today, Yesterday, Month Year).
- **Privacy Mode Overhaul:** `saveAttachment()` now correctly passes `localPath` to the database for backup restore compatibility. Gallery sidebar thumbnail URL generation fixed for `orbit-file://` URLs. Thumbnail generation added for privacy mode via `sharp`. Privacy mode indicator badge added to the chat header.
- **Android Port Architecture:** Project restructured into `desktop/`, `mobile/`, and `shared/` directories. Cross-platform abstraction layer built — `shared/core/env.js` (runtime detection), `shared/database/` (factory + SQLite implementations), `shared/network/protocol.js` (packet definitions), `shared/crypto/e2ee-desktop.js` (E2EE wrapper), `shared/utils/` (format, sanitize). Mobile UI shell created with Capacitor Android build pipeline (`npx cap sync android` succeeds).
- **System Activity Log:** New `addSystemLog()` method on the store tracks peer connections, disconnections, and discoveries with timestamped entries. Displayed in the Activity Center's System tab.
- **Version Info in About Tab:** Electron and Node.js versions are now correctly exposed via the preload bridge (`orbitAPI.electronVersion`, `orbitAPI.nodeVersion`) and displayed in Settings → About.

### Bug Fixes
- **Attachment 404 on New Images:** Fixed empty buffer being stored in DB — attachment data now properly passes through the `addMessage` pipeline with `localPath` fallback.
- **Privacy Mode File Loading:** Strengthened `localPath` → `orbit-file://` fallback chain for reliable image loading when DB blob is empty.
- **Autofill.enable DevTools Error:** Suppressed Electron 32 DevTools protocol quirk.
- **orbit-avatar:// Blocked by CSP:** Added `orbit-avatar:` to `img-src` and `media-src` CSP directives.
- **Search Modal Autofocus Blocked:** Deferred `.focus()` call with `setTimeout` to avoid focus contention.
- **Join Group Tab UI Issues:** Fixed Lucide icon not rendering on tab switch, cramped button layout, short content area, and tab text clipping.
- **self.showAddFriendModal Not a Function:** Added missing `var self = this;` closure in sidebar-middle.js.
- **msg.id.substring Not a Function:** Coerced `msg.id` to string before calling `.substring()`.
- **Settings Account Tab Crash:** Fixed `s is undefined` error when reading `experimentalProfileFrames` (missing `self` reference).
- **Chat Wallpaper Pattern Bug:** Removing a custom wallpaper image now correctly falls back to the selected background pattern without requiring a full app restart. Settings updates now route through `window.App.applySettings()` as a single source of truth.

### Technical
- **Preload Bridge:** Added `electronVersion` and `nodeVersion` to `orbitAPI` exposure. Updated fallback version string to `0.0.7-beta`.
- **Store:** Added `addSystemLog(type, message)` method with 100-entry rolling buffer. `addOrUpdatePeer()` now emits system logs on peer status changes (connect/disconnect/discover). Added `activityClearedAt` and `systemLogClearedAt` state fields for Activity Center dismissal.
- **Settings Modal:** Refactored `updateSettings` to trigger `window.App.applySettings()` globally, ensuring consistent CSS variable application. Removed redundant inline DOM manipulation from button listeners.
- **Changelog Component:** Added v0.0.7-beta entry as latest; demoted v0.0.6-beta.

## v0.0.6-beta

### Features & Enhancements
- **Custom Themes:** New "True Dark" theme (neutral grays + blue accent) replaces the old dark theme. Old dark renamed to "Dark Purple". Added pre-made themes: Midnight, Sunset, and Nord. Seasonal theme auto-rotates by meteorological season (4 CSS files).
- **Custom Colors Modal:** Live preview color editor for all UI color categories — backgrounds, surfaces, text, accents, borders, status, and shadows. Integrated with theme system.
- **Dev Mode Master Gate:** Developer Tools and Experimental Features are now separate collapsible sections in the Advanced tab. Dev Mode must be enabled first — it acts as the master gate controlling visibility of both sections.
- **Profile Frames:** 12 decorative frame overlays (PNGs) on avatars in the chat feed. New "Profile Frame" collapsible section in Account tab between "Profile" and "Avatar & Banner". Frame picker uses actual frame previews. Frame sync is broadcast via discovery.js and persisted to user identity. (Experimental)
- **Animated Avatars:** Subtle pulse animation applied to all avatars in the chat feed. (Experimental)
- **Enhanced Message FX:** Sparkle/stars animation on sent messages with CSS keyframes. (Experimental)
- **Message Translate:** Translate button appears on message hover — opens an inline translation panel using the MyMemory API. Source/target language auto-detection. (Experimental)
- **Compact Spacing:** Tighter message layout via a CSS class that reduces padding, margins, font sizes, and bubble gaps. (Experimental)
- **App Zoom:** Slider with a mini UI preview mockup that scales in real time. Zoom no longer applies dynamically (was breaking UI) — instead saves the value and shows a toast asking the user to restart. Applies on next launch via `webFrame.setZoomLevel()`.
- **Chat Input Shadow:** Theme-adaptive `box-shadow` on the chat input area (`0 -4px 12px rgba(0,0,0,0.06), var(--shadow-md)`).
- **Chat Settings:** Three new toggles in Appearance → Chat: Enter to Send (send on Enter instead of Shift+Enter), Show Avatars (toggle avatars in chat feed), Image Previews (toggle inline image rendering).
- **Orbit Echo Bot:** The "Orbit Echo" test account is now always inserted into the database on initialization — guaranteed to appear even when other friends exist. It remains unloginable and serves as a local echo channel for testing.
- **Toast Notification Types:** `Window.Toast.show()` third parameter now accepts a type string (`"info"`, `"success"`, `"warning"`, `"error"`) which renders the corresponding Lucide icon (info, check-circle, alert-triangle, alert-circle).

### Bug Fixes
- **Settings Account Tab Crash:** Fixed `s is undefined` error when interacting with collapsible sections or frame picker in the Account tab (missing `self` reference in settings-modal.js:145).
- **Profile Frame Positioning:** Fixed spacing bug in frame picker where frames were positioned incorrectly. Fixed `position:relative` on the avatar container overriding the frame's `position:absolute` layout.
- **Frame 1 Missing:** Frame file `ProfileFrame_1.png` doesn't exist — frame picker skips index 1 and loops from 2 to 13.

### Technical
- **Profile Frames:** Added `Window.Frames` helper object in `app.js` with `getList()`, `getFrameUrl(index)`, `getApplied()`, `apply()` methods. Frame data broadcast in discovery beacon as `frames` field. Frame index synced to `currentUser.frame` in store and saved to identity.
- **Settings Restructure:** Advanced tab split into "Developer Tools" and "Experimental Features" collapsible sections. Dev Mode toggle controls visibility of both sections via `display: block / none`. Experimental toggles display yellow "EXPERIMENTAL" pill badges.
- **Changelog:** In-app changelog (`src/js/components/changelog.js`) updated with all v0.0.6-beta entries.
- **README:** Updated with v0.0.6-beta version, new feature listings, and roadmap additions.

## v0.0.5-beta — **Stable Release**

### Features & Enhancements
- **Transfer Resilience:** File transfers now include retry logic (3 retries with exponential backoff), transfer timeout (60s stale cleanup), cancel buttons on progress bars, and error toasts for failed sends/receives.
- **Disk Space Check:** Receiving peers now check available disk space before accepting a transfer — rejects with `FILE_TRANSFER_REJECT` if insufficient space.
- **Transfer Cancellation:** New `FILE_TRANSFER_CANCEL` protocol message and IPC handler — users can cancel in-progress transfers via X button on progress bars.
- **Transfer Error UI:** Errors now surface as Toast notifications and inline error banners (with dismiss) instead of silent console logs.
- **File Size Enforcement:** User's `maxFileSize` setting (default 500MB) is now enforced at send time — oversized files are skipped with a Toast warning.
- **Transfer Timeout:** Active receive transfers that are inactive for 60+ seconds are automatically cleaned up (temp files deleted, memory freed).
- **Storage Validation & Repair:** New "Repair Database" feature in Settings > Data Manager that rebuilds indexes, removes orphaned records (messages, attachments, group members), and fixes journal mode.
- **Data Manager Tab:** Merged "Privacy & Storage" into the renamed "Data Manager" tab — Privacy Mode toggle, auto-delete attachments, clear attachments, backup/restore, health check, and repair all in one place.
- **Group Roles:** Introduced `role` column in `group_members` (owner/member). Owners get an "Owner" badge in the Group Info panel. Only the owner can delete the group and remove members.
- **Group Context Menu Rework:** Replaced inline `oncontextmenu` with proper event delegation. Features: Pin/Unpin, Group Info, Copy Invite Code, Leave Group (with network notification), and Delete Group (owner only, with network notification).
- **Remove Member (Owner):** Owners can remove non-owner members via an ✕ button next to each member in Group Info. Removed members receive a `GROUP_LEAVE` notification.
- **Leave Group Notification:** When a member leaves a group, a `GROUP_LEAVE` packet is broadcast to remaining members so they see a "Member Left" Toast.
- **Delete Group Notification:** When the owner deletes a group, all members receive a `GROUP_LEAVE` notification.
- **Join Request Toast:** When someone requests to join a group via invite code, the owner now sees a Toast notification with the requester's name.
- **Role Badges:** Member list in Group Info now shows "Owner" badge next to the group owner's name.
- **Join Request Accept/Deny Modal:** Group owners now see a ConfirmModal with Accept/Deny when someone requests to join — no longer auto-accepts silently.
- **Clickable Invite Codes in Chat:** Known invite codes appearing in chat messages are rendered as inline clickable chips with a "Join" button — opens the Join modal pre-filled with the code.
- **Share Invite in Chat:** New "Share" button in Group Info copies the invite code into the current chat as a formatted message.
- **Pre-filled Join Tab:** Clicking an invite code in chat automatically opens the Create/Join modal on the Join tab with the code pre-filled.
- **Group Row Polish:** Last message preview in the sidebar now shows sender name ("You: ..." or "Username: ..."). Online member count is displayed (e.g., "3 online, 10 members").

### Database
- **v7 Migration:** Added `role TEXT DEFAULT 'member'` column to `group_members`. Backfills owner roles from `groups.ownerId`.
- **repairDatabase():** New method on OrbitDatabase that runs VACUUM + REINDEX, fixes orphaned group_members/messages/attachments, and ensures WAL journal mode.

### Bug Fixes
- **Duplicate `addMemberToGroup`:** Fixed duplicate method definition in `store.js` (second definition overwrote first, causing double IPC calls).

### Technical
- **IPC Layer:** Added `cancel-transfer`, `check-disk-space`, `db-repair` IPC handlers and corresponding preload API methods. Added `transfer-error` event for renderer-side error display.
- **Protocol:** Added `FILE_TRANSFER_CANCEL`, `FILE_TRANSFER_REJECT`, and `GROUP_LEAVE` message types.
- **TransferManager:** Added `destroy()`, `cancelReceive()`, `cancelSend()`, `_cleanupStale()`, `_hasDiskSpace()` methods. Chunk sends now retry up to 3 times with backoff. `onError` callback propagates failures to renderer.
- **Store:** Added `transferErrors` state and `handleTransferError()` helper with auto-dismiss after 10s. `handleIncomingPacket` now processes `GROUP_LEAVE`. Fixed duplicate `addMemberToGroup`.
- **Settings Sidebar:** Removed standalone "Privacy & Storage" tab; renamed "Data" to "Data Manager".
- **sidebar-middle.js:** Group context menu uses programmatic event handler with proper object references instead of fragile inline HTML strings.

## v0.0.4-beta

### Features & Enhancements
- **Advanced Settings Tab:** New "Advanced" tab with 6 toggles — Developer Mode, Debug Display (hover-to-inspect overlays on all UI), Show Message IDs, Log Network Packets, Show Connection Stats, and Experimental Features.
- **Debug Display Overlays:** All UI elements (messages, reactions, replies, search results, friend/group list rows) now carry `data-debug` attributes — when Debug Display is enabled, hover any element to reveal a polished tooltip with its internal state, IDs, and metadata.
- **Connection Stats Overlay:** Live debug panel showing connection status, peer count, uptime, and bytes sent/received.
- **Group Avatar Real-Time Updates:** Uploading a group avatar now updates the sidebar, chat header, and group info panel instantly without restart — uses `avatarUpdatedAt` timestamp for cache busting.
- **Modernized Create/Join Group Modal:** Restyled with pill-style segmented tabs, icon headers, proper breathing room padding (40px sides), and separated footer with consistent button sizing.
- **Modernized Add Friend Modal:** Extracted into a dedicated `showAddFriendModal()` with icon header, descriptive subtitle, proper padding, and consistent footer layout.
- **Search Modal Focus Polish:** Removed jarring purple box-shadow on focus — replaced with a subtle animated underline accent.

### Bug Fixes
- **Add Friend Button Not Working:** `prompt()` is blocked in Electron 32 sandbox — replaced with a custom inline modal overlay. Added `orbitAPI.connect` IPC through preload.js and a `network-connect` handler in main.js.
- **Create Group Button Out of Place:** Minimized `+` icon is now inline with the "Groups" header label, matching the DMs "Add Friend" button style exactly.
- **Group Avatar Not Updating in Real-Time:** Images were cached by the browser — added `?t=<avatarUpdatedAt>` cache buster to all `orbit-avatar://` URLs, and `save-avatar` IPC now updates the timestamp in DB.
- **`self.showAddFriendModal` Not a Function:** `renderList()` was missing `var self = this;` — added it.
- **Debug List Row Badge Clipped by Left Sidebar:** Moved debug badge from `left:-1px` to `right:-1px` with higher z-index to avoid panel overflow clipping.

### Database
- **v6 Migration:** Added `avatarUpdatedAt INTEGER` column to `groups` table for real-time avatar cache busting.

### Technical
- **IPC Layer:** Added `network-connect` IPC handler calling `socketInstance.connectToPeer()`. Added `avatarUpdatedAt` field to `saveGroup` prepared statement.
- **CSS Debug Display System:** Comprehensive `.debug-display` class system — hover-reveal tooltips using `::after`/`::before` pseudo-elements with app design tokens (`--bg-surface`, `--border-subtle`, `--accent-primary`), smooth opacity transitions, and element-specific positioning.
- **Settings Toggles:** 6 new settings (`devMode`, `debugDisplay`, `showMessageIds`, `logNetworkPackets`, `showConnectionStats`, `enableExperimental`) with CSS class toggles on `<html>` via `applySettings()`.
- **Cross-Platform Builds:** Added `build:mac`, `build:linux`, `build:all` npm scripts. Updated `electron-builder.yml` with macOS DMG (x64 + arm64), Linux AppImage + `.deb` targets, platform-specific metadata, and file exclusion rules.
- **GitHub Actions CI/CD:** New `.github/workflows/build.yml` — builds Windows, macOS, and Linux in parallel on tag push (`v*`), then creates a GitHub Release with all platform artifacts automatically.

## v0.0.3-beta

### Features & Enhancements
- **Group Chat:** Full multi-peer group messaging with database persistence — create groups with a friend picker modal, broadcast messages to all members, and view group-aware chat headers with member counts and overlapping avatars.
- **Group Info Panel:** Right-click any group in the sidebar to view/edit group name, description, invite code, pin status, notification mute, member list, and avatar.
- **Group Avatar Upload:** Upload custom group avatars via file picker — stored as file path references and rendered via `orbit-avatar://` protocol.
- **Pinned Groups:** Pin important groups to the top of the sidebar with a pin badge indicator.
- **Profile Sidebar:** Click any message avatar or friend avatar to open a dedicated right-side profile panel showing banner, avatar, username, tag, online status, bio, and user ID.
- **System Theme Option:** New "System" theme setting that follows the OS dark/light mode preference with live `matchMedia` listener.
- **Settings — Notifications Tab:** Toggles for notification sound, message preview, @mentions-only mode, and Do Not Disturb.
- **Settings — About Tab:** App name, version, user stats, and app icon.
- **Notification Sounds:** Short pleasant chime generated via Web Audio API (no audio files needed) — plays on incoming messages when sound is enabled and DND is off.
- **Toggleable Middle Sidebar:** Collapse the friend/group sidebar with a toggle button; floating re-open button appears on the right panel edge when hidden. CSS transition animation on grid layout.
- **Message Timestamp Position:** Timestamps now appear below the message bubble instead of above — left-aligned for sender, right-aligned for receiver.
- **Sender Bubble Layout:** Removed "You" label from group sender messages; avatar wrapper uses `padding-bottom` to offset bubble below avatar.
- **Message Reactions:** Added emoji reactions to messages — hover to reveal the reaction button, pick from 8 common emojis, and see reaction counts below each message.
- **Drag-and-Drop Uploads:** Drag files and images directly into the chat panel — the input area dims to indicate drop zone, and staged files appear in the preview bar.
- **Enhanced Markdown:** Extended markdown support with `###`/`####` headings, `~~strikethrough~~`, `>` blockquotes, `-` unordered lists, `1.` ordered lists, and fenced code blocks.
- **Privacy Mode Temp Storage:** Attachments in privacy mode are now saved to `{userData}/temp/` and served via `orbit-file://` protocol, with automatic cleanup on app exit.
- **Persistent Mode Reliability:** Attachments in persistent mode now include proper error handling around file reads, ensuring data isn't silently lost if temp files are removed.

<p align="center">
  <img src="desktop/src/icons/screenshots/preview-group-dark.png" alt="Group chat (dark)" width="360">
  <img src="desktop/src/icons/screenshots/preview-group-light.png" alt="Group chat (light)" width="360"><br>
  <em>Group chat</em>
</p>

<p align="center">
  <img src="desktop/src/icons/screenshots/preview-group-info-dark.png" alt="Group info (dark)" width="360">
  <img src="desktop/src/icons/screenshots/preview-group-info-light.png" alt="Group info (light)" width="360"><br>
  <em>Group info panel</em>
</p>

### Bug Fixes
- **Empty Buffer Truthy Bug:** Protocol handlers (`orbit-db://`) no longer treat `Buffer.alloc(0)` as valid data — added `.length > 0` checks to both attachment and thumbnail handlers, returning proper `404` for empty blobs.
- **Privacy Mode File Loading:** Fixed `orbit-db://` protocol to fall back to `att.localPath` filesystem path when the database blob is empty, enabling reliable image loading in privacy mode.
- **Windows Path Resolution:** Fixed `orbit-file://` protocol handler to convert backslashes to forward slashes on Windows, resolving `file:///C:\...` → `file:///C:/...` format.
- **Cleanup Timer Default:** Changed attachment cleanup default from 525,600 minutes (365 days) to `0` (Never), preventing unexpected data loss when `deleteAttachmentsAfter` isn't explicitly set.
- **Received File Size:** File size is no longer hardcoded to `0` — the actual file size now passes through the transfer pipeline via `onComplete(fileSize)` callback and `file-received` event.
- **Sender Attachment ID:** Local sender messages now include a stable `id` field on attachment objects, ensuring database inserts use consistent primary keys.
- **Image Forwarding:** Forwarding images via the gallery viewer now preserves attachment `id` and `path`, preventing data loss on the forwarded copy.
- **URL Selection:** `getMessages()` and `getAllMessagesRaw()` now return `orbit-file://` URLs for attachments with `localPath` set, matching the correct storage mode.
- **Bio Persistence on Migration:** The v2 identity migration now preserves the existing `bio` field (`identity.bio || ''`) instead of hardcoding an empty string.
- **CSP for Avatar Protocol:** Added `orbit-avatar:` to `img-src` and `media-src` Content Security Policy to allow custom group avatar rendering.
- **Profile Sidebar Close:** Fixed `self` variable scoping where `self.close()` in the render function resolved to `window.self.close()` (closing the whole Electron window) instead of the ProfileSidebar method.

### Database
- **v3 Migration:** Added `groups` and `group_members` tables for group chat persistence.
- **v4 Migration:** Added `localPath TEXT` column to `attachments` table for privacy mode temp file references.
- **v5 Migration:** Added `avatarPath TEXT`, `description TEXT`, `pinned INTEGER DEFAULT 0`, `notificationMuted INTEGER DEFAULT 0`, and `inviteCode TEXT` columns to `groups` table.

### Technical
- **IPC Layer:** Added 6 new group CRUD IPC handlers (`db-get-groups`, `db-save-group`, `db-add-group-member`, `db-remove-group-member`, `db-get-group`, `db-get-group-members`) and corresponding preload API methods.
- **Socket Manager:** Added `broadcastToGroup()` method for sending packets to multiple group members simultaneously.
- **Store:** Added `addGroup()`, `removeGroup()`, `addMemberToGroup()`, `getGroupMembers()`, `sendReaction()`, `updateGroupField()`, `removeGroupMember()` methods; `GROUP_CREATE` and `REACTION` packet routing.
- **Notification Sound:** Added `window.NotificationSound` Web Audio API utility — generates a two-tone chime oscillator without external audio files.

## v0.0.2-beta

### Features & Enhancements
- **Persistent Storage:** Replaced ephemeral JSON storage with a robust `better-sqlite3` database for scalable, permanent message and media archiving.
- **Privacy Mode:** Added an Attachment Storage toggle in Settings. When enabled, attachments are kept in temporary storage and deleted upon closing the app, while messages and profile data remain intact.
- **Storage Management:** Added a "Clear All Saved Attachments" button in Settings to permanently delete attachment BLOBs.
- **Large File Support (250MB):** Replaced legacy JSON serialization with chunked TCP streaming, drastically reducing RAM spikes and allowing files up to 250MB to transfer flawlessly.
- **Data Integrity:** Implemented SHA-256 hash generation and validation during file transfers to prevent file corruption.
- **WebP Compression & Caching:** Added `sharp` to automatically generate highly compressed WebP thumbnails of image attachments on ingestion for vastly improved Gallery Sidebar performance.
- **Offline Reliability:** Direct P2P files now ingest straight into the SQLite database and are served securely to the UI via custom `orbit-db://` protocol handlers.

### Bug Fixes
- Resolved critical bug where received images would result in a "Not Found" error upon refreshing the page.
- Fixed duplicate author metadata in `package.json` that warned during compilation.
- Resized application icons to `256x256` to pass strict Electron-Builder validations.

## v0.0.1-beta *(Original Release)*

### Initial Release
- Core P2P chat functionality using raw sockets.
- File and image sharing capabilities.
- Local network Auto-Discovery.
- Customizable user profiles, avatars, and UI themes.
- Initial ephemeral JSON storage backend.
