#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
backup_dir=/srv/playne/backups/database
install -d -m 0700 "$backup_dir"
backup_name="$backup_dir/playne-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f -- "$backup_name.tmp"' EXIT
sudo -u postgres pg_dump --format=custom --dbname=playne > "$backup_name.tmp"
test -s "$backup_name.tmp"
mv -- "$backup_name.tmp" "$backup_name"
find "$backup_dir" -maxdepth 1 -type f -name 'playne-*.dump' -mtime +13 -delete
