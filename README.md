# Twitch Terminal

![Twitch Terminal](screenshot.png)

Stream your terminal. Watch AI agents work. Like Twitch, for shells.

> One click to broadcast a read-only view of your terminal to anyone with a browser. No install, no screen share, no lag. They see exactly what you see — raw terminal output over WebSocket.

## Why

You're running Claude Code, Codex, or Aider. Your colleague wants to watch. Screen sharing compresses everything into blurry video at 2fps. Instead: click **share**, send the URL, they open it and see your terminal live — crisp text, zero lag, read-only by default.

Or you kick off a long agent session, leave your desk. Pull out your phone, open the URL, monitor it from anywhere.

**Use cases:**
- Watch how someone works with AI agents in real time
- Monitor long-running agent sessions remotely
- Pair-debug without screen sharing — raw terminal, not compressed video
- Live demo a CLI tool without everyone SSHing in
- Onboard devs by streaming how you navigate a codebase

## Quick start

```bash
git clone https://github.com/sderosiaux/twitch-terminal.git
cd twitch-terminal
npm install && cd backend && npm install && cd ../extension && npm install && node build.js && cd ..

# Local only
./start.sh

# With sharing (Cloudflare tunnel, free)
./start.sh share
```

Then load the extension: `chrome://extensions` → Developer mode → Load unpacked → `./extension/`

## How sharing works

```
You (Chrome extension) ←→ WebSocket ←→ Backend (Node + PTY)
                                            ↑
Viewer (any browser) ←→ Cloudflare Tunnel ──┘ (read-only)
```

1. `./start.sh share` — starts backend + Cloudflare tunnel
2. Open a terminal tab, work normally
3. Click **share** in the status bar → read-only URL copied to clipboard
4. Send URL to anyone → they open it, see your terminal live, can't type

The URL contains a scoped guest token (HMAC-derived, tied to that one session). Guests cannot create sessions, cannot type, cannot list other sessions. Enforced server-side.

## Features

- **Stream your terminal** — one-click read-only sharing via Cloudflare tunnel
- **Each Chrome tab = a terminal** — pin, group, split, Ctrl+Shift+T, bookmark
- **Sessions persist** — close a tab, shell keeps running, reopen to reconnect
- **WebGL rendering** — same engine as VS Code terminal, GPU-accelerated
- **Ghostty theming** — auto-imports your Ghostty font and colors
- **Secure by default** — scoped guest tokens, server-enforced read-only, owner token never leaked

## Security

| Concern | How it's handled |
|---|---|
| Guest read-only | Server-enforced, input silently dropped |
| Guest cannot create sessions | Guest token scoped to one session only |
| Owner token never shared | Share URL contains `HMAC(ownerToken, sessionId)`, not the master token |
| No token in shell env | `GHOSTTY_TOKEN` stripped before PTY spawn |
| WebSocket hardened | `maxPayload: 64KB`, CORS restricted |

## Architecture

```
twitch-terminal/
├── backend/
│   ├── server.js          # WebSocket + PTY multiplexer + static server + tunnel
│   └── config-parser.js   # Ghostty config reader
├── extension/
│   ├── manifest.json      # Chrome Manifest V3
│   ├── terminal-src.js    # xterm.js + session management + share button
│   └── terminal.html/css  # Terminal UI (served to web guests too)
├── start.sh               # start | share | stop | token
├── eslint.config.js       # 30+ strict rules
└── .husky/pre-commit      # ESLint + shellcheck
```

## Session lifecycle

| Event | What happens |
|---|---|
| New tab | Spawns PTY + shell |
| Tab closed | Shell stays alive server-side |
| Ctrl+Shift+T / bookmark | Reconnects, replays scrollback |
| Viewer opens share URL | Read-only attach, live output |
| 24h idle, no clients | Session cleaned up |
| Backend killed | All sessions lost |

## Performance

| | Native terminal | Twitch Terminal |
|---|---|---|
| Input latency | ~2ms | ~5-8ms |
| Fast scroll | GPU direct | ~2-4ms/frame |
| Memory/tab | ~15MB | ~40-60MB |
| Typing / vim / htop | Same | Same |

## Roadmap

- [x] Terminal in Chrome tabs with session persistence
- [x] One-click read-only streaming via Cloudflare tunnel
- [x] Scoped guest tokens (HMAC, per-session)
- [x] Ghostty config import
- [ ] Session picker (backend API exists)
- [ ] Viewer count in status bar
- [ ] launchd daemon for auto-start
- [ ] libghostty WASM for exact terminal emulation

## License

MIT
