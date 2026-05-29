<p align="center">
  <img src="src/icons/app/orbit_256.png" alt="Orbit" width="128">
</p>

<h1 align="center">Orbit</h1>

<p align="center">
  Peer-to-peer chat for your local network — messages, files, and images without a central server.
</p>

<p align="center">
  <strong>Current version:</strong> <a href="CHANGELOG.md#v002-beta-current-version">v0.0.2-beta</a>
</p>

## Quick Start

### Download (recommended)

Pre-built Windows installers are published on [GitHub Releases](https://github.com/D4niel-dev/Orbit-v.0.0.1-beta/releases).

| Release | Notes |
|---------|--------|
| [Latest](https://github.com/D4niel-dev/Orbit-v.0.0.1-beta/releases/latest) | Most recent build |
| [v0.0.2-beta](https://github.com/D4niel-dev/Orbit-v.0.0.1-beta/releases/tag/v0.0.2-beta) | SQLite storage, privacy mode, large file transfers |
| [v0.0.1-beta](https://github.com/D4niel-dev/Orbit-v.0.0.1-beta/releases/tag/v0.0.1-beta) | Original release |

> Windows may show SmartScreen for unsigned builds. Choose **More info → Run anyway** if you trust the source.

### Run from source

**Requirements:** [Node.js](https://nodejs.org/) 18+ (LTS recommended), npm, Windows/macOS/Linux for development.

```bash
git clone https://github.com/D4niel-dev/Orbit-beta.git
cd Orbit-beta-main
npm install
npm start
```

Peers on the same LAN are discovered automatically. Open Orbit on another machine to start chatting.

## Features

- **P2P messaging** — Direct socket-based chat on your local network
- **File & image sharing** — Send attachments peer-to-peer (up to **250 MB** in v0.0.2+)
- **Auto-discovery** — Find other Orbit clients on the LAN without manual IP entry
- **Profiles & themes** — Custom display name, avatar, and light/dark UI
- **Persistent storage** *(v0.0.2+)* — Messages and media archived in SQLite (`better-sqlite3`)
- **Privacy mode** *(v0.0.2+)* — Optional session-only attachment storage
- **Integrity checks** *(v0.0.2+)* — SHA-256 validation on file transfers
- **Gallery** — Browse shared images with WebP thumbnails for fast scrolling
- **System tray** — Minimize to tray instead of quitting

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## How it works

Orbit uses a classic Electron split:

| Layer | Role |
|-------|------|
| **Main** (`main.js`) | Discovery, sockets, transfers, SQLite, custom `orbit-db://` / `orbit-file://` protocols |
| **Preload** (`preload.js`) | Safe bridge between UI and main process |
| **Renderer** (`src/`) | HTML/CSS/JS chat UI |

```
Orbit Beta/
├── main.js                 # Electron main process
├── preload.js              # Context-isolated IPC bridge
├── electron-builder.yml    # Windows/macOS/Linux packaging
├── src/
│   ├── index.html          # App shell
│   ├── js/                 # UI, network, database
│   ├── styles/             # Themes and layout
│   └── icons/              # App icons
├── android/                # Capacitor Android shell (experimental)
└── CHANGELOG.md
```

## Configuration

Orbit stores settings and the database under your OS user data directory (Electron `userData`). There is no `.env` required for normal use.

Notable settings (in-app **Settings**):

| Setting | Description |
|---------|-------------|
| **Attachment storage** | Persistent (default) or privacy mode (temp files cleared on exit) |
| **Clear saved attachments** | Remove attachment BLOBs from the database |
| **Theme / profile** | Display name, avatar, light or dark theme |

## Development

| Command | Description |
|---------|-------------|
| `npm start` | Launch Electron in development |
| `npm run build:win` | Build Windows installer (output in `dist/`) |

Build configuration lives in [electron-builder.yml](electron-builder.yml). Built artifacts (`dist/`, `release/`) are gitignored — attach them to [GitHub Releases](https://github.com/D4niel-dev/Orbit-v.0.0.1-beta/releases) instead of committing binaries.

### Building for Windows

```bash
npm install
npm run build:win
```

The NSIS installer and `.exe` are written to `dist/`.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Commit your changes and open a pull request

Bug reports and feature ideas are welcome via [GitHub Issues](https://github.com/D4niel-dev/Orbit-v.0.0.1-beta/issues).

## License

[MIT](LICENSE) — see [LICENSE](LICENSE) for the full text.

---

<p align="center">
  <strong>Orbit Team</strong> · P2P chat without the cloud
</p>
