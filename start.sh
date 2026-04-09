#!/bin/bash
# Ghostty Chrome — launcher
# Starts the PTY backend and opens Chrome in app mode

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$DIR/backend"
PID_FILE="$DIR/.backend.pid"
TOKEN_FILE="$DIR/.token"
PORT="${PORT:-7681}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[0;90m'
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
    if curl -sS "http://127.0.0.1:$((PORT+1))/config" > /dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  echo -e "${GREEN}backend running${NC} (pid $BACKEND_PID, port $PORT)"
  echo -e "${DIM}token: $TOKEN${NC}"
  echo ""
}

case "${1:-start}" in
  start)
    start_backend
    echo -e "Load the extension from: ${GREEN}$DIR/extension${NC}"
    echo -e "Then paste this token when prompted: ${GREEN}$(cat "$TOKEN_FILE")${NC}"
    echo ""
    echo -e "${DIM}Or use app mode (full keybindings):${NC}"
    echo -e "  open -na 'Google Chrome' --args --app='chrome-extension://YOUR_EXTENSION_ID/terminal.html'"
    echo ""
    echo -e "${DIM}Press Ctrl+C to stop${NC}"
    wait
    ;;
  stop)
    stop_backend
    ;;
  token)
    [ -f "$TOKEN_FILE" ] && cat "$TOKEN_FILE" || echo "No token. Run 'start' first."
    ;;
  *)
    echo "Usage: $0 {start|stop|token}"
    ;;
esac
