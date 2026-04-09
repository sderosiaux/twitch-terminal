#!/bin/bash
# Ghostty Chrome — launcher
# Starts the PTY backend and optionally a Cloudflare tunnel for sharing

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$DIR/backend"
PID_FILE="$DIR/.backend.pid"
TUNNEL_PID_FILE="$DIR/.tunnel.pid"
TOKEN_FILE="$DIR/.token"
PORT="${PORT:-7681}"

# Colors
GREEN='\033[0;32m'
DIM='\033[0;90m'
YELLOW='\033[0;33m'
NC='\033[0m'

stop_backend() {
  if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo -e "${DIM}backend stopped (pid $pid)${NC}"
    fi
    rm -f "$PID_FILE"
  fi
}

stop_tunnel() {
  if [ -f "$TUNNEL_PID_FILE" ]; then
    pid=$(cat "$TUNNEL_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo -e "${DIM}tunnel stopped (pid $pid)${NC}"
    fi
    rm -f "$TUNNEL_PID_FILE"
  fi
}

start_backend() {
  stop_backend

  # Generate a stable token (reuse across restarts)
  if [ ! -f "$TOKEN_FILE" ]; then
    openssl rand -hex 24 > "$TOKEN_FILE"
  fi
  TOKEN=$(cat "$TOKEN_FILE")

  cd "$BACKEND_DIR"
  GHOSTTY_TOKEN="$TOKEN" PORT="$PORT" node server.js &
  BACKEND_PID=$!
  echo "$BACKEND_PID" > "$PID_FILE"

  # Wait for backend to be ready
  for i in $(seq 1 20); do
    if curl -sS "http://127.0.0.1:${PORT}/config" > /dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  echo -e "${GREEN}backend running${NC} (pid $BACKEND_PID, port $PORT)"
  echo -e "${DIM}token: $TOKEN${NC}"
  echo ""
}

start_tunnel() {
  stop_tunnel

  if ! command -v cloudflared &> /dev/null; then
    echo -e "${YELLOW}cloudflared not found. Install: brew install cloudflare/cloudflare/cloudflared${NC}"
    return 1
  fi

  TUNNEL_LOG="$DIR/.tunnel.log"
  cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate 2>"$TUNNEL_LOG" &
  TUNNEL_PID=$!
  echo "$TUNNEL_PID" > "$TUNNEL_PID_FILE"

  # Wait for tunnel URL
  for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
    sleep 0.5
  done

  if [ -z "$TUNNEL_URL" ]; then
    echo -e "${YELLOW}tunnel failed to start — check $TUNNEL_LOG${NC}"
    return 1
  fi

  TOKEN=$(cat "$TOKEN_FILE")
  TUNNEL_HOST=$(echo "$TUNNEL_URL" | sed 's|https://||')

  echo -e "${GREEN}tunnel active${NC}: $TUNNEL_URL"
  echo ""
  echo -e "Share this link:"
  echo -e "  ${GREEN}chrome-extension://EXTENSION_ID/terminal.html?host=${TUNNEL_HOST}#shared${NC}"
  echo ""
  echo -e "Or for someone without the extension, they need:"
  echo -e "  1. The extension installed"
  echo -e "  2. The tunnel host: ${GREEN}${TUNNEL_HOST}${NC}"
  echo -e "  3. The token: ${GREEN}${TOKEN}${NC}"
  echo ""
}

cleanup() {
  stop_tunnel
  stop_backend
}
trap cleanup EXIT

case "${1:-start}" in
  start)
    start_backend
    echo -e "Load the extension from: ${GREEN}$DIR/extension${NC}"
    echo -e "Then paste this token when prompted: ${GREEN}$(cat "$TOKEN_FILE")${NC}"
    echo ""
    echo -e "${DIM}Press Ctrl+C to stop${NC}"
    wait
    ;;
  share)
    start_backend
    start_tunnel
    echo -e "${DIM}Press Ctrl+C to stop backend + tunnel${NC}"
    wait
    ;;
  stop)
    stop_tunnel
    stop_backend
    ;;
  token)
    [ -f "$TOKEN_FILE" ] && cat "$TOKEN_FILE" || echo "No token. Run 'start' first."
    ;;
  *)
    echo "Usage: $0 {start|share|stop|token}"
    echo ""
    echo "  start  — backend only (local)"
    echo "  share  — backend + Cloudflare tunnel (shareable)"
    echo "  stop   — kill everything"
    echo "  token  — print auth token"
    ;;
esac
