import { WebSocketServer } from "ws";
import { spawn } from "node-pty";
import { randomBytes } from "crypto";
import { homedir } from "os";
import { parseGhosttyConfig } from "./config-parser.js";

const PORT = parseInt(process.env.PORT || "7681", 10);
const AUTH_TOKEN = process.env.GHOSTTY_TOKEN || randomBytes(24).toString("hex");

// Session store: keeps PTY alive even when client disconnects
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const ghosttyConfig = parseGhosttyConfig();
const defaultShell = ghosttyConfig.shell || process.env.SHELL || "/bin/zsh";

function createSession(id, cols = 120, rows = 30) {
  const pty = spawn(defaultShell, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: homedir(),
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
  });

  const session = {
    id,
    pty,
    scrollback: [],
    clients: new Set(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  const MAX_SCROLLBACK = 50000;

  pty.onData((data) => {
    session.lastActivity = Date.now();
    // Buffer for reconnection
    session.scrollback.push(data);
    if (session.scrollback.length > MAX_SCROLLBACK) {
      session.scrollback = session.scrollback.slice(-MAX_SCROLLBACK / 2);
    }
    // Broadcast to connected clients
    for (const ws of session.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "output", data }));
    }
  });

  pty.onExit(({ exitCode }) => {
    for (const ws of session.clients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "exit", code: exitCode }));
      }
    }
    sessions.delete(id);
  });

  sessions.set(id, session);
  return session;
}

function attachClient(ws, session) {
  session.clients.add(ws);
  // Replay scrollback for reconnection
  if (session.scrollback.length > 0) {
    ws.send(
      JSON.stringify({
        type: "scrollback",
        data: session.scrollback.join(""),
      })
    );
  }
}

// Cleanup stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.clients.size === 0 && now - session.lastActivity > SESSION_TTL_MS) {
      session.pty.kill();
      sessions.delete(id);
    }
  }
}, 60_000);

// WebSocket server
const wss = new WebSocketServer({ port: PORT, host: "127.0.0.1" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const token = url.searchParams.get("token");

  if (token !== AUTH_TOKEN) {
    ws.close(4001, "Unauthorized");
    return;
  }

  let session = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "new": {
        const id = randomBytes(8).toString("hex");
        session = createSession(id, msg.cols || 120, msg.rows || 30);
        attachClient(ws, session);
        ws.send(JSON.stringify({ type: "session", id }));
        break;
      }

      case "attach": {
        session = sessions.get(msg.id);
        if (!session) {
          // Session expired — create fresh one with same id
          session = createSession(msg.id, msg.cols || 120, msg.rows || 30);
        }
        attachClient(ws, session);
        ws.send(JSON.stringify({ type: "session", id: session.id }));
        break;
      }

      case "input": {
        if (session) session.pty.write(msg.data);
        break;
      }

      case "resize": {
        if (session && msg.cols && msg.rows) {
          session.pty.resize(msg.cols, msg.rows);
        }
        break;
      }

      case "list": {
        const list = [...sessions.entries()].map(([id, s]) => ({
          id,
          alive: !s.pty.killed,
          clients: s.clients.size,
          age: Date.now() - s.createdAt,
        }));
        ws.send(JSON.stringify({ type: "sessions", list }));
        break;
      }
    }
  });

  ws.on("close", () => {
    if (session) session.clients.delete(ws);
  });
});

// Config endpoint — serves theme + font to extension
import { createServer } from "http";
const http = createServer((req, res) => {
  if (req.url === "/config") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(ghosttyConfig));
    return;
  }
  res.writeHead(404);
  res.end();
});
http.listen(PORT + 1, "127.0.0.1");

console.log(`ghostty-chrome backend`);
console.log(`  ws://127.0.0.1:${PORT}`);
console.log(`  http://127.0.0.1:${PORT + 1}/config`);
console.log(`  token: ${AUTH_TOKEN}`);
console.log(`  shell: ${defaultShell}`);
console.log(`  theme: ${ghosttyConfig.theme.background} / ${ghosttyConfig.theme.foreground}`);
