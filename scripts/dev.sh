#!/usr/bin/env bash
# 動作確認ユーティリティ: vite dev サーバーのライフサイクル管理 + 簡易スクリーンショット。
#
# スクラッチで `npm run dev &` / `pkill -f vite` / `curl localhost...` を書く代わりにこれを使う。
# PID/プロセスグループ単位で管理するので、他 worktree のサーバーを巻き込まない。
# 一時ファイルは gitignore 済みの tmp/ に集約する (tmp/dev-<port>.pid, tmp/dev-<port>.log)。
#
# Usage:
#   scripts/dev.sh up [port]                 # dev サーバーを detached 起動 (既定 5173)。冪等。200 を待って返る
#   scripts/dev.sh down [port|all]           # 管理下のサーバーを停止 (既定 all)
#   scripts/dev.sh status                    # 管理下サーバーの port / pid / HTTP 状態を一覧
#   scripts/dev.sh logs [port]               # tmp/dev-<port>.log の直近を表示
#   scripts/dev.sh url [app] [port]          # アプリ URL を出力 (app 例: inflation-clicker / ants / solitaire)
#   scripts/dev.sh shot <path|url> [out.png] [--full] [--wait ms] [--size WxH]
#                                            # playwright chromium で静的スクショ (既定 tmp/shot.png)
set -euo pipefail

# リポジトリルートをスクリプト位置から解決し、どこから呼ばれても動くようにする
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
TMP="$ROOT/tmp"
mkdir -p "$TMP"

DEFAULT_PORT=5173

pidfile() { echo "$TMP/dev-$1.pid"; }
logfile() { echo "$TMP/dev-$1.log"; }

# localhost:port が HTTP 応答するか (2xx-4xx いずれでも「起きている」と見なす)
is_up() {
  local port="$1"
  curl -fsS -o /dev/null --max-time 2 "http://localhost:$port/" 2>/dev/null
}

cmd_up() {
  local port="${1:-$DEFAULT_PORT}"
  if is_up "$port"; then
    echo "already up: http://localhost:$port/"
    return 0
  fi
  local log pf
  log="$(logfile "$port")"; pf="$(pidfile "$port")"
  : >"$log"
  # setsid で新セッション (pgid==pid) にし、down 時にプロセスグループごと停止できるようにする
  setsid nohup npx vite --port "$port" --strictPort >"$log" 2>&1 &
  echo $! >"$pf"
  # HTTP 200 を最大 ~30s ポーリング。ブロックしすぎず1回の呼び出しで完結させる
  local i
  for i in $(seq 1 60); do
    if is_up "$port"; then
      echo "up: http://localhost:$port/  (pid $(cat "$pf"), log $log)"
      return 0
    fi
    # プロセスが即死していたら早期に失敗を返す
    if ! kill -0 "$(cat "$pf")" 2>/dev/null; then
      echo "failed to start (process exited). last log:" >&2
      tail -n 20 "$log" >&2 || true
      rm -f "$pf"
      return 1
    fi
    sleep 0.5
  done
  echo "timed out waiting for http://localhost:$port/ . last log:" >&2
  tail -n 20 "$log" >&2 || true
  return 1
}

stop_port() {
  local port="$1" pf pid
  pf="$(pidfile "$port")"
  [ -f "$pf" ] || { echo "no managed server on port $port"; return 0; }
  pid="$(cat "$pf")"
  if kill -0 "$pid" 2>/dev/null; then
    # プロセスグループ全体に TERM (先頭の負号でグループ指定)。残れば KILL
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    local i
    for i in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    kill -0 "$pid" 2>/dev/null && { kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; }
    echo "stopped port $port (pid $pid)"
  else
    echo "port $port not running (stale pid $pid)"
  fi
  rm -f "$pf"
}

cmd_down() {
  local target="${1:-all}"
  if [ "$target" = "all" ]; then
    local found=0 pf port
    for pf in "$TMP"/dev-*.pid; do
      [ -e "$pf" ] || continue
      found=1
      port="$(basename "$pf" .pid)"; port="${port#dev-}"
      stop_port "$port"
    done
    if [ "$found" = 0 ]; then echo "no managed servers"; fi
  else
    stop_port "$target"
  fi
}

cmd_status() {
  local pf port pid alive http found=0
  for pf in "$TMP"/dev-*.pid; do
    [ -e "$pf" ] || continue
    found=1
    port="$(basename "$pf" .pid)"; port="${port#dev-}"
    pid="$(cat "$pf")"
    if kill -0 "$pid" 2>/dev/null; then alive="running"; else alive="dead"; fi
    if is_up "$port"; then http="http:ok"; else http="http:down"; fi
    printf 'port %-6s pid %-8s %-8s %s\n' "$port" "$pid" "$alive" "$http"
  done
  if [ "$found" = 0 ]; then echo "no managed servers"; fi
}

cmd_logs() {
  local port="${1:-$DEFAULT_PORT}" log
  log="$(logfile "$port")"
  [ -f "$log" ] || { echo "no log for port $port" >&2; return 1; }
  tail -n 60 "$log"
}

cmd_url() {
  local app="${1:-}" port="${2:-$DEFAULT_PORT}" path
  case "$app" in
    ""|root|index)        path="/" ;;
    clicker|inflation*)   path="/inflation-clicker/" ;;
    ants|ant*)            path="/ants-nest-simulator/" ;;
    solitaire|cascade*)   path="/solitaire-cascade/" ;;
    /*)                   path="$app" ;;          # 生のパス指定も許可
    *)                    path="/$app/" ;;        # 未知名はそのままディレクトリ扱い
  esac
  echo "http://localhost:$port$path"
}

cmd_shot() {
  [ $# -ge 1 ] || { echo "usage: dev.sh shot <path|url> [out.png] [--full] [--wait ms] [--size WxH]" >&2; return 1; }
  local target="$1"; shift
  # 相対パスは localhost:PORT を前置 (PORT 環境変数 > 既定)
  case "$target" in
    http://*|https://*) ;;
    *) target="http://localhost:${PORT:-$DEFAULT_PORT}$target" ;;
  esac
  node "$ROOT/scripts/_shot.mjs" "$target" "$@"
}

main() {
  local sub="${1:-}"
  [ $# -gt 0 ] && shift || true
  case "$sub" in
    up)     cmd_up "$@" ;;
    down)   cmd_down "$@" ;;
    status) cmd_status "$@" ;;
    logs)   cmd_logs "$@" ;;
    url)    cmd_url "$@" ;;
    shot)   cmd_shot "$@" ;;
    ""|-h|--help|help)
      sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      ;;
    *)
      echo "unknown subcommand: $sub" >&2
      echo "run 'scripts/dev.sh --help'" >&2
      return 2
      ;;
  esac
}

main "$@"
