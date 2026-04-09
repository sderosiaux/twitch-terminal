import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";

const WS_PORT = 7681;
const HTTP_PORT = 7682;

const SESSION_KEY_PREFIX = "ghostty_session_";

// --- Config & Theme ---

async function loadConfig() {
  try {
    const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/config`);
    return await res.json();
  } catch {
    return null;
  }
}

function buildXtermTheme(t) {
  return {
    foreground: t.foreground,
    background: t.background,
    cursor: t.cursor,
    selectionBackground: t.selectionBackground,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };
}

// --- Session persistence via chrome.storage ---

function tabSessionKey() {
  // Use URL hash as unique tab identifier, or generate one
  if (!location.hash) {
    location.hash = crypto.randomUUID().slice(0, 8);
  }
  return SESSION_KEY_PREFIX + location.hash.slice(1);
}

function getSavedSessionId() {
  return new Promise((resolve) => {
    const key = tabSessionKey();
    chrome.storage.local.get(key, (result) => resolve(result[key] || null));
  });
}

function saveSessionId(id) {
  return chrome.storage.local.set({ [tabSessionKey()]: id });
}

// --- Auth token ---

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get("ghostty_token", (r) => resolve(r.ghostty_token || null));
  });
}

function setToken(newToken) {
  return chrome.storage.local.set({ ghostty_token: newToken });
}

// --- Main ---

async function main() {
  const config = await loadConfig();
  const theme = config?.theme;
  const font = config?.font;

  // Apply background immediately
  if (theme) {
    document.documentElement.style.setProperty("--bg", theme.background);
  }

  const family = font?.family || "JetBrains Mono";
  // Quote font names for CSS, append monospace fallbacks
  const fontFamily = `'${family}', 'Fira Code', 'SF Mono', Menlo, monospace`;

  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    fontFamily,
    fontSize: font?.size || 14,
    lineHeight: 1.0,
    letterSpacing: 0,
    theme: theme ? buildXtermTheme(theme) : undefined,
    allowProposedApi: true,
    scrollback: 10000,
    fontWeight: "normal",
    fontWeightBold: "bold",
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const container = document.getElementById("terminal");

  // Wait for font to load before opening terminal (prevents cell metric mismatch)
  await document.fonts.load(`${font?.size || 14}px ${fontFamily}`).catch(() => {});

  term.open(container);

  // WebGL renderer — load after font is ready
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => webglAddon.dispose());
    term.loadAddon(webglAddon);
  } catch {
    console.warn("WebGL addon unavailable, using canvas renderer");
  }

  fitAddon.fit();
  window.addEventListener("resize", () => fitAddon.fit());

  // Update page title with shell activity
  term.onTitleChange((title) => {
    document.title = title || "Terminal";
  });

  // --- WebSocket connection ---

  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const sessionIdEl = document.getElementById("session-id");

  const storedToken = await getToken();

  const token = storedToken ?? await (async () => {
    const t = prompt("Paste the auth token from the ghostty-chrome backend output:");
    if (t) {
      await setToken(t.trim());
      return t.trim();
    }
    return null;
  })();

  if (!token) {
    term.write("\r\n\x1b[31mNo auth token provided. Start the backend and reload.\x1b[0m\r\n");
    return;
  }

  const savedSession = await getSavedSessionId();

  function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      statusEl.className = "";
      statusText.textContent = "connected";

      if (savedSession) {
        ws.send(JSON.stringify({ type: "attach", id: savedSession, cols: term.cols, rows: term.rows }));
      } else {
        ws.send(JSON.stringify({ type: "new", cols: term.cols, rows: term.rows }));
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "session":
          saveSessionId(msg.id);
          sessionIdEl.textContent = msg.id;
          break;
        case "output":
          term.write(msg.data);
          break;
        case "scrollback":
          term.write(msg.data);
          break;
        case "exit":
          term.write(`\r\n\x1b[90m[process exited: ${msg.code}]\x1b[0m\r\n`);
          statusText.textContent = "exited";
          break;
      }
    };

    ws.onclose = (e) => {
      statusEl.className = "disconnected";
      if (e.code === 4001) {
        statusText.textContent = "invalid token";
        term.write("\r\n\x1b[31mAuth failed. Check token.\x1b[0m\r\n");
        // Clear bad token and prompt
        chrome.storage.local.remove("ghostty_token");
        return;
      }
      statusText.textContent = "disconnected — reconnecting...";
      setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      statusText.textContent = "connection error";
    };

    // Terminal input → WebSocket
    term.onData((data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "input", data }));
    });

    // Resize events
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });

    // Re-fit on resize
    new ResizeObserver(() => fitAddon.fit()).observe(container);
  }

  connect();
  term.focus();
}

main();
