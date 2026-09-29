#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_USER=naglaz-deploy
readonly BASE_ROOT=/srv/playne
readonly ACCOUNT_HOME=/var/lib/naglaz-deploy

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  (( EUID == 0 )) || fail 'Run this installer as root'
}

read_validated_public_key() {
  local public_key_file="$1"
  local public_key

  [[ -f "$public_key_file" && ! -L "$public_key_file" ]] ||
    fail 'A dedicated public-key file is missing or is a symlink'
  public_key="$(tr -d '\r' < "$public_key_file")"
  [[ "$public_key" != *$'\n'* ]] ||
    fail 'A public-key file must contain exactly one key'
  [[ "$public_key" =~ ^ssh-ed25519\ [A-Za-z0-9+/]+={0,3}([[:space:]].*)?$ ]] ||
    fail 'Only one valid ssh-ed25519 public key is accepted'
  ssh-keygen -l -f "$public_key_file" >/dev/null ||
    fail 'The supplied public key is invalid'
  printf '%s\n' "$public_key"
}

install_authorized_key() {
  local public_key_file="$1"
  local public_key
  local ssh_dir="$ACCOUNT_HOME/.ssh"
  local temporary_keys

  [[ ! -L "$ACCOUNT_HOME" && ! -L "$ssh_dir" ]] ||
    fail 'Refusing to install authorized keys through a symlink'
  public_key="$(read_validated_public_key "$public_key_file")"

  install -d -m 0750 -o root -g "$DEPLOY_USER" "$ACCOUNT_HOME"
  install -d -m 0750 -o root -g "$DEPLOY_USER" "$ssh_dir"
  temporary_keys="$(mktemp "$ssh_dir/.authorized_keys.XXXXXX")"
  printf '%s %s\n' \
    'restrict,command="/usr/local/libexec/naglaz-ci-ssh",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding' \
    "$public_key" > "$temporary_keys"
  chown root:"$DEPLOY_USER" "$temporary_keys"
  chmod 0640 "$temporary_keys"
  mv -f -- "$temporary_keys" "$ssh_dir/authorized_keys"
}

main() {
  local public_key_file="${1:-}"
  local sudoers_tmp

  require_root
  (( $# == 1 )) ||
    fail 'Usage: install-foundation.sh /path/to/naglaz-ci-key.pub'
  read_validated_public_key "$public_key_file" >/dev/null
  for command in curl flock python3 ssh-keygen tar visudo; do
    command -v "$command" >/dev/null 2>&1 || fail "Required command is missing: $command"
  done

  if ! getent group "$DEPLOY_USER" >/dev/null; then
    groupadd --system "$DEPLOY_USER"
  fi
  if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
    useradd --system --gid "$DEPLOY_USER" --home-dir "$ACCOUNT_HOME" \
      --create-home --shell /bin/bash "$DEPLOY_USER"
  fi
  usermod --lock "$DEPLOY_USER"

  install -d -m 0755 -o root -g root "$BASE_ROOT" "$BASE_ROOT/releases"
  install -d -m 0730 -o root -g "$DEPLOY_USER" "$BASE_ROOT/incoming"
  install -d -m 0700 -o root -g root "$BASE_ROOT/.sealed"
  install -d -m 0755 -o root -g root /usr/local/libexec
  install -m 0755 -o root -g root "$SCRIPT_DIR/naglaz-ci-ssh.sh" \
    /usr/local/libexec/naglaz-ci-ssh
  install -m 0750 -o root -g root "$SCRIPT_DIR/naglaz-deploy.sh" \
    /usr/local/sbin/naglaz-deploy

  sudoers_tmp="$(mktemp /etc/sudoers.d/.naglaz-deploy.XXXXXX)"
  printf '%s\n' \
    'naglaz-deploy ALL=(root) NOPASSWD: /usr/local/sbin/naglaz-deploy deploy *' \
    > "$sudoers_tmp"
  chmod 0440 "$sudoers_tmp"
  visudo -cf "$sudoers_tmp" >/dev/null
  mv -f -- "$sudoers_tmp" /etc/sudoers.d/naglaz-deploy

  install_authorized_key "$public_key_file"
  install -m 0660 -o root -g "$DEPLOY_USER" /dev/null \
    "$ACCOUNT_HOME/upload.lock"
  printf 'Na Glaz deployment foundation installed.\n'
}

main "$@"
