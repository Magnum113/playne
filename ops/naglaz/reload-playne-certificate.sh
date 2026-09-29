#!/usr/bin/env bash
set -Eeuo pipefail

# Certbot deploy hook; ignores renewals for other projects.
[[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/playne.ru ]] || exit 0
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
