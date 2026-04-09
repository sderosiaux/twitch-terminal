#!/bin/bash
# Twitch Terminal — launcher
# Stream your terminal. Like Twitch, for shells.

set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$DIR/backend"
PID_FILE="$DIR/.backend.pid"
TUNNEL_PID_FILE="$DIR/.tunnel.pid"
TOKEN_FILE="$DIR/.token"
PORT="${PORT:-7681}"

GREEN='\033[0;32m'
DIM='\033[0;90m'
YELLOW='\033[0;33m'
NC='\033[0m'

stop_backend() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

stop_tunnel() {
  if [ -f "$TUNNEL_PID_FILE" ]; then
    local pid
    pid=$(cat "$TUNNEL_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$TUNNEL_PID_FILE"
  fi
}

ensure_token() {
  if [ ! -f "$TOKEN_FILE" ]; then
    openssl rand -hex 24 > "$TOKEN_FILE"
  fi
  cat "$TOKEN_FILE"
}

start_backend() {
  stop_backend

  local token
  token=$(ensure_token)

  cd "$BACKEND_DIR" || exit 1
  TWITCH_TERMINAL_TOKEN="$token" PORT="$PORT" node server.js &
  echo "$!" > "$PID_FILE"

  local _i
  for _i in $(seq 1 20); do
    if curl -sS "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  echo -e "${YELLOW}backend failed to start${NC}" >&2
  return 1
}

start_tunnel() {
  stop_tunnel

  if ! command -v cloudflared &> /dev/null; then
    echo -e "${YELLOW}cloudflared not found. Install: brew install cloudflare/cloudflare/cloudflared${NC}" >&2
    return 1
  fi

  local tunnel_log="$DIR/.tunnel.log"
  : > "$tunnel_log"

  cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate 2>"$tunnel_log" &
  echo "$!" > "$TUNNEL_PID_FILE"

  local tunnel_url=""
  local _i
  for _i in $(seq 1 30); do
    tunnel_url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$tunnel_log" 2>/dev/null | head -1 || true)
    if [ -n "$tunnel_url" ]; then
      break
    fi
    sleep 1
  done

  if [ -z "$tunnel_url" ]; then
    echo -e "${YELLOW}tunnel failed to start${NC}" >&2
    return 1
  fi

  local token
  token=$(cat "$TOKEN_FILE")
  curl -sS "http://127.0.0.1:${PORT}/set-tunnel?token=${token}&url=${tunnel_url}" > /dev/null

  echo "$tunnel_url"
}

# Print the share URL for a session (guest token, read-only)
share_url() {
  local session_id="$1"
  local token tunnel_url guest_token
  token=$(cat "$TOKEN_FILE")

  tunnel_url=$(curl -sS "http://127.0.0.1:${PORT}/tunnel?token=${token}" 2>/dev/null | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);process.stdout.write(j.url||'')})" 2>/dev/null || true)

  # Get guest token from backend
  guest_token=$(node -e "
    const {createHmac}=require('crypto');
    process.stdout.write(createHmac('sha256','${token}').update('${session_id}').digest('hex').slice(0,32));
  ")

  local base="${tunnel_url:-http://127.0.0.1:${PORT}}"
  echo "${base}/?session=${session_id}&token=${guest_token}"
}

cleanup() {
  stop_tunnel
  stop_backend
}

# --- Commands ---

cmd_start() {
  trap cleanup EXIT INT TERM
  start_backend
  echo -e "${GREEN}backend running${NC} (port $PORT)"
  echo -e "Load the extension: ${DIM}chrome://extensions → Load unpacked → ./extension/${NC}"
  echo -e "${DIM}Press Ctrl+C to stop${NC}"
  local backend_pid
  backend_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$backend_pid" ]; then wait "$backend_pid" 2>/dev/null || true; fi
}

cmd_stream() {
  trap cleanup EXIT INT TERM
  start_backend

  local tunnel_url
  echo -e "${DIM}starting tunnel...${NC}" >&2
  tunnel_url=$(start_tunnel)

  if [ -z "$tunnel_url" ]; then
    echo -e "${YELLOW}tunnel failed — streaming locally only${NC}" >&2
  else
    echo -e "${GREEN}tunnel${NC}: $tunnel_url" >&2
  fi

  echo "" >&2
  echo -e "${GREEN}Launching terminal — you're live.${NC}" >&2
  echo -e "${DIM}Share URL will be printed once connected. Ctrl+D to exit.${NC}" >&2
  echo "" >&2

  local token session_id
  token=$(cat "$TOKEN_FILE")

  # Capture session ID from attach.js stderr, display share URL
  local session_id_file
  session_id_file=$(mktemp)

  # Run attach.js — it prints session:<id> to stderr
  node "$BACKEND_DIR/attach.js" "$PORT" "$token" 2> >(
    while IFS= read -r line; do
      if [[ "$line" == session:* ]]; then
        session_id="${line#session:}"
        echo "$session_id" > "$session_id_file"
        local url
        url=$(share_url "$session_id")
        echo -e "\r${GREEN}share url${NC}: $url" >&2
        echo -e "${DIM}Send this to viewers — read-only, no install needed${NC}\n" >&2
      else
        echo "$line" >&2
      fi
    done
  )

  rm -f "$session_id_file"
}

cmd_share() {
  trap cleanup EXIT INT TERM
  start_backend
  local tunnel_url
  tunnel_url=$(start_tunnel)
  echo -e "${GREEN}tunnel active${NC}: $tunnel_url"
  echo ""
  echo -e "Use the ${GREEN}share${NC} button in the extension status bar to get a viewer URL."
  echo ""
  echo -e "${YELLOW}DO NOT share the owner token or the raw tunnel URL${NC}"
  echo -e "${DIM}Press Ctrl+C to stop${NC}"
  local backend_pid
  backend_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$backend_pid" ]; then wait "$backend_pid" 2>/dev/null || true; fi
}

cmd_stop() {
  stop_tunnel
  stop_backend
  echo -e "${DIM}stopped${NC}"
}

case "${1:-start}" in
  start)   cmd_start ;;
  stream)  cmd_stream ;;
  share)   cmd_share ;;
  stop)    cmd_stop ;;
  token)   [ -f "$TOKEN_FILE" ] && cat "$TOKEN_FILE" || echo "No token." ;;
  *)
    echo "Usage: $0 {stream|start|share|stop|token}"
    echo ""
    echo "  stream — launch a streamable terminal (no Chrome needed)"
    echo "  start  — backend only (for Chrome extension)"
    echo "  share  — backend + tunnel (for Chrome extension + sharing)"
    echo "  stop   — kill everything"
    echo "  token  — print auth token"
    ;;
esac
