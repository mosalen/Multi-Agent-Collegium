# MAC — Multi-Agent Collegium

A lightweight desktop tool for academic researchers to run multi-agent AI discussions. Simulate peer review, brainstorm research ideas, rehearse Q&A sessions, and plan revisions — all with customizable AI agents from multiple providers.

## Features

- **4 preset scenarios**: Paper Review, Research Brainstorm, Student Q&A, Revision Coach
- **Fully customizable agents**: Add/remove agents, edit roles, choose provider/model/temperature/max output per agent
- **Multi-provider support**: Anthropic (Claude), OpenAI (GPT), Google (Gemini) — latest models
- **Continuous chat**: Follow-up questions after each discussion round
- **Auto-save**: Every message is automatically persisted to local JSON files
- **AI-generated summaries**: Key conclusions, disagreements, and action items
- **Token & cost tracking**: Real-time token count and cost estimation per message
- **File upload**: Drag & drop PDF/TXT/MD files for analysis
- **Export**: Download discussions as JSON or Markdown
- **Config templates**: Save and reuse agent configurations
- **History management**: Search, sort, and browse past discussions
- **Full-text search**: Search across all saved discussions
- **Bilingual UI**: Chinese / English

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) (for Tauri build)

### Development

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run tauri:dev
```

### Build for Production

```bash
# Build the desktop app
npm run tauri:build
```

The built app will be in `src-tauri/target/release/bundle/`.

### GitHub Release

Tag a version to trigger the CI/CD pipeline:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This will build for macOS (Intel + Apple Silicon) and Windows, then create a draft GitHub Release with all installers.

## Architecture

```
mac-app/
├── src/                    # React frontend
│   ├── main.jsx           # Entry point
│   ├── App.jsx            # Main application component
│   ├── config.js          # Constants, providers, i18n, presets
│   ├── api.js             # API call functions (Anthropic/OpenAI/Google)
│   ├── storage.js         # Storage abstraction (Tauri FS / localStorage)
│   └── styles.css         # Global styles
├── src-tauri/             # Tauri (Rust) backend
│   ├── src/main.rs        # Rust backend — file-based JSON storage
│   ├── tauri.conf.json    # Window config, CSP, bundling
│   └── Cargo.toml         # Rust dependencies
├── index.html             # HTML shell
├── vite.config.js         # Vite bundler config
└── package.json           # Node dependencies & scripts
```

**Storage**: All data is stored as JSON files in the OS-specific app data directory:
- macOS: `~/Library/Application Support/com.mac.collegium/`
- Windows: `%APPDATA%/com.mac.collegium/`

No database required. Files are human-readable and can be manually backed up.

## API Keys

API keys are entered in the app's Settings panel and **persisted locally** across app restarts and version upgrades. They are stored alongside session data in the app data directory and are never transmitted anywhere except directly to the respective API endpoints.

## Upgrading

When you install a new version of MAC, all your data is automatically preserved:
- **API keys** — stored in the app data directory, survive upgrades
- **Saved sessions** — all discussion history and messages are kept
- **Config templates** — your saved agent configurations carry over
- **Language preference** — remembered across sessions

Data is stored at a fixed OS location tied to the app identifier (`com.mac.collegium`), so as long as you don't uninstall the app or manually delete the data directory, everything persists.

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/)

### Steps

```bash
git clone https://github.com/YOUR_USER/mac-collegium.git
cd mac-collegium
npm install
npm run tauri:build
```

The installer will be in `src-tauri/target/release/bundle/`:
- macOS: `.dmg` file
- Windows: `.msi` or `.exe` installer

### GitHub Release via CI

Push a version tag to trigger automated builds:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This builds for macOS (Intel + Apple Silicon) and Windows, then creates a draft GitHub Release.
-e 
## License

MIT
