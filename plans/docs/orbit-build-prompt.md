# 🪐 ORBIT — Full Build Prompt
### Electron + HTML/CSS/JS Desktop & Android Chat App (LAN + WiFi P2P)

---

## 📌 PROJECT OVERVIEW

**App Name:** Orbit  
**Tagline:** "Stay in orbit with the people that matter."  
**Stack:** Electron (desktop), Capacitor or Electron + Android bridge (APK), HTML, CSS (custom + variables), Vanilla JavaScript (with Node.js APIs in the main process)  
**Networking:** LAN autodiscovery (UDP multicast) + WiFi same-network P2P (TCP/WebSocket)  
**No server required.** No cloud. No login accounts. Identity is derived from the local machine (hostname + a generated UUID stored in `userData`).  
**Compilation targets:** `.exe` (Windows, via `electron-builder`), `.apk` (Android, via Capacitor wrapping a WebSocket client + custom discovery)

---

## 🗂️ FOLDER STRUCTURE

```
orbit/
├── main.js                   # Electron main process (window, IPC, tray)
├── preload.js                # Context bridge (exposes safe APIs to renderer)
├── package.json
├── electron-builder.yml      # Build config for .exe, .dmg, etc.
├── capacitor.config.json     # Android bridge config
├── src/
│   ├── index.html            # Root shell
│   ├── styles/
│   │   ├── variables.css     # All CSS tokens/themes
│   │   ├── base.css          # Resets, typography, scrollbars
│   │   ├── layout.css        # 3-panel layout grid
│   │   ├── components.css    # All reusable UI components
│   │   ├── animations.css    # Transitions, motion
│   │   └── themes/
│   │       ├── light.css
│   │       └── dark.css
│   ├── js/
│   │   ├── app.js            # App bootstrap & router
│   │   ├── store.js          # Reactive in-memory state store
│   │   ├── identity.js       # Local user identity (UUID, username, avatar)
│   │   ├── network/
│   │   │   ├── discovery.js  # UDP multicast peer discovery
│   │   │   ├── socket.js     # TCP/WebSocket peer connections
│   │   │   ├── protocol.js   # Message framing & packet types
│   │   │   └── transfer.js   # File chunked transfer engine
│   │   ├── views/
│   │   │   ├── sidebar-left.js     # Panel 1: DMs, Groups, User profile strip
│   │   │   ├── sidebar-middle.js   # Panel 2: Friends tab / Groups tab
│   │   │   ├── chat-panel.js       # Panel 3: Chat window
│   │   │   └── settings-modal.js   # Settings overlay
│   │   ├── components/
│   │   │   ├── message.js          # Message bubble renderer
│   │   │   ├── file-preview.js     # File attachment previews
│   │   │   ├── emoji-picker.js     # Emoji/GIF picker
│   │   │   ├── profile-card.js     # Hover/click profile card popup
│   │   │   ├── context-menu.js     # Right-click menus
│   │   │   └── toast.js            # Notification toasts
│   │   └── utils/
│   │       ├── format.js           # Date, file size, string formatters
│   │       ├── sanitize.js         # XSS-safe rendering
│   │       ├── profanity.js        # Username/tag content checker
│   │       └── storage.js          # localStorage / electron-store wrapper
├── assets/
│   ├── icons/
│   ├── sounds/
│   └── fonts/
└── android/                  # Capacitor Android project (generated)
```

---

## 🎨 VISUAL DESIGN SYSTEM

### Design Philosophy
Modern but warm. Not futuristic — approachable. Think "Discord grew up and went to a design school with good taste." Clean spatial rhythm, generous padding, soft but purposeful shadows, subtle motion. No harsh angles, no neon cyberpunk. Feels premium but friendly.

### Typography
- **Display/Headers:** `"Outfit"` (Google Fonts) — geometric, rounded, confident
- **Body/UI:** `"DM Sans"` — humanist, readable, soft
- **Monospace (timestamps, tags):** `"JetBrains Mono"` — precise, technical

### Color Tokens — Light Mode (`light.css`)
```css
:root[data-theme="light"] {
  /* Backgrounds */
  --bg-base:        #F4F6FB;   /* Main window — slightly blue-tinted white */
  --bg-surface:     #FFFFFF;   /* Cards, modals, panels */
  --bg-sidebar:     #EDF0F8;   /* Left/middle sidebars */
  --bg-hover:       #E3E8F4;   /* Hover state */
  --bg-active:      #D8DFFE;   /* Selected/active item */

  /* Text */
  --text-primary:   #1A1D2E;
  --text-secondary: #5A6080;
  --text-muted:     #9499B0;
  --text-inverse:   #FFFFFF;

  /* Accents */
  --accent-primary: #5B7FFF;   /* Soft royal blue — buttons, links, active states */
  --accent-hover:   #4A6EEE;
  --accent-soft:    #EEF1FF;   /* Light-tinted bg for selected items */
  --accent-danger:  #F04E4E;
  --accent-success: #3BC98A;
  --accent-warning: #F5A623;

  /* Borders */
  --border-subtle:  rgba(90, 96, 128, 0.12);
  --border-strong:  rgba(90, 96, 128, 0.25);

  /* Shadows */
  --shadow-sm:      0 1px 3px rgba(30, 40, 80, 0.08);
  --shadow-md:      0 4px 16px rgba(30, 40, 80, 0.10);
  --shadow-lg:      0 8px 32px rgba(30, 40, 80, 0.14);

  /* Misc */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   16px;
  --radius-pill: 999px;
  --transition:  all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Color Tokens — Dark Mode (`dark.css`)
```css
:root[data-theme="dark"] {
  --bg-base:        #18192A;   /* Very dark navy, NOT pure black */
  --bg-surface:     #21223A;
  --bg-sidebar:     #1C1D30;
  --bg-hover:       #2A2C44;
  --bg-active:      #332B52;

  --text-primary:   #E8EAFF;
  --text-secondary: #9196B8;
  --text-muted:     #5C6080;
  --text-inverse:   #18192A;

  --accent-primary: #9B7FFF;   /* Soft lavender-purple */
  --accent-hover:   #8B6FEF;
  --accent-soft:    #2E2550;
  --accent-danger:  #FF6B6B;
  --accent-success: #4DD9A0;
  --accent-warning: #FFB547;

  --border-subtle:  rgba(155, 127, 255, 0.10);
  --border-strong:  rgba(155, 127, 255, 0.22);

  --shadow-sm:      0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md:      0 4px 16px rgba(0, 0, 0, 0.4);
  --shadow-lg:      0 8px 32px rgba(0, 0, 0, 0.5);
}
```

### User-Customizable Accent Color
In Settings > Appearance, users can pick a custom accent color. This overrides `--accent-primary` and `--accent-hover` via a CSS variable injection:
```js
document.documentElement.style.setProperty('--accent-primary', pickedColor);
```
Presets: Blue `#5B7FFF`, Purple `#9B7FFF`, Teal `#3ECFCF`, Rose `#FF6B8A`, Amber `#F5A623`

---

## 🖼️ MAIN WINDOW LAYOUT

The app uses a **CSS Grid** 3-column layout (4 zones total when settings open):

```
┌──────────┬──────────────┬────────────────────────────────────┐
│          │              │                                    │
│  Panel 1 │   Panel 2    │           Panel 3                  │
│  (Main   │  (Friends /  │         (Chat Window)              │
│  Sidebar)│   Groups)    │                                    │
│   60px   │   260px      │         flex: 1                    │
│          │              │                                    │
│──────────│              │                                    │
│  Profile │              │                                    │
│  Strip   │              │                                    │
└──────────┴──────────────┴────────────────────────────────────┘
```

```css
#app-layout {
  display: grid;
  grid-template-columns: 64px 260px 1fr;
  grid-template-rows: 100vh;
  height: 100vh;
  overflow: hidden;
}
```

Custom titlebar (frameless Electron window):
```css
#titlebar {
  -webkit-app-region: drag;
  height: 32px;
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 9999;
}
#titlebar .controls { -webkit-app-region: no-drag; }
```

---

## 📐 PANEL 1 — MAIN SIDEBAR (Left Icon Rail)

**Width:** 64px fixed, full height  
**Background:** `var(--bg-sidebar)` with a right border `var(--border-subtle)`

### Layout (top to bottom):
1. **Orbit Logo** — top, centered, 36px icon, slight glow on hover
2. **DMs Icon** — chat bubble icon, switches Panel 2 to DM list
3. **Groups Icon** — (optional shortcut, or handled in Panel 2 tabs)
4. **[YOUR SUGGESTION SLOT]** → Recommended: **"Starred Messages"** bookmark icon — tapping shows a Panel 2 list of messages the user has starred/bookmarked from any conversation. Works entirely offline/locally.
5. **Spacer (flex: 1)**
6. **Settings Icon (⚙️)** — opens Settings Modal
7. **User Avatar** — 36px circle, shows your own avatar. On click: opens your full Profile Card popup (centered modal). Shows: avatar, banner, username, usertag, bio, about me, online status selector

### User Profile Card (click on avatar):
```
┌──────────────────────────────────┐
│  [  BANNER IMAGE / GRADIENT   ]  │ ← 100px tall, editable
│  🔵 [Avatar]  Username           │
│     @usertag                     │
├──────────────────────────────────│
│  📝 Bio: "..."                   │
│  ℹ️  About Me: "..."             │
│  🟢 Online  [▼ status dropdown]  │
│  [Edit Profile]                  │
└──────────────────────────────────┘
```

---

## 📐 PANEL 2 — MIDDLE SIDEBAR (Friends / Groups)

**Width:** 260px, full height  
**Background:** `var(--bg-base)`

### Top: Global Search Bar
```html
<input type="text" id="global-search" placeholder="Search messages, people, files…" />
```
- Searches: usernames, message content, file names, group names
- Results shown as a dropdown with categories: People | Messages | Files | Groups

### Tabs: `Friends` | `Groups`

---

### Friends Tab

**Top actions:**
- `+ Add Friend` button (WiFi mode: shows invite code or username search; LAN mode: auto-discovers)

**Sections:**
- **Online Now** (green dot) — expandable
- **All Friends** — alphabetically listed
- **Pending** — incoming/outgoing requests badge

**Each friend row:**
```
[Avatar] Username           [Chat 💬] [...]
         @usertag · 🟢 Online
```
- Left-click → opens DM in Panel 3
- Right-click → context menu: View Profile | Remove Friend | Block

**Friend Request Item (Pending):**
```
[Avatar] Username wants to be friends
         [Accept ✓]  [Decline ✗]
```

---

### Groups Tab

**Top:** `+ Create Group` button → opens Create Group modal:
```
┌─────────────────────────────────┐
│   Create a Group                │
│   [Upload Icon] or default icon │
│   Group Name: [____________]    │
│   Add from friends: [search]    │
│   [ ] Friend A                  │
│   [ ] Friend B                  │
│   [Cancel]    [Create Group →]  │
└─────────────────────────────────┘
```

**Group List:**
- Each row: `[Group Icon] Group Name`  
  Under: `X members · Last message preview`
- Right-click: Invite Link | Leave Group | (if owner) Delete Group / Edit Group

**Invite Links:** Generated as a short alphanumeric code (e.g. `orbit://join/XK93B`). On LAN: auto-resolves. On WiFi: resolves via the host peer.

---

## 📐 PANEL 3 — CHAT WINDOW

### Top Bar (Chat Header)
```
[←]  [Avatar]  Username / Group Name
               🟢 Online · Last seen just now     [📞] [🎥] [🔍] [⋮]
```

For Groups:
```
[←]  [Group Icon]  Group Name
                   14 members · 3 online           [🔍] [📌] [⋮]
```

### Message Feed
Scrollable, bottom-anchored, infinite scroll upward (load older in chunks of 50).

**Message Bubble:**
```
[Avatar]  Username                        10:42 AM · May 28
          Hey! Did you get the files?
                                 [😂] [👍] [reply]  (hover actions)
```

- Own messages: right-aligned, `var(--accent-soft)` bg, no avatar shown
- Other messages: left-aligned, `var(--bg-surface)` bg, with avatar
- Consecutive messages from same sender (< 5 min gap): no repeated avatar/name, tighter spacing
- **Timestamp:** shown small, muted, under or beside the bubble. Full date shown on hover (tooltip).
- **Date Divider:** `───────── Today ─────────` as a centered label between day-boundary messages

#### Message Types:
| Type | Behavior |
|------|----------|
| Text | Rendered with link detection, basic markdown (`**bold**`, `_italic_`, `` `code` ``) |
| Image | Inline preview (click to fullscreen lightbox) |
| File | Attachment card: icon + filename + size + `[Download]` button |
| GIF | Inline autoplay loop |
| Emoji-only | Renders 2x larger |
| System | Center-aligned italic gray: "Dan created the group" |

#### Reactions:
- Hover a message → action bar appears (reply, react, more)
- Clicking 😀 opens emoji picker in reaction mode
- Reactions shown below the message as pill badges: `😂 3`, `👍 1`
- Click a reaction to toggle your own

#### Reply (Discord-style):
- Clicking reply → input bar shows reply context strip:
```
┌─────────────────────────────────────────────┐
│ ↩ Replying to Username: "Hey! Did you get…" │ [✕]
└─────────────────────────────────────────────┘
[  Type a message…                           ] [📎] [😀] [➤]
```
- Rendered message shows quoted reply header above the bubble

### Message Input Bar
```
┌────────────────────────────────────────────────────────────┐
│ [📎]  Type a message to Username…                [😀] [➤] │
└────────────────────────────────────────────────────────────┘
```
- **📎 File Attach:** Opens native file picker. Supports ALL file types. Limits: single file 500MB max, UI shows progress bar during transfer.
- **😀 Emoji Picker:** Full emoji grid + GIF search tab (uses a static GIF library or Giphy API if network available; falls back to local GIFs)
- **Enter** to send, **Shift+Enter** for newline
- Typing indicator: sends a "typing" packet to peer(s), shown as `Username is typing…` with animated dots

---

## 👤 IDENTITY SYSTEM (No Login Required)

### On First Launch:
1. Generate a UUID v4 → store in `electron-store` as `userId`
2. Read `os.hostname()` → default username
3. Generate a random 4-digit usertag (e.g. `#4829`)
4. Set status: Online

### Identity Object:
```js
{
  userId: "uuid-v4",
  username: "DanPC",             // editable
  usertag: "4829",               // editable (validated)
  bio: "",                       // editable
  aboutMe: "",                   // editable
  avatar: null,                  // base64 or file path
  banner: null,                  // base64 or file path
  status: "online",              // online | away | dnd | invisible
  createdAt: ISO_DATE_STRING
}
```

### Profile Validation Rules:
- **Username:** 2–32 characters, alphanumeric + spaces + underscores + hyphens
- **Usertag:** 4 digits only (auto-assigned, user can regenerate)
- **Bio:** max 128 characters
- **About Me:** max 512 characters, supports basic markdown
- **Avatar/Banner:** Image only (PNG/JPG/GIF), max 4MB. Cropped via canvas API. GIF avatars animate in the UI.
- **Content Check (profanity.js):** Username and bio are checked against a curated blocklist (loaded from a local JSON). Sexual or slur-containing strings are rejected with a toast notification: `"This username isn't allowed. Please choose something appropriate."`

---

## 🌐 NETWORKING ARCHITECTURE

### Mode Detection:
On launch, `network.js` scans available interfaces:
- If peers found on `224.0.0.251` multicast → **LAN Mode** (full autodiscovery, no friend requests needed)
- Else → **WiFi Mode** (manual friend requests via username#tag or room codes)

### LAN Mode — UDP Multicast Discovery (`discovery.js`)
```
Protocol: UDP multicast to 224.0.0.251:45678
Beacon interval: every 5 seconds
Beacon packet (JSON):
{
  type: "BEACON",
  userId: "...",
  username: "...",
  usertag: "...",
  avatarHash: "...",   // MD5 of avatar for cache invalidation
  status: "online",
  tcpPort: 46000       // port this peer is listening on
}
```
- Any peer that receives a BEACON adds the sender to the peers list
- TCP server starts on `tcpPort` for actual messaging
- Friend requests skipped: all LAN peers appear under "Nearby" friends list automatically

### WiFi / Same-Network Mode — WebSocket (`socket.js`)
```
Protocol: WebSocket over TCP (ws://<peer_ip>:<port>)
One host acts as a soft relay (whoever creates the group or DM first)
Friend request flow:
  1. Sender broadcasts REQUEST packet with their profile
  2. Receiver shows accept/decline prompt
  3. On accept: both store each other's IP + userId
  4. Future reconnects: try last known IP, then broadcast a FIND packet
```

### Message Protocol (`protocol.js`)
All packets are JSON-framed with a 4-byte length prefix:
```js
{
  packetId: "uuid",
  type: "MESSAGE" | "FILE_CHUNK" | "TYPING" | "READ" | "REACTION" | "SYSTEM" | "BEACON" | "REQUEST" | "ACCEPT" | "FIND" | "PING",
  from: "userId",
  to: "userId | groupId",
  timestamp: ISO_STRING,
  payload: { ... }   // type-specific data
}
```

### File Transfer (`transfer.js`)
- Files split into 64KB chunks
- Each chunk sent as `FILE_CHUNK` packet with `{fileId, chunkIndex, totalChunks, data: base64}`
- Receiver reassembles from chunks, shows progress bar
- On completion: `FILE_COMPLETE` ACK
- Temp files stored in `os.tmpdir()/orbit-transfers/`
- Completed files saved to user's `Downloads/Orbit/` folder
- 500MB per-file limit enforced in the UI picker and at the protocol layer

---

## ⚙️ SETTINGS MODAL

Triggered by the ⚙️ icon. Opens as a **full-screen overlay** with a blur backdrop.

### Layout:
```
┌──────────────────────────────────────────────────────────────┐
│  ✕  Settings                                                  │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  General     │   [Settings content here]                     │
│  Account     │                                               │
│  Appearance  │                                               │
│  Sounds      │                                               │
│  Privacy     │                                               │
│  Advanced    │                                               │
│  About Us    │                                               │
│              │                                               │
└──────────────┴───────────────────────────────────────────────┘
```
Left sidebar: 200px, items are clickable rows with icons  
Right panel: flex:1, scrollable content

---

### 1. General
- **Language:** Dropdown (English default; placeholder for future localization)
- **Launch at startup:** Toggle (Electron `app.setLoginItemSettings`)
- **Minimize to tray on close:** Toggle
- **Show unread badge on taskbar:** Toggle
- **Notifications:** Toggle + notification sound toggle
- **Message preview in notifications:** Toggle (off = hide content)
- **Spell check:** Toggle

---

### 2. Account
- Full profile editor (same as clicking your avatar):
  - Avatar upload (click to open file picker; canvas crop modal)
  - Banner upload
  - Username field + validation
  - Usertag field (4 digits) + "Regenerate" button
  - Bio (128 char limit with counter)
  - About Me (512 char, markdown-capable)
  - Status selector: 🟢 Online | 🌙 Away | ⛔ Do Not Disturb | 👻 Invisible
- **Export Data:** Exports all messages and files as a ZIP archive
- **Reset Identity:** Clears everything and regenerates a new UUID (warning dialog required)

---

### 3. Appearance
- **Theme:** Light / Dark / System toggle (3-way switch)
- **Accent Color:** 5 preset swatches + custom color picker (`<input type="color">`)
- **Font Size:** Slider 12px–18px (adjusts `--font-base` CSS variable)
- **Message Density:** Comfortable | Compact | Cozy (adjusts message padding/gap)
- **Show avatars in chat:** Toggle
- **Animated avatars (GIF):** Toggle
- **Sidebar icon labels:** Toggle (show text labels under icons in Panel 1)

---

### 4. Sounds
- **Enable sounds:** Master toggle
- **Message received:** Toggle + volume slider
- **Message sent:** Toggle
- **Friend request:** Toggle
- **User joins/leaves:** Toggle (groups)
- **File received:** Toggle
- **Custom sound pack:** File upload (ZIP of `.mp3` / `.wav` files with preset names)
- Preview button next to each sound

---

### 5. Privacy
- **Who can send you friend requests:** Everyone | Nobody (LAN mode: N/A)
- **Show online status:** Everyone | Friends only | Nobody
- **Show last seen:** Everyone | Friends only | Nobody
- **Block list:** List of blocked users with Unblock button
- **Read receipts:** Toggle (send/receive "seen" indicators)
- **Typing indicators:** Toggle

---

### 6. Advanced
- **Network Mode:** Auto-detect | Force LAN | Force WiFi
- **TCP Port:** Number input (default: 46000) — requires restart
- **Discovery Port:** Number input (default: 45678) — requires restart
- **File download location:** Path selector (default: `~/Downloads/Orbit`)
- **Max file transfer size:** Slider 50MB–500MB
- **Enable developer tools:** Toggle (opens Electron DevTools)
- **Connection log:** Live scrolling log of network events
- **Clear message cache:** Button (confirmation dialog)

---

### 7. About Us
```
      🪐  Orbit
      Version 1.0.0

      Built with Electron, HTML, CSS & JavaScript
      Peer-to-peer · Local-first · No servers

      [GitHub Repo Link]
      [Report a Bug]
      [Changelog]

      © 2025 Orbit · Open Source
```

---

## 💬 CHAT FEATURES — DETAILED SPEC

### Emoji Picker
- 8 categories: 😀 Smileys | 🐾 Animals | 🍕 Food | ⚽ Activities | 🌍 Travel | 💡 Objects | 🔣 Symbols | 🚩 Flags
- Recent emojis section at top (stored in localStorage)
- Search input
- **GIF Tab:** Grid of trending GIFs. Search box calls a local cache or Giphy/Tenor API (if online). GIFs are sent as a URL reference (if online) or as a FILE_CHUNK transfer (if local file)
- Skin tone selector (6 options)

### Reactions
- Max 20 unique reactions per message
- Same user can react once per emoji
- Hovering a reaction pill shows who reacted (`"Dan, Mila, +2 others"`)

### Message Actions (hover menu, right-click context):
- ↩️ Reply
- ✏️ Edit (own messages only, shows "edited" label, stores edit history)
- 📌 Pin (pinned messages accessible from group header pin icon)
- ⭐ Star / Unstar (adds to Starred Messages in Panel 1)
- 📋 Copy Text
- 🗑️ Delete (own messages only, shows "Message deleted" placeholder)
- 🚫 Report (opens a reason dialog — stored locally for now)

### Read Receipts
- Single gray checkmark = sent/delivered
- Double accent-colored checkmarks = seen by recipient

### Message Search (in Panel 3)
- Click 🔍 in chat header
- Panel 3 shows a search input above the message feed
- Results highlighted inline, jump-to-message on click
- Filters: From user | Has files | Has images | Date range

### Pinned Messages (groups)
- Pin icon in group header → side drawer shows all pinned messages in that group
- Only group admins/owner can pin

---

## 📁 FILE SHARING — DETAILED SPEC

### Attachment Flow:
1. User clicks 📎 or drags file into chat window
2. Pre-send preview card shown in input area:
   ```
   [📄 report_q3.pdf  ·  4.2 MB]  [✕]
   ```
3. For images: thumbnail preview shown inline
4. Clicking ➤ Send initiates chunked transfer
5. Progress bar shown in the message bubble until complete:
   ```
   [📄 report_q3.pdf]  ████████░░  78%  ·  1.2 MB/s
   ```

### File Type Icons:
| Extension | Icon |
|-----------|------|
| .pdf | 📄 red |
| .zip .rar .7z | 📦 yellow |
| .exe .msi .apk | ⚙️ gray |
| .mp3 .wav .flac | 🎵 purple |
| .mp4 .mkv .avi | 🎬 blue |
| .psd .ai .fig | 🎨 pink |
| Other | 📎 gray |

### Image Viewer (Lightbox):
- Click any image → full-screen overlay with dark backdrop
- Arrow keys / swipe to navigate between images in conversation
- Zoom in/out, drag to pan
- Download button in top-right

### File Save Location:
- Received files auto-saved to `~/Downloads/Orbit/<sender_username>/`
- User can change this in Settings > Advanced

---

## 🔔 NOTIFICATIONS

### Toast Notifications (in-app):
```
[Avatar]  Username  ·  2s ago
          "Hey, did you see this?"
```
Appears bottom-right, stacks, auto-dismisses after 5s, click to jump to conversation.

### OS Notifications (Electron `Notification` API):
- When app is not focused or minimized
- Respects "message preview" privacy setting
- Click notification → focuses window, opens that conversation

### Tray Icon:
- Shows unread count badge
- Right-click menu: Open Orbit | Set Status | Quit

---

## 📱 ANDROID (APK) BUILD — CAPACITOR

### Setup:
```bash
npm install @capacitor/core @capacitor/android
npx cap init Orbit com.orbit.app
npx cap add android
npx cap sync
npx cap open android  # Opens Android Studio
```

### capacitor.config.json:
```json
{
  "appId": "com.orbit.app",
  "appName": "Orbit",
  "webDir": "src",
  "bundledWebRuntime": false,
  "plugins": {
    "SplashScreen": {
      "launchAutoHide": true,
      "backgroundColor": "#18192A"
    }
  }
}
```

### Android-specific Considerations:
- **Discovery:** Use WiFi multicast on Android (requires `CHANGE_WIFI_MULTICAST_STATE` permission)
- **File Transfer:** Use Capacitor `Filesystem` plugin for saving received files
- **Network:** Use `@capacitor/network` to detect connection type
- **Permissions in `AndroidManifest.xml`:**
  ```xml
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
  <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE"/>
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
  ```
- **Adaptive Icon:** Supply `ic_launcher_foreground.xml` + `ic_launcher_background.xml` from the Orbit logo
- **Mobile-responsive layout:** The 3-panel layout collapses on narrow screens:
  - Default: Panel 2 shown (friend/group list)
  - Tap a friend/group → Panel 3 slides in (Panel 2 hidden)
  - Back button → returns to Panel 2
  - Panel 1 becomes a bottom navigation bar on Android

---

## 🖥️ ELECTRON DESKTOP BUILD

### package.json scripts:
```json
{
  "scripts": {
    "start":     "electron .",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  }
}
```

### electron-builder.yml:
```yaml
appId: com.orbit.desktop
productName: Orbit
directories:
  output: dist/
win:
  target: nsis
  icon: assets/icons/icon.ico
  requestedExecutionLevel: asInvoker
mac:
  target: dmg
  icon: assets/icons/icon.icns
linux:
  target: AppImage
  icon: assets/icons/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

### main.js (Electron Main Process) — Key Setup:
```js
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    frame: false,          // Custom titlebar
    transparent: false,
    backgroundColor: '#18192A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets/icons/icon.png'),
    titleBarStyle: 'hidden',
  });
  win.loadFile('src/index.html');
});
```

### preload.js (Context Bridge):
```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbitAPI', {
  send:     (channel, data)   => ipcRenderer.send(channel, data),
  on:       (channel, cb)     => ipcRenderer.on(channel, (e, data) => cb(data)),
  invoke:   (channel, data)   => ipcRenderer.invoke(channel, data),
  platform: process.platform,
  version:  app.getVersion?.() ?? '1.0.0',
});
```

---

## 🛠️ DEPENDENCIES

```json
{
  "dependencies": {
    "electron-store":    "^8.x",    // Persistent settings/identity
    "uuid":              "^9.x",    // UUID generation
    "dgram":             "built-in", // UDP multicast (Node.js)
    "net":               "built-in", // TCP server/client (Node.js)
    "ws":                "^8.x",    // WebSocket
    "sharp":             "^0.33.x", // Image resizing for avatars
    "archiver":          "^6.x",    // ZIP export
    "bad-words":         "^3.x"     // Profanity filter base (supplement with custom list)
  },
  "devDependencies": {
    "electron":          "^30.x",
    "electron-builder":  "^24.x",
    "@capacitor/core":   "^6.x",
    "@capacitor/android":"^6.x"
  }
}
```

---

## ✅ IMPLEMENTATION CHECKLIST

### Core
- [ ] Electron window (frameless, custom titlebar with min/max/close)
- [ ] Identity system (UUID, username, usertag, avatar, status)
- [ ] electron-store persistence for identity + settings + message history
- [ ] System tray icon with context menu + unread badge
- [ ] In-app toast notification system
- [ ] OS notification via Electron Notification API

### Networking
- [ ] UDP multicast discovery (LAN mode)
- [ ] TCP server per peer (message receiving)
- [ ] WebSocket client for same-WiFi connections
- [ ] Mode auto-detection
- [ ] Friend request flow (WiFi)
- [ ] Typing indicator packets
- [ ] Read receipt packets
- [ ] File chunked transfer engine (64KB chunks, progress tracking)
- [ ] File reassembly + save to Downloads/Orbit/

### UI — Layout
- [ ] 3-panel CSS Grid layout
- [ ] Panel 1: icon rail, user avatar, starred messages, settings
- [ ] Panel 2: global search bar, Friends tab, Groups tab
- [ ] Panel 3: chat header, message feed, input bar
- [ ] Settings modal (7 tabs)
- [ ] Profile card popup
- [ ] Create Group modal
- [ ] Lightbox image viewer
- [ ] Context menus (right-click)

### Messaging
- [ ] Text messages with timestamps
- [ ] Date dividers
- [ ] Consecutive message grouping
- [ ] Markdown parsing (bold, italic, inline code)
- [ ] Link detection + safe rendering
- [ ] Reply (Discord-style, with quote header)
- [ ] Edit message (with "edited" label)
- [ ] Delete message (placeholder shown)
- [ ] Star/unstar message
- [ ] Pin message (groups)
- [ ] Emoji picker (8 categories + recent + skin tones)
- [ ] GIF picker tab
- [ ] Reactions (add, toggle, hover to see who)
- [ ] Message action hover bar
- [ ] Read receipts (single/double checkmark)
- [ ] Typing indicator display
- [ ] Message search within conversation

### Files
- [ ] File attachment (drag & drop + picker)
- [ ] Pre-send preview card
- [ ] Chunked send with progress bar
- [ ] File type icons
- [ ] Image inline preview
- [ ] Image lightbox (arrow nav, zoom, download)
- [ ] Received file auto-save

### Profiles
- [ ] Edit username/usertag/bio/aboutMe
- [ ] Avatar crop + upload
- [ ] Banner upload
- [ ] Usertag regeneration
- [ ] Status selector (online/away/dnd/invisible)
- [ ] Profanity check on username/bio

### Settings
- [ ] General (startup, tray, notifications, spell check)
- [ ] Account (full profile editor + reset identity)
- [ ] Appearance (theme, accent color, font size, density)
- [ ] Sounds (master toggle, per-event, custom pack)
- [ ] Privacy (friend requests, online status, block list, read receipts)
- [ ] Advanced (ports, download path, file size limit, dev tools, connection log)
- [ ] About Us (version, links)

### Android (Capacitor)
- [ ] capacitor.config.json setup
- [ ] Responsive layout (bottom nav on mobile, slide-in Panel 3)
- [ ] WiFi multicast permissions
- [ ] Capacitor Filesystem for file saving
- [ ] Adaptive launcher icon
- [ ] Splash screen

---

## 🎯 DESIGN MICRO-DETAILS TO NAIL

1. **Message hover actions** fade in smoothly from opacity 0, slide up 4px
2. **Unread count badges** on Panel 1 icons — small red pill `font: 10px/JetBrains Mono bold`
3. **Online status dot** uses a subtle CSS animation pulse for "Online" only (not Away/DND)
4. **Typing indicator** — 3 bouncing dots animation (`@keyframes bounce`)
5. **Transition between chats** — Panel 3 content fades out (80ms) then fades in (120ms)
6. **Sidebar active state** — left accent border `3px solid var(--accent-primary)` on active DM/group row
7. **Empty state** (no messages yet) — centered illustration: orbit icon + "Say hello to Username 👋"
8. **File drag overlay** — when file dragged over window, full-window overlay appears: `"Drop to send in [Username]"` with dashed border animation
9. **Group creation success** — brief confetti burst (CSS-only, 12 particles, 0.6s)
10. **Settings modal open/close** — scales from 0.96 → 1.00 with opacity, 180ms ease-out
11. **Custom scrollbars** — 4px width, `var(--accent-soft)` track, `var(--accent-primary)` thumb, rounded
12. **Focus states** — all interactive elements have a visible `box-shadow: 0 0 0 2px var(--accent-primary)` ring (accessibility)
