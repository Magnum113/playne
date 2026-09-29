#!/usr/bin/env bash
set -Eeuo pipefail

readonly INCOMING_DIR=/srv/playne/incoming
readonly MAX_ARCHIVE_BYTES=$((32 * 1024 * 1024))
readonly MIN_FREE_BYTES=$((512 * 1024 * 1024))
readonly DEPLOY_PROGRAM=/usr/local/sbin/naglaz-deploy
readonly RELEASES_DIR=/srv/playne/releases
readonly CURRENT_LINK=/srv/playne/current
readonly UPLOAD_LOCK=/var/lib/naglaz-deploy/upload.lock

PATH=/usr/bin:/bin
export PATH
unset CDPATH ENV BASH_ENV
umask 027

reject() {
  logger -t naglaz-ci-ssh -- 'rejected restricted SSH command'
  printf 'Command rejected\n' >&2
  exit 1
}

is_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]
}

is_digest() {
  [[ "${1:-}" =~ ^[0-9a-f]{64}$ ]]
}

available_bytes() {
  df --output=avail -B1 "$INCOMING_DIR" | tail -n 1 | tr -d '[:space:]'
}

original_command="${SSH_ORIGINAL_COMMAND:-}"
read -r -a command_parts <<< "$original_command"
(( ${#command_parts[@]} >= 1 )) || reject

case "${command_parts[0]}" in
  upload)
    (( ${#command_parts[@]} == 3 )) || reject
    release_sha="${command_parts[1]}"
    expected_digest="${command_parts[2]}"
    is_sha "$release_sha" || reject
    is_digest "$expected_digest" || reject
    [[ "$original_command" = "upload $release_sha $expected_digest" ]] || reject

    exec 9>"$UPLOAD_LOCK"
    flock --wait 30 9 || {
      printf 'Another upload is still running\n' >&2
      exit 1
    }
    free_bytes="$(available_bytes)"
    [[ "$free_bytes" =~ ^[0-9]+$ ]] || reject
    (( free_bytes >= MIN_FREE_BYTES + MAX_ARCHIVE_BYTES )) || {
      printf 'Server disk reserve is too low for another upload\n' >&2
      exit 1
    }

    temporary_file="$(mktemp "$INCOMING_DIR/.upload-${release_sha}.XXXXXX")"
    trap 'rm -f -- "$temporary_file"' EXIT
    head -c "$((MAX_ARCHIVE_BYTES + 1))" > "$temporary_file"

    archive_size="$(stat -c '%s' -- "$temporary_file")"
    if (( archive_size == 0 || archive_size > MAX_ARCHIVE_BYTES )); then
      printf 'Archive is empty or exceeds the 32 MiB limit\n' >&2
      exit 1
    fi
    free_bytes="$(available_bytes)"
    [[ "$free_bytes" =~ ^[0-9]+$ ]] || reject
    (( free_bytes >= MIN_FREE_BYTES )) || {
      printf 'Upload would consume the server disk reserve\n' >&2
      exit 1
    }

    actual_digest="$(sha256sum "$temporary_file" | awk '{print $1}')"
    [[ "$actual_digest" = "$expected_digest" ]] || {
      printf 'Archive digest mismatch\n' >&2
      exit 1
    }

    chmod 0640 "$temporary_file"
    mv -f -- "$temporary_file" \
      "$INCOMING_DIR/$release_sha.$expected_digest.tar.gz"
    trap - EXIT
    printf 'Uploaded %s\n' "$release_sha"
    ;;

  deploy)
    (( ${#command_parts[@]} == 3 )) || reject
    release_sha="${command_parts[1]}"
    expected_digest="${command_parts[2]}"
    is_sha "$release_sha" || reject
    is_digest "$expected_digest" || reject
    [[ "$original_command" = "deploy $release_sha $expected_digest" ]] || reject
    exec sudo -n "$DEPLOY_PROGRAM" deploy "$release_sha" "$expected_digest"
    ;;

  status)
    (( ${#command_parts[@]} == 3 )) || reject
    release_sha="${command_parts[1]}"
    expected_digest="${command_parts[2]}"
    is_sha "$release_sha" || reject
    is_digest "$expected_digest" || reject
    [[ "$original_command" = "status $release_sha $expected_digest" ]] || reject

    current_target="$(readlink -f -- "$CURRENT_LINK" 2>/dev/null || true)"
    [[ "$current_target" = "$RELEASES_DIR/$release_sha" && \
      -d "$current_target" && ! -L "$current_target" ]] || reject
    [[ -f "$current_target/.naglaz-artifact-sha256" ]] || reject
    actual_digest="$(cat -- "$current_target/.naglaz-artifact-sha256")"
    [[ "$actual_digest" = "$expected_digest" ]] || reject
    printf 'Active %s %s\n' "$release_sha" "$expected_digest"
    ;;

  *)
    reject
    ;;
esac
