#!/usr/bin/env bash
# bb managed-worktree provisioning hook.
# Runs once via `env bash .bb-env-setup.sh`, cwd = the new worktree.
# No `set -e`: an optional step must never fail provisioning and destroy the worktree.
set -uo pipefail

step() { printf '\n==> %s\n' "$1"; }

# ---------------------------------------------------------------------------
# Per-worktree isolation helpers
# ---------------------------------------------------------------------------
# Every worktree of a project starts from the same copied .env, so without this
# two worktrees would fight over the same ports, the same Redis cache/queue
# namespace, the same session cookie and the same docker-compose project.

# bb lays worktrees out as <root>/env_<id>/<repo-name>, so basename alone is the
# repo name and identical for every worktree of this project. The parent
# directory carries the unique environment id - that is what makes the slug
# distinct, and distinctness is the whole point of this block.
_wt_dir="$(basename "$PWD")"
_wt_parent="$(basename "$(dirname "$PWD")")"
case "$_wt_parent" in
  env_*) WT_SLUG="${_wt_dir}_${_wt_parent#env_}" ;;
  *)     WT_SLUG="$_wt_dir" ;;
esac
WT_SLUG="$(printf '%s' "$WT_SLUG" | tr -c '[:alnum:]' '_' | sed 's/_\+/_/g;s/^_//;s/_$//' | cut -c1-40)"
[ -n "$WT_SLUG" ] || WT_SLUG="wt"

# Rewrite KEY in place if present, else append. Done key-by-key rather than by
# appending a block, because Laravel loads phpdotenv in immutable mode where the
# FIRST occurrence of a duplicated key wins, not the last.
set_env() {
  local key="$1" val="$2" file="${3:-.env}"
  [ -f "$file" ] || return 0
  if grep -qE "^[[:space:]]*#?[[:space:]]*${key}=" "$file"; then
    python3 - "$file" "$key" "$val" <<'PY'
import re, sys
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path).read()
src = re.sub(rf'^[ \t]*#?[ \t]*{re.escape(key)}=.*$', f'{key}={val}', src, count=1, flags=re.M)
open(path, 'w').write(src)
PY
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$file"
  fi
}

# First TCP port >= $1 that nothing is bound to. Probed at provision time so
# worktrees of different projects cannot collide either. Uses python3 rather
# than bash's /dev/tcp, which is absent in some shells and silently reports a
# busy port as free.
free_port() {
  local base="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$base" <<'PY'
import socket, sys
base = int(sys.argv[1])
for port in range(base, base + 200):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", port))
    except OSError:
        continue
    finally:
        s.close()
    print(port)
    break
else:
    print(base)
PY
  else
    local port="$base" limit=$(( base + 200 ))
    while [ "$port" -lt "$limit" ]; do
      if ! (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then echo "$port"; return; fi
      exec 3<&- 2>/dev/null
      port=$(( port + 1 ))
    done
    echo "$base"
  fi
}

# Current value of KEY in .env, or $2 if absent.
env_val() {
  local v
  v="$(grep -E "^[[:space:]]*${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'[:space:]')"
  [ -n "$v" ] && echo "$v" || echo "$2"
}

step "npm install (workspaces)"
npm install --no-audit --no-fund || echo "!! npm install failed - fix manually"

step "build shared packages"
npm run build:shared 2>/dev/null || true

step "laravel package (optional)"
if [ -d packages/laravel ]; then
  (cd packages/laravel && composer install --no-interaction --prefer-dist --no-progress) || true
fi

step "isolate this worktree ($WT_SLUG)"
echo "    server port for this worktree: $(free_port 3000)"

step "worktree ready"
