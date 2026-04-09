# Ghostty Chrome

![Ghostty Chrome](screenshot.png)

Your terminal, in Chrome tabs — with read-only session sharing over the internet.

> **Why?** Chrome is the best tab manager ever built — pinning, tab grouping, split panes, Ctrl+Shift+T to reopen, bookmarks, cross-device sync. Your terminals get all of that for free. No need to reinvent tab management or split views — Chrome already does it better than any terminal app.

> **Status**: The current MVP uses xterm.js to prove the concept works. The end goal is to compile [libghostty](https://github.com/ghostty-org/ghostty) (Zig) to WebAssembly — same VT parser, same rendering fidelity, running natively in the browser. xterm.js is the scaffolding, not the destination.

## Live session sharing

The killer feature. Share a read-only view of your terminal with anyone, anywhere — they just open a URL.

**Use cases:**
- Watch a colleague work with Claude Code, Codex, or any AI agent in real time
- Monitor a long-running agent session from your phone while away from your desk
- Pair-debug without screen sharing lag — the viewer sees raw terminal output, not compressed video
- Live demo a CLI tool to your team without everyone SSHing into the same box
- Onboard new devs by letting them watch how you navigate a codebase

**How it works:**
1. Run `./start.sh share` — starts the backend + a Cloudflare tunnel (free, zero config)
2. Open a terminal tab, do your thing
3. Click **share** in the status bar → a read-only URL is copied to your clipboard
4. Send that URL to anyone — they open it in their browser, no install needed

**Security model:** the shared URL contains a scoped guest token (HMAC-derived, tied to that one session). Guests cannot create new sessions, cannot type, cannot see other sessions. The owner's master token is never exposed. Read-only is enforced server-side — even crafted WebSocket messages are dropped.

## How it works

```
Chrome Tab ←→ Extension (xterm.js + WebGL) ←→ WebSocket ←→ Backend (Node) ←→ PTY (/bin/zsh)
Chrome Tab ←→ Extension (xterm.js + WebGL) ←→ WebSocket ↗
Guest (any browser) ←→ Cloudflare Tunnel ←→ Backend (read-only) ↗
```

- **Backend**: Node.js server that spawns real shell processes via PTY, bridges I/O over WebSocket
- **Extension**: Chrome Manifest V3 extension with xterm.js rendering on a `<canvas>` (WebGL)
- **Sessions persist**: close a tab, the shell keeps running server-side — reopen and you're back where you left off
- **Ghostty theming**: reads your Ghostty config for colors and font
- **Tunnel sharing**: Cloudflare quick tunnel exposes the backend — guests get a web terminal, zero install

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/sderosiaux/ghostty-chrome.git
cd ghostty-chrome
npm install
cd backend && npm install && cd ..
cd extension && npm install && node build.js && cd ..

# 2. Start the backend
./start.sh          # local only
./start.sh share    # local + Cloudflare tunnel for sharing

# 3. Load the extension
# chrome://extensions → Developer mode → Load unpacked → select ./extension/
# Click the extension icon → new terminal tab → paste the token when prompted
```

## Features

- **Each tab = a terminal** with its own shell process
- **Session persistence** — sessions survive tab close for 24h, reconnect via Ctrl+Shift+T or bookmarks
- **Read-only sharing** — one click to share a live terminal view over the internet
- **WebGL rendering** — same engine as VS Code's terminal, GPU-accelerated
- **Ghostty config** — auto-imports your font, colors, and size
- **Scoped auth** — owner token for local use, HMAC guest tokens for sharing
- **Scrollback** — 10K lines client-side, 50K chunks server-side for replay on reconnect

## Bookmark your terminals

Each terminal tab has a unique URL hash (`terminal.html#a1b2c3d4`). Bookmark it — reopening the bookmark reconnects to the same session. If the session expired, you get a fresh shell at the same URL.

## App mode (full keybindings)

Chrome captures some shortcuts (Ctrl+W, Ctrl+T). To get full terminal keybindings:

```bash
open -na 'Google Chrome' --args --app='chrome-extension://<EXTENSION_ID>/terminal.html'
```

## Architecture

```
ghostty-chrome/
├── backend/
│   ├── server.js          # WebSocket + PTY multiplexer + static file server
│   └── config-parser.js   # Reads Ghostty config for theming
├── extension/
│   ├── manifest.json      # Chrome Extension Manifest V3
│   ├── background.js      # Service worker — opens new tabs
│   ├── terminal-src.js    # xterm.js setup, WebSocket client, session management
│   ├── terminal.html/css  # Terminal page (also served to web guests)
│   └── build.js           # esbuild bundler
├── eslint.config.js       # Strict ESLint (30+ rules)
├── start.sh               # Launcher (start | share | stop | token)
└── .husky/pre-commit      # ESLint + shellcheck on every commit
```

## Security

| Concern | How it's handled |
|---|---|
| Guest read-only | Server-enforced: `readonly = isGuest`, input messages silently dropped |
| Guest cannot create sessions | Guest token only works with `?session=` param; `type: "new"` → rejected |
| Guest cannot guess sessions | Session IDs are `randomBytes(8)`, guest token is HMAC-scoped to one session |
| Owner token never shared | Share URLs contain only `HMAC(ownerToken, sessionId)`, not the master token |
| No token in PTY env | `GHOSTTY_TOKEN` stripped from `process.env` before shell spawn |
| WebSocket limits | `maxPayload: 64KB`, CORS restricted to extension + tunnel origins |

## Session lifecycle

| Event | What happens |
|---|---|
| New tab | Backend spawns a new PTY + zsh process |
| Tab closed | PTY stays alive server-side |
| Tab reopened (Ctrl+Shift+T / bookmark) | Reconnects to existing session, replays scrollback |
| Guest opens share URL | Attaches read-only to existing session, sees live output |
| 24h idle with no client | Session cleaned up |
| `exit` in terminal | PTY dies immediately |
| Backend killed (Ctrl+C) | All sessions lost |

## Performance

| | Ghostty native | Chrome (xterm.js WebGL) |
|---|---|---|
| Input latency | ~2ms | ~5-8ms |
| Scroll (large output) | GPU direct | ~2-4ms/frame |
| Memory per tab | ~15MB | ~40-60MB |
| Typing / vim / htop | Imperceptible difference | Imperceptible difference |

## Roadmap

**Phase 1 — MVP (current)**
- [x] xterm.js + WebGL proof of concept
- [x] Session persistence and reconnection
- [x] Ghostty config import (font, colors)
- [x] Read-only session sharing via Cloudflare tunnel
- [x] Scoped guest tokens (HMAC, per-session)
- [ ] Session picker page (list/attach to running sessions — backend API already exists)
- [ ] launchd daemon for backend auto-start
- [ ] Catppuccin/custom theme file support

**Phase 2 — libghostty WASM**
- [ ] Compile libghostty VT parser (Zig → wasm32) and swap out xterm.js parser
- [ ] Exact Ghostty terminal emulation in the browser

**Phase 3 — native rendering**
- [ ] WebGPU renderer matching Ghostty's GPU pipeline
- [ ] Font shaping via harfbuzz-wasm

## License

MIT
