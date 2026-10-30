#!/bin/bash
# Runs when "Kong Manager.app" is opened. Starts the local server with the Kong proxy
# (like `npm start`) in the background and opens the app in the browser. Opened again while
# the server is running, it offers to open the page or stop the server.
# install-app.sh copies this into the app bundle and fills in REPO.

REPO="__REPO__"
PORT=4173
URL="http://localhost:$PORT/kong-manager/"
LOG="$HOME/Library/Logs/kong-manager.log"
TITLE="Kong Manager"

# Apps opened from Finder don't get the shell's PATH, so find Node the same way a terminal would.
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

alert() {
  osascript -e 'tell me to activate' \
    -e "display dialog \"$1\" buttons {\"OK\"} default button \"OK\" with title \"$TITLE\" with icon caution" >/dev/null 2>&1
}

notify() {
  osascript -e "display notification \"$1\" with title \"$TITLE\"" >/dev/null 2>&1
}

is_running() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$URL")" = "200" ]
}

stop_server() {
  local pids
  pids=$(lsof -ti "tcp:$PORT" -sTCP:LISTEN)
  [ -n "$pids" ] && kill $pids
  notify "Server stopped."
}

if is_running; then
  choice=$(osascript -e 'tell me to activate' \
    -e "button returned of (display dialog \"Kong Manager is running at $URL\" buttons {\"Stop server\", \"Open\"} default button \"Open\" with title \"$TITLE\")" 2>/dev/null)
  case "$choice" in
    "Stop server") stop_server ;;
    "Open") open "$URL" ;;
  esac
  exit 0
fi

if lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null; then
  alert "Port $PORT is used by another program. Close it and try again."
  exit 1
fi

if ! command -v node >/dev/null; then
  alert "Node.js was not found. Install Node.js 20 or newer and try again."
  exit 1
fi

if [ ! -d "$REPO" ]; then
  alert "The project folder was not found: $REPO. Run npm run app:install from the project again."
  exit 1
fi

cd "$REPO" || exit 1
notify "Starting…"
{
  echo
  echo "=== $(date) starting Kong Manager ==="
} >>"$LOG"

if [ ! -d node_modules ]; then
  npm install >>"$LOG" 2>&1 || { alert "npm install failed. See $LOG"; exit 1; }
fi

# Same build as `npm start`, minus the typecheck, so it opens in a few seconds.
./node_modules/.bin/vite build --mode proxy --outDir dist-local >>"$LOG" 2>&1 \
  || { alert "The build failed. See $LOG"; exit 1; }

# KONG_MANAGER_AUTO_STOP: the server stops by itself once every Kong Manager tab is closed.
KONG_MANAGER_AUTO_STOP=1 nohup ./node_modules/.bin/vite preview --mode proxy --outDir dist-local --port "$PORT" --strictPort \
  >>"$LOG" 2>&1 </dev/null &
disown

for _ in $(seq 1 60); do
  if is_running; then
    open "$URL"
    exit 0
  fi
  sleep 0.5
done

alert "The server did not start. See $LOG"
exit 1
