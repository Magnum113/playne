#!/usr/bin/env bash
set -Eeuo pipefail

# One-time migration from the legacy /srv/naglaz installation.
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly LEGACY_ROOT=/srv/naglaz
readonly APP_ROOT=/srv/playne
readonly SITE=/etc/nginx/sites-available/kadimag.ru
readonly BACKUP="$APP_ROOT/backups/isolation-$(date -u +%Y%m%dT%H%M%SZ)"

(( EUID == 0 )) || { printf 'Run as root\n' >&2; exit 1; }
[[ -d "$LEGACY_ROOT" && ! -L "$LEGACY_ROOT" && ! -e "$APP_ROOT" ]]
for entry in /etc/nginx/sites-available/playne /etc/nginx/sites-enabled/playne \
  /etc/nginx/snippets/playne-public.conf /etc/nginx/snippets/playne-canonical.conf; do
  [[ ! -e "$entry" && ! -L "$entry" ]]
done

exec 8>/var/lib/naglaz-deploy/upload.lock
flock --wait 30 8
exec 9>/run/lock/naglaz-release.lock
flock --wait 30 9
[[ -z "$(find "$LEGACY_ROOT/incoming" "$LEGACY_ROOT/.sealed" -mindepth 1 -print -quit)" ]]

install -d -m 0755 "$APP_ROOT"
cp -a "$LEGACY_ROOT/." "$APP_ROOT/"
for link in current previous; do
  target="$(readlink -f "$LEGACY_ROOT/$link")"
  sha="$(basename "$target")"
  [[ "$sha" =~ ^[0-9a-f]{40}$ && "$target" = "$LEGACY_ROOT/releases/$sha" ]]
  ln -sfn "$APP_ROOT/releases/$sha" "$APP_ROOT/$link"
done
diff -r "$LEGACY_ROOT/releases" "$APP_ROOT/releases"

install -d -m 0700 "$APP_ROOT/backups" "$BACKUP"
cp -a "$SITE" "$BACKUP/kadimag.ru"
cp -a /usr/local/libexec/naglaz-ci-ssh "$BACKUP/naglaz-ci-ssh"
cp -a /usr/local/sbin/naglaz-deploy "$BACKUP/naglaz-deploy"
sha256sum /etc/nginx/sites-enabled/api.komui.ru \
  /etc/nginx/sites-enabled/komui-production \
  /etc/nginx/sites-enabled/komui-staging \
  /etc/nginx/sites-enabled/getomerch-admin > "$BACKUP/unrelated-nginx.sha256"

# Remove only the game routes and www server from the original site.
python3 - "$SITE" "$BACKUP/kadimag.ru.new" <<'PY'
from pathlib import Path
import re
import sys

source, destination = map(Path, sys.argv[1:])
config = source.read_text()
blocks = re.findall(r'server \{.*?\n\}', config, re.S)
if len(blocks) != 3:
    raise SystemExit('Expected exactly three original server blocks')
www = [b for b in blocks if 'server_name www.kadimag.ru;' in b]
canonical = [b for b in blocks if 'server_name kadimag.ru;' in b]
if len(www) != 1 or len(canonical) != 1:
    raise SystemExit('Unexpected original domain configuration')
canonical = canonical[0]
start = canonical.index('    location = /naglaz {')
end = canonical.index('    location / {', start)
routes = canonical[start:end]
if routes.count('location ') != 5 or '/srv/naglaz' not in routes:
    raise SystemExit('Unexpected game route layout')
updated_canonical = canonical[:start] + '    include /etc/nginx/snippets/playne-canonical.conf;\n\n' + canonical[end:]
updated = config.replace(www[0] + '\n\n', '', 1)
updated = updated.replace(canonical, updated_canonical, 1)
if updated.count('server_name kadimag.ru www.kadimag.ru;') != 1:
    raise SystemExit('Unexpected HTTP domain configuration')
updated = updated.replace('server_name kadimag.ru www.kadimag.ru;', 'server_name kadimag.ru;', 1)
if '/srv/naglaz' in updated or 'location = /naglaz' in updated:
    raise SystemExit('Embedded game routes remain')
destination.write_text(updated)
PY

rollback() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    install -m 0644 "$BACKUP/kadimag.ru" "$SITE"
    install -m 0755 "$BACKUP/naglaz-ci-ssh" /usr/local/libexec/naglaz-ci-ssh
    install -m 0755 "$BACKUP/naglaz-deploy" /usr/local/sbin/naglaz-deploy
    python3 - <<'PY'
from pathlib import Path
Path('/etc/nginx/sites-enabled/playne').unlink(missing_ok=True)
PY
    nginx -t && systemctl reload nginx
    printf 'Migration failed; original routes and deployment scripts restored. Backup: %s\n' "$BACKUP" >&2
  fi
  exit "$status"
}
trap rollback EXIT

install -m 0644 "$SCRIPT_DIR/playne-site.nginx.conf" /etc/nginx/sites-available/playne
install -m 0644 "$SCRIPT_DIR/www-origin.nginx.conf" /etc/nginx/snippets/playne-public.conf
install -m 0644 "$SCRIPT_DIR/canonical-origin.nginx.conf" /etc/nginx/snippets/playne-canonical.conf
install -m 0644 "$BACKUP/kadimag.ru.new" "$SITE"
ln -s /etc/nginx/sites-available/playne /etc/nginx/sites-enabled/playne
install -m 0755 "$SCRIPT_DIR/naglaz-ci-ssh.sh" /usr/local/libexec/naglaz-ci-ssh
install -m 0755 "$SCRIPT_DIR/naglaz-deploy.sh" /usr/local/sbin/naglaz-deploy
nginx -t
systemctl reload nginx

curl --fail --silent --show-error https://www.kadimag.ru/naglaz/ \
  --output "$BACKUP/public-index.html"
cmp "$APP_ROOT/current/naglaz/index.html" "$BACKUP/public-index.html"
sha256sum -c "$BACKUP/unrelated-nginx.sha256"
printf 'Playne isolated in %s. Original data remains in %s until deployment verification.\nBackup: %s\n' \
  "$APP_ROOT" "$LEGACY_ROOT" "$BACKUP"
