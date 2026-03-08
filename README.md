# MAC — Multi-Agent Collegium

A lightweight desktop tool for academic researchers to run multi-agent AI discussions. Simulate peer review, brainstorm research ideas, rehearse Q&A sessions, and plan revisions — powered by a real multi-agent orchestration engine with selective context, inter-agent referencing, and literature search.

## Download & Install

Go to the [Releases](../../releases) page and download the installer for your platform:

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `MAC_x.x.x_aarch64.dmg` | M1/M2/M3/M4 Macs |
| macOS (Intel) | `MAC_x.x.x_x64.dmg` | Older Intel Macs |
| Windows | `MAC_x.x.x_x64-setup.exe` | Windows 10/11 |

### macOS — First Launch

The app is not signed with an Apple Developer certificate, so macOS will block it on first launch. Open Terminal and run:

```
xattr -cr /Applications/MAC.app
```

Then double-click to open normally.

### Windows — First Launch

Windows SmartScreen may show a warning. Click **"More info"** → **"Run anyway"**.

## Features

### Multi-Agent Discussion Engine

Not a simple for-loop — MAC uses a real orchestration engine:

- **Selective context** — each agent gets a tailored prompt instead of the full history dump, saving tokens and improving focus
- **Inter-agent referencing** — agents are instructed to engage with each other's specific points by name ("As Reviewer 1 noted...", "I disagree with Strategist's point about...")
- **arXiv literature search** — agents can autonomously search arXiv for papers to support their arguments (toggleable)
- **Convergence assessment** — after discussion ends, an automatic structured evaluation of consensus points, disagreements, and open questions

### 4 Preset Scenarios

| Scenario | Agents | Use Case |
|----------|--------|----------|
| **Paper Review** | Reviewer 1, Reviewer 2, Associate Editor | Simulate top-journal peer review |
| **Research Brainstorm** | Visionary, Strategist, Validator | Develop and refine research ideas |
| **Student Q&A** | Undergrad, PhD Peer, Professor | Rehearse seminar or defense questions |
| **Revision Coach** | Diagnostician, Strategist, Response Crafter | Plan revisions and draft response letters |

All presets are fully editable. You can also create custom scenarios from scratch.

### Per-Agent Configuration

Each agent can be independently configured:
- **Provider**: Anthropic, OpenAI, or Google
- **Model**: Latest models including Claude Sonnet/Opus 4.6, GPT-5.4/5 Mini, Gemini 3.1 Pro/3 Flash
- **Temperature**: 0.0 – 1.0
- **Max output tokens**: 512 – 16k

### Continuous Conversation

Discussions are not one-shot. After a round completes, you can ask follow-up questions and all agents respond based on the full history.

### Data Management

- **Auto-save** — every message is automatically saved as it's generated; no data loss on crash or close
- **History** — browse, search, sort, and reload past discussions
- **Full-text search** — search across all saved discussions by content
- **Config templates** — save and reuse agent configurations across discussions
- **Export** — download discussions as JSON (structured) or Markdown (readable)
- **Storage limits** — up to 50 saved sessions with usage indicators

### Other

- **File upload** — drag & drop PDF, TXT, MD files for agents to analyze
- **AI summary** — automatic structured summary after each discussion (key conclusions, disagreements, action items)
- **Token & cost tracking** — real-time per-message and total token count with cost estimation
- **Per-message actions** — copy or regenerate any individual agent response
- **Bilingual UI** — Chinese / English interface and output language

## API Keys

You need at least one API key from:
- [Anthropic](https://console.anthropic.com/) — for Claude models
- [OpenAI](https://platform.openai.com/) — for GPT models
- [Google AI Studio](https://aistudio.google.com/) — for Gemini models

Keys are stored locally on your machine and are never sent anywhere except directly to the respective API endpoints. Keys persist across app updates.

## Upgrading

When you install a new version, all your data is automatically preserved:
- API keys
- Saved discussions
- Config templates
- Language preference

Data is stored at a fixed OS location:
- macOS: `~/Library/Application Support/com.mac.collegium/`
- Windows: `%APPDATA%/com.mac.collegium/`

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/)

### Steps

```bash
git clone https://github.com/YOUR_USER/Multi-Agent-Collegium.git
cd Multi-Agent-Collegium
npm install
npm run tauri dev       # development mode
npm run tauri build     # production build
```

## License

MIT
