// CLI attach: connects stdin/stdout to a backend session via WebSocket
// Usage: node attach.js <port> <token> [sessionId]

import { WebSocket } from "ws";

const PORT = process.argv[2] || "7681";
const TOKEN = process.argv[3];
const SESSION_ID = process.argv[4];

if (!TOKEN) {
  process.stderr.write("Usage: node attach.js <port> <token> [sessionId]\n");
  process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:${PORT}?token=${encodeURIComponent(TOKEN)}`);

ws.on("open", () => {
  if (SESSION_ID) {
    ws.send(JSON.stringify({ type: "attach", id: SESSION_ID, mode: "rw", cols: process.stdout.columns, rows: process.stdout.rows }));
  } else {
    ws.send(JSON.stringify({ type: "new", cols: process.stdout.columns, rows: process.stdout.rows }));
  }
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw);
  switch (msg.type) {
    case "session":
      // Write session ID to stderr so start.sh can capture it
      process.stderr.write(`\x1b]0;twitch-terminal [${msg.id}]\x07`);
      process.stderr.write(`session:${msg.id}\n`);
      break;
    case "output":
    case "scrollback":
      process.stdout.write(msg.data);
      break;
    case "exit":
      process.exit(msg.code || 0);
      break;
  }
});

ws.on("close", () => process.exit(0));
ws.on("error", (e) => {
  process.stderr.write(`connection error: ${e.message}\n`);
  process.exit(1);
});

// Raw mode: pass every keystroke directly
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on("data", (data) => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "input", data: data.toString() }));
  }
});

// Forward terminal resize
process.stdout.on("resize", () => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "resize", cols: process.stdout.columns, rows: process.stdout.rows }));
  }
});
