#!/usr/bin/env bash
#
# The STRANGER TEST: install this package the way a new user would — into a brand-new
# Laravel app — and assert the things that have actually broken for first-time users.
#
#   1. the widget renders for an authenticated user, and NOT for a guest;
#   2. a comment can be created and read back through the API;
#   3. /loupe/dashboard never returns a 5xx. A fresh Laravel 11+ app has no [login] route,
#      and the auth middleware used to throw "Route [login] not defined" — a 500 on step 4
#      of the installer's own instructions. That is the bug this test exists to prevent.
#
# It installs THIS working tree (via a Composer path repository), not Packagist, so a pull
# request cannot merge a first-run break. Needs network (composer create-project) and
# writes only to a temp directory; python3 is used for the file edits.
#
#   packages/laravel/bin/stranger-test.sh
#
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${STRANGER_PORT:-8791}"

WORK="$(mktemp -d)"
APP="$WORK/app"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

fail=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
note() { printf '    %s\n' "$1"; }

step "1/7  A brand-new Laravel app — the stranger's starting point"
# STRANGER_LARAVEL pins the framework line (CI runs the floor and the newest); unset means
# whatever create-project gives you today.
if [ -n "${STRANGER_LARAVEL:-}" ]; then
  composer create-project "laravel/laravel:^${STRANGER_LARAVEL}.0" "$APP" --no-interaction --no-progress --no-scripts --quiet
else
  composer create-project laravel/laravel "$APP" --no-interaction --no-progress --no-scripts --quiet
fi
cd "$APP"
# --no-scripts skips the create-project hooks that write .env and the app key.
cp .env.example .env
php artisan key:generate --force --quiet
touch database/database.sqlite
note "Laravel $(php artisan --version | sed 's/Laravel Framework //') on PHP $(php -r 'echo PHP_VERSION;')"

step "2/7  composer require loupekit/laravel  (this working tree, via a path repo)"
composer config repositories.loupe path "$PKG_DIR"
composer require loupekit/laravel:@dev --no-interaction --no-progress --quiet

step "3/7  php artisan loupe:install && php artisan migrate"
install_out=""
if install_out=$(php artisan loupe:install 2>&1); then
  pass "loupe:install succeeded"
else
  bad "loupe:install failed:"
  printf '%s\n' "$install_out" | tail -20
fi
# A fresh app has no way to sign anyone in, and Loupe only shows the widget to an
# authenticated user — so the installer must SAY so instead of leaving a stranger staring
# at a page with no widget and no explanation.
if printf '%s' "$install_out" | grep -qi "login"; then
  pass "loupe:install warns about the missing [login] route"
else
  bad "loupe:install did not warn that nobody can sign in (no [login] route)"
fi
php artisan migrate --force --quiet

step "4/7  Wire it up as the docs say: @loupeWidget, plus a way to sign in"
python3 - "$APP" <<'PY'
import pathlib, sys

app = pathlib.Path(sys.argv[1])

view = app / "resources/views/welcome.blade.php"
html = view.read_text()
if "@loupeWidget" not in html:
    view.write_text(html.replace("</body>", "    @loupeWidget\n</body>", 1))

# A test-only sign-in route. That a stranger has to WRITE one is the point: fresh Laravel
# ships no auth scaffolding at all. It answers with the session's CSRF token and the user
# id, which is what the widget needs to POST — so the test never has to scrape the markup.
routes = app / "routes/web.php"
routes.write_text(routes.read_text() + """

Route::get('/__stranger_login', function () {
    $user = \\App\\Models\\User::factory()->create(['email' => 'stranger@example.com']);
    auth()->login($user);

    return response()->json(['csrf' => csrf_token(), 'id' => (string) $user->id]);
});

// …and a real login route, so the installer can be checked for going quiet once there IS
// a way to sign in.
Route::view('/login', 'welcome')->name('login');
""")
PY

step "5/7  With a login route present, the installer must be quiet"
if php artisan loupe:install --force 2>&1 | grep -qi "no \[login\] route"; then
  bad "loupe:install still warns about a missing [login] route — but this app has one"
else
  pass "loupe:install is quiet now that a [login] route exists"
fi

step "6/7  Serve it"
php artisan serve --port="$PORT" >"$WORK/serve.log" 2>&1 &
SERVER_PID=$!
BASE="http://127.0.0.1:$PORT"
up=""
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "$BASE/"; then up=1; break; fi
  sleep 1
done
if [ -z "$up" ]; then
  bad "the app never came up — see the log below"
  tail -20 "$WORK/serve.log"
  exit 1
fi
note "serving $BASE"

step "7/7  Assertions"
GUEST_JAR="$WORK/guest.jar"
USER_JAR="$WORK/user.jar"

# --- a guest must not receive the widget --------------------------------------------
code=$(curl -s -o "$WORK/guest.html" -w '%{http_code}' -c "$GUEST_JAR" "$BASE/")
[ "$code" = "200" ] && pass "guest: page is 200" || bad "guest: page returned $code"
if grep -q "vendor/loupe/sdk/loupe.js" "$WORK/guest.html"; then
  bad "guest: received the widget markup (it must be gated)"
else
  pass "guest: no widget markup"
fi

# --- the dashboard must never 5xx (the old "Route [login] not defined") --------------
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$GUEST_JAR" -c "$GUEST_JAR" "$BASE/loupe/dashboard")
case "$code" in
  2*|3*|4*) pass "guest: /loupe/dashboard is $code, not a 5xx";;
  *)        bad "guest: /loupe/dashboard returned $code — a 5xx here is the no-[login]-route bug";;
esac

# --- signed in: the widget renders ---------------------------------------------------
auth_json=$(curl -s -c "$USER_JAR" "$BASE/__stranger_login")
curl -s -o "$WORK/user.html" -b "$USER_JAR" -c "$USER_JAR" "$BASE/"
if grep -q "vendor/loupe/sdk/loupe.js?v=" "$WORK/user.html"; then
  pass "user: widget script is in the page (versioned URL)"
else
  bad "user: the widget did not render"
fi
if grep -q "Loupe.init" "$WORK/user.html"; then
  pass "user: Loupe.init() is in the page"
else
  bad "user: Loupe.init() missing"
fi

# --- the SDK is actually served ------------------------------------------------------
sdk_path="$(grep -o 'vendor/loupe/sdk/loupe.js?v=[^"]*' "$WORK/user.html" | head -1 || true)"
code=$(curl -s -o "$WORK/sdk.js" -w '%{http_code}' -b "$USER_JAR" "$BASE/$sdk_path")
if [ "$code" = "200" ] && [ "$(wc -c <"$WORK/sdk.js")" -gt 10000 ]; then
  pass "user: the SDK bundle downloads ($(wc -c <"$WORK/sdk.js") bytes)"
else
  bad "user: SDK bundle returned $code / $(wc -c <"$WORK/sdk.js") bytes (was it published?)"
fi

# --- write + read a comment, exactly as the widget does ------------------------------
csrf=$(printf '%s' "$auth_json" | sed -n 's/.*"csrf":"\([^"]*\)".*/\1/p' || true)
uid=$(printf '%s' "$auth_json" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' || true)
note "csrf: ${csrf:+found} · user id: ${uid:-missing}"

if [ -n "$csrf" ] && [ -n "$uid" ]; then
  comment=$(printf '{"id":"stranger-%s","url":"/","status":"open","kind":"free","title":"stranger test","body":"posted by the stranger test","author":{"id":"%s","name":"Stranger"},"anchor":{"id":null,"testid":null,"cssPath":null,"xpath":null,"text":"","attrs":{},"nthOfType":1,"rect":{"x":0,"y":0,"w":10,"h":10},"viewport":{"w":100,"h":100}},"context":{"html":"","styles":{}},"offset":{"x":0.5,"y":0.5}}' "$RANDOM" "$uid")
  code=$(curl -s -o "$WORK/create.json" -w '%{http_code}' -b "$USER_JAR" \
    -H "Content-Type: application/json" -H "Accept: application/json" -H "X-CSRF-TOKEN: $csrf" \
    -X POST -d "$comment" "$BASE/loupe/v1/comments")
  case "$code" in
    200|201) pass "user: comment created through the API ($code)";;
    *)       bad "user: comment create returned $code — $(head -c 200 "$WORK/create.json")";;
  esac

  code=$(curl -s -o "$WORK/list.json" -w '%{http_code}' -b "$USER_JAR" \
    -H "Accept: application/json" "$BASE/loupe/v1/comments")
  if [ "$code" = "200" ] && grep -q "stranger test" "$WORK/list.json"; then
    pass "user: the comment comes back in the list"
  else
    bad "user: comment list returned $code / did not contain the comment"
  fi
else
  bad "could not read the csrf token / user id from the rendered widget config"
fi

echo
if [ "$fail" = "0" ]; then
  printf '\033[32m✅ stranger test passed\033[0m — a brand-new install works end to end\n'
else
  printf '\033[31m❌ stranger test failed\033[0m — see the ✗ lines above\n'
fi
exit "$fail"
