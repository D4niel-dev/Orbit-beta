<p align="center">
  <img src="src/icons/app/orbit_1024.png" alt="Orbit" width="128">
</p>

<h1 align="center">Orbit</h1>

<p align="center">
  Modern chat without mandatory cloud infrastructure.<br>
  Built for local-first communication on your LAN.
</p>

<p align="center">
  Peer-to-peer messaging, files, and images — no central server required.
</p>

<p align="center">
  <strong>Current version:</strong> <a href="CHANGELOG.md#v006-beta-current-version">v0.0.6-beta</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D6?style=flat-square&logo=electron&logoColor=white" alt="Platform: Windows | macOS | Linux">
  <img src="https://img.shields.io/badge/Electron-32-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 32">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License: MIT">
  <img src="https://img.shields.io/badge/status-beta-orange?style=flat-square" alt="Status: Beta">
</p>

## Preview

<p align="center">
  <img src="src/icons/screenshots/preview-darkmode.png" alt="Orbit dark mode" width="720"><br>
  <em>Dark mode</em>
</p>

<p align="center">
  <img src="src/icons/screenshots/preview-lightmode.png" alt="Orbit light mode" width="720"><br>
  <em>Light mode</em>
</p>

<p align="center">
  <img src="src/icons/screenshots/preview-settings-dark.png" alt="Orbit settings (dark)" width="360">
  <img src="src/icons/screenshots/preview-settings-light.png" alt="Orbit settings (light)" width="360"><br>
  <em>Settings</em>
</p>

<p align="center">
  <img src="src/icons/screenshots/preview-gallery-dark.png" alt="Orbit gallery (dark)" width="360">
  <img src="src/icons/screenshots/preview-gallery-light.png" alt="Orbit gallery (light)" width="360"><br>
  <em>Gallery &amp; file sharing</em>
</p>

<p align="center">
  <img src="src/icons/screenshots/preview-group-dark.png" alt="Orbit group chat (dark)" width="360">
  <img src="src/icons/screenshots/preview-group-light.png" alt="Orbit group chat (light)" width="360"><br>
  <em>Group chat</em>
</p>

## Why Orbit?

Orbit exists for people who want **real-time communication without handing their conversations to a cloud vendor**.

Whether you are sharing files at home, coordinating in a small office, or experimenting with local-first software as a developer, Orbit keeps traffic **on your network** — peer-to-peer, discoverable, and under your control.

| Principle | What it means |
|-----------|----------------|
| **Local-first** | Messages and media stay on devices you own, not a remote account you rent. |
| **Peer-to-peer** | Clients talk directly over LAN sockets — no mandatory relay or signup server. |
| **LAN-first** | Auto-discovery finds nearby Orbit clients on the same network. |
| **No cloud lock-in** | No required SaaS backend, no vendor account, no subscription gate. |
| **Open & approachable** | MIT-licensed, readable stack (Electron + SQLite), built for transparency. |

Orbit is a **beta-stage desktop app** aimed at trusted private networks — not a replacement for hardened internet-scale messengers yet, but a serious step toward practical local messaging.

## Features
<details>
<summary>v0.0.1-beta</summary>

- **P2P messaging** — Direct socket-based chat on your local network
- **File & image sharing** — Send attachments peer-to-peer (configurable limit, default **500 MB**)
- **Auto-discovery** — Find other Orbit clients on the LAN without manual IP entry
- **Profiles & themes** — Custom display name, avatar, light/dark/system UI
- **Gallery** — Browse shared images with WebP thumbnails for fast scrolling
- **System tray** — Minimize to tray instead of quitting
</details>
<details>
<summary>v0.0.2-beta</summary>

- **Persistent storage** — Messages and media archived in SQLite (`better-sqlite3`)
- **Privacy mode** — Optional session-only attachment storage
- **Integrity checks** — SHA-256 validation on file transfers
</details>
<details>
<summary>v0.0.3-beta</summary>

- **Group chat** — Multi-peer group messaging with member management, roles (Owner/Admin/Member), avatars, and invite codes
- **Message reactions** — Emoji reactions on messages
- **Markdown formatting** — Rich message formatting with headings, lists, code blocks, and more
- **Drag-and-drop uploads** — Drop files and images directly into the chat panel
- **Notification sounds** — Web Audio notification chime with per-user mute settings
- **Profile sidebar** — Click any avatar to view a detailed profile panel
</details>
<details>
<summary>v0.0.4-beta</summary>

- See [CHANGELOG.md](CHANGELOG.md#v004-beta), section 4
</details>
<details>
<summary>v0.0.5-beta (Stable)</summary>

- **End-to-end encryption** — ECDH key exchange + AES-256-GCM message encryption for DMs. Toggle in Settings → Data Manager.
- **Backup & Restore** — Export/import full database as .orzip or .zip archives
- **Unread Badges & Read Receipts** — Per-chat unread counts, @mention badges, and read indicators
- **Activity Center** — Unified view of recent messages across all chats
- **Customizable Sidebar** — Show/hide Activity Center, Gallery, and Storage buttons in the left sidebar
</details>
<details>
<summary>v0.0.6-beta</summary>

- **Custom Themes** — True Dark, Dark Purple, Midnight, Sunset, Nord, Seasonal auto-rotating themes
- **Custom Colors** — Live preview color editor for all UI categories
- **Profile Frames** *(experimental)* — 12 decorative frame overlays on avatars
- **Animated Avatars** *(experimental)* — Subtle pulse animation on avatars
- **Message Translate** *(experimental)* — Translate messages via MyMemory API
- **Compact Spacing** *(experimental)* — Tighter message layout option
- **App Zoom** — Zoom slider with preview and restart notification
- **Chat Settings** — Enter to Send, Show Avatars, Image Preview toggles
</details>

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## Quick Start

### Download (recommended)

Pre-built Windows installers are published on [GitHub Releases](https://github.com/D4niel-dev/Orbit-beta/releases).

| Release | Platform | Notes |
|---------|----------|--------|
| [Latest](https://github.com/D4niel-dev/Orbit-beta/releases/latest) | Win / Mac / Linux | Most recent build |
| [v0.0.2-beta](https://github.com/D4niel-dev/Orbit-beta/releases/tag/v0.0.2-beta) | Windows | SQLite storage, privacy mode, large file transfers |
| [v0.0.1-beta](https://github.com/D4niel-dev/Orbit-beta/releases/tag/v0.0.1-beta) | Windows | Original release |

> Windows may show SmartScreen for unsigned builds. Choose **More info → Run anyway** if you trust the source.
> macOS users may need to right-click → **Open** on first launch for unsigned apps.

### Run from source

**Requirements:** [Node.js](https://nodejs.org/) 18+ (LTS recommended), npm.

```bash
git clone https://github.com/D4niel-dev/Orbit-beta.git
cd Orbit-beta-main
npm install  # Installs the app modules
npm start    # Start the app (might take a few seconds)
```

Peers on the same LAN are discovered automatically. Open Orbit on another machine to start chatting.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | [Electron](https://www.electronjs.org/) 32 |
| Runtime | [Node.js](https://nodejs.org/) |
| UI | HTML, CSS, JavaScript |
| Storage | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Networking | Raw TCP P2P sockets, LAN multicast discovery |
| Media | [sharp](https://sharp.pixelplumbing.com/) (WebP thumbnails) |
| Packaging | [electron-builder](https://www.electron.build/) (Windows NSIS, macOS DMG, Linux AppImage/deb) |
| Mobile *(experimental)* | [Capacitor](https://capacitorjs.com/) Android shell |

## How it works

Orbit follows the standard Electron process model with strict context isolation:

| Layer | Role |
|-------|------|
| **Main process** (`main.js`) | Owns network discovery, TCP sockets, chunked file transfers, SQLite persistence, system tray, and custom protocol handlers. |
| **Preload** (`preload.js`) | Exposes a minimal, typed IPC surface to the renderer via `contextBridge` — no direct Node access in the UI. |
| **Renderer** (`src/`) | HTML/CSS/JS chat interface; all privileged work is delegated to the main process. |

Security defaults: `nodeIntegration: false`, `contextIsolation: true`.

```
Orbit-beta/
├── main.js                 # Electron main process
├── preload.js              # Context-isolated IPC bridge
├── electron-builder.yml    # Windows/macOS/Linux packaging
├── src/
│   ├── index.html          # App shell
│   ├── js/                 # UI, network, database
│   ├── styles/             # Themes and layout
│   └── icons/              # App icons & screenshots
├── android/                # Capacitor Android shell (experimental)
└── CHANGELOG.md
```

### Custom protocols

Orbit serves local resources through privileged custom schemes instead of exposing raw filesystem paths to the renderer:

| Protocol | Purpose |
|----------|---------|
| `orbit-db://` | Serves attachment BLOBs and thumbnails from SQLite through the main process — stable URLs that survive app restarts. |
| `orbit-file://` | Serves ephemeral files (e.g. privacy-mode temp storage or in-flight transfers) without granting the UI direct disk access. |

This keeps the renderer sandboxed while still allowing rich media in chat and the gallery sidebar.

## Configuration

Orbit stores settings and the database under your OS user data directory (Electron `userData`). There is no `.env` required for normal use.

Notable settings (in-app **Settings**):

| Setting | Description |
|---------|-------------|
| **Attachment storage** | Persistent (default) or privacy mode (temp files cleared on exit) |
| **Clear saved attachments** | Remove attachment BLOBs from the database |
| **Theme / profile** | Display name, avatar, light or dark theme |
| **Sidebar buttons** | Choose which buttons appear in the left sidebar (Appearance → Text & Layout) |

## Security

Orbit is designed for **trusted private networks** — home LANs, lab environments, or small teams on the same subnet.

- **Not for public internet exposure** — There is no hardened perimeter model for routing Orbit across the open internet yet. Do not port-forward or expose Orbit directly to untrusted networks.
- **Evolving hardening** — Context isolation, protocol handlers, transfer checksums, and E2EE (ECDH + AES-256-GCM) are in place; broader security work is ongoing.

Use Orbit where you would trust other devices on the same network.

## Known Limitations

Transparency matters in beta. Current constraints include:

| Limitation | Details |
|------------|---------|
| **LAN-focused** | Peers must be reachable on the local network. NAT traversal is not implemented. |
| **Unstable Wi-Fi** | Large transfers and discovery can degrade on flaky wireless links. |
| **Group E2EE** | End-to-end encryption currently works for direct messages only. Group E2EE is planned. |
| **Privacy mode bugs** | Privacy mode is intended to store sent/received attachments in a `temp/` folder and purge them on exit, but images and files may fail to load reliably in this mode today. |
| **Mobile experimental** | The Capacitor Android shell is early-stage and not a supported release target yet. |
| **Unsigned builds** | Installers are not code-signed; Windows SmartScreen warnings are expected. |

## Roadmap

### Recently Shipped

<details>
<summary>Recently</summary>

- **End-to-end encryption (E2EE)** — ECDH + AES-256-GCM for direct messages
- **Backup & Restore** — Full database export/import (.orzip / .zip)
- **Database Health & Repair** — Integrity checks, VACUUM, REINDEX
- **Group Admin Roles** — Promote/demote members, admin-level controls
- **Unread Badges & Mentions** — Per-chat unread counts, @mention badges
- **Read Receipts** — See when your messages have been read
- **Per-chat Mute** — Mute/unmute notifications per DM or group
- **Edit Message Sync** — Message edits broadcast to all peers
- **Message Search v2** — Relevance ranking, sender/date filters
- **Network Dashboard** — Live peer stats in Settings
- **Keyboard Shortcuts** — Ctrl+K search, Ctrl+Shift+M mute, / focus input
- **Transfer Resilience** — Retry with backoff, cancellation, disk checks
- **Data Manager** — Privacy mode, auto-delete, clear attachments
- **Activity Center** — Unified recent messages modal with sender avatars and attachment icons
- **Customizable Sidebar** — Show/hide sidebar buttons in Appearance settings
- **Persistent Sidebar Width** — Saved sidebar width restored on startup
- **macOS / Linux builds** — Cross-platform packaging via GitHub Actions CI/CD
- **Custom Themes** — True Dark, Dark Purple, Midnight, Sunset, Nord, Seasonal auto-rotate
- **Custom Colors** — Live preview color editor for all UI categories
- **Profile Frames** — 12 decorative frame overlays on avatars (experimental)
- **Animated Avatars** — Subtle pulse animation (experimental)
- **Message Translate** — Translate messages via MyMemory API (experimental)
- **Compact Spacing** — Tighter message layout option (experimental)
- **App Zoom** — Slider with preview UI and restart notification
- **Chat Settings** — Enter to Send, Show Avatars, Image Preview toggles
- **Orbit Echo Bot** — Persistent echo bot account for testing messages
</details>

### Planned

- **Group E2EE** — Extend encryption to group chats
- **Resumable file transfers** — Pause and resume across sessions
- **Media compression & thumbnailing** — Smarter image/video handling
- **Voice messages** — Record and send voice clips
- **Message threads** — Reply chains and threaded conversations
- **Custom notification sounds** — Per-chat and per-contact sound profiles
- **Message effects & rich embeds** — Link previews, inline media, text formatting toolbar

### Experimental

- **WebRTC fallback** — Partial connectivity path for difficult network conditions
- **Capacitor Android client** — Mobile companion app
- **WebRTC-based NAT traversal** — Connect across subnets
- **Plugin system** — Community extensions API**

> Roadmap items are intentions, not commitments. See [GitHub Issues](https://github.com/D4niel-dev/Orbit-beta/issues) for tracking and discussion.

## Development

| Command | Description |
|---------|-------------|
| `npm start` | Launch Electron in development |
| `npm run build:win` | Build Windows installer (`.exe`) |
| `npm run build:mac` | Build macOS disk image (`.dmg`) |
| `npm run build:linux` | Build Linux packages (`.AppImage`, `.deb`) |
| `npm run build:all` | Build for all platforms (requires macOS host for `.dmg`) |

Build configuration lives in [electron-builder.yml](electron-builder.yml). Built artifacts (`dist/`, `release/`) are gitignored — attach them to [GitHub Releases](https://github.com/D4niel-dev/Orbit-beta/releases) instead of committing binaries.

### Building

```bash
npm install

# Platform-specific
npm run build:win     # → dist/*.exe
npm run build:mac     # → dist/*.dmg  (requires macOS host)
npm run build:linux   # → dist/*.AppImage, dist/*.deb
```

> **Note:** macOS `.dmg` can only be built on a macOS machine (or via CI). Windows and Linux can be cross-compiled from any OS. The GitHub Actions workflow handles all three automatically on tag push.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Commit your changes and open a pull request

Bug reports and feature ideas are welcome via [GitHub Issues](https://github.com/D4niel-dev/Orbit-beta/issues).

## License

[MIT](LICENSE) — Copyright (c) 2026 [D4niel-dev](https://github.com/D4niel-dev) & Orbit Team. See [LICENSE](LICENSE) for the full text.

---

<p align="center">
  <strong>Orbit Team</strong> · Lead developer <a href="https://github.com/D4niel-dev">D4niel-dev</a><br>
  P2P chat without the cloud
</p>
