#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_ROOT=/srv/playne
readonly INCOMING_DIR="$APP_ROOT/incoming"
readonly SEALED_DIR="$APP_ROOT/.sealed"
readonly RELEASES_DIR="$APP_ROOT/releases"
readonly CURRENT_LINK="$APP_ROOT/current"
readonly PREVIOUS_LINK="$APP_ROOT/previous"
readonly LOCK_FILE=/run/lock/naglaz-release.lock
readonly MAX_ARCHIVE_BYTES=$((32 * 1024 * 1024))
readonly MAX_EXPANDED_BYTES=$((128 * 1024 * 1024))
readonly MAX_ARCHIVE_MEMBERS=5000
readonly MAX_TAR_BYTES=$((MAX_EXPANDED_BYTES + MAX_ARCHIVE_MEMBERS * 2048 + 16 * 1024 * 1024))
readonly MIN_FREE_BYTES=$((512 * 1024 * 1024))
readonly KEEP_RELEASES=4

ACTIVE_STAGING_DIR=''
ACTIVE_SEALED_ARCHIVE=''
ACTIVE_TAR_ARCHIVE=''
ACTIVE_NEW_RELEASE=''
PREPARED_RELEASE_DIR=''
ACTIVATION_PENDING=0
ACTIVATION_OLD_SHA=''
ACTIVATION_OLD_PREVIOUS_SHA=''

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 027

log() {
  printf '[naglaz-deploy] %s\n' "$*" >&2
}

fail() {
  printf '[naglaz-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

is_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]
}

is_digest() {
  [[ "${1:-}" =~ ^[0-9a-f]{64}$ ]]
}

require_root() {
  (( EUID == 0 )) || fail 'This command must run as root'
}

atomic_link() {
  local link_path="$1"
  local target_path="$2"
  local temporary_link="${link_path}.new.$$"

  [[ "$target_path" = "$RELEASES_DIR"/* ]] ||
    fail 'Refusing to link outside the releases directory'
  rm -f -- "$temporary_link"
  ln -s -- "$target_path" "$temporary_link"
  if ! mv -Tf -- "$temporary_link" "$link_path"; then
    rm -f -- "$temporary_link"
    return 1
  fi
}

linked_release_sha() {
  local link_path="$1"
  local target
  local release_sha

  [[ -L "$link_path" ]] || return 1
  target="$(readlink -f -- "$link_path")" || return 1
  [[ "$target" = "$RELEASES_DIR"/* ]] || return 1
  release_sha="$(basename -- "$target")"
  is_sha "$release_sha" || return 1
  [[ "$target" = "$RELEASES_DIR/$release_sha" && -d "$target" && ! -L "$target" ]] ||
    return 1
  printf '%s\n' "$release_sha"
}

capture_release_link() {
  local link_path="$1"
  local label="$2"

  if [[ ! -e "$link_path" && ! -L "$link_path" ]]; then
    return 0
  fi
  linked_release_sha "$link_path" || {
    log "ERROR: $label link is not a valid release symlink"
    return 1
  }
}

restore_release_link() {
  local link_path="$1"
  local release_sha="${2:-}"

  if [[ -z "$release_sha" ]]; then
    rm -f -- "$link_path"
    return
  fi
  is_sha "$release_sha" || return 1
  [[ -d "$RELEASES_DIR/$release_sha" && ! -L "$RELEASES_DIR/$release_sha" ]] ||
    return 1
  atomic_link "$link_path" "$RELEASES_DIR/$release_sha"
}

cleanup() {
  local status=$?
  local current_target=''
  local previous_target=''

  set +e
  trap '' HUP INT TERM
  if (( ACTIVATION_PENDING )); then
    ACTIVATION_PENDING=0
    log 'Interrupted activation detected; restoring prior links'
    restore_release_link "$CURRENT_LINK" "$ACTIVATION_OLD_SHA"
    restore_release_link "$PREVIOUS_LINK" "$ACTIVATION_OLD_PREVIOUS_SHA"
  fi
  if [[ -n "$ACTIVE_STAGING_DIR" &&
        "$ACTIVE_STAGING_DIR" = "$RELEASES_DIR"/.staging-* &&
        -d "$ACTIVE_STAGING_DIR" &&
        ! -L "$ACTIVE_STAGING_DIR" ]]; then
    rm -rf --one-file-system -- "$ACTIVE_STAGING_DIR"
  fi
  if [[ -n "$ACTIVE_SEALED_ARCHIVE" &&
        "$ACTIVE_SEALED_ARCHIVE" = "$SEALED_DIR"/* &&
        -f "$ACTIVE_SEALED_ARCHIVE" &&
        ! -L "$ACTIVE_SEALED_ARCHIVE" ]]; then
    rm -f -- "$ACTIVE_SEALED_ARCHIVE"
  fi
  if [[ -n "$ACTIVE_TAR_ARCHIVE" &&
        "$ACTIVE_TAR_ARCHIVE" = "$SEALED_DIR"/* &&
        -f "$ACTIVE_TAR_ARCHIVE" &&
        ! -L "$ACTIVE_TAR_ARCHIVE" ]]; then
    rm -f -- "$ACTIVE_TAR_ARCHIVE"
  fi
  current_target="$(readlink -f -- "$CURRENT_LINK" 2>/dev/null || true)"
  previous_target="$(readlink -f -- "$PREVIOUS_LINK" 2>/dev/null || true)"
  if [[ -n "$ACTIVE_NEW_RELEASE" &&
        "$ACTIVE_NEW_RELEASE" = "$RELEASES_DIR"/* &&
        "$ACTIVE_NEW_RELEASE" != "$current_target" &&
        "$ACTIVE_NEW_RELEASE" != "$previous_target" &&
        -d "$ACTIVE_NEW_RELEASE" &&
        ! -L "$ACTIVE_NEW_RELEASE" ]]; then
    rm -rf --one-file-system -- "$ACTIVE_NEW_RELEASE"
  fi
  rm -f -- "$CURRENT_LINK.new.$$" "$PREVIOUS_LINK.new.$$"
  return "$status"
}
trap cleanup EXIT

decompress_archive_bounded() {
  local source_archive="$1"
  local destination_archive="$2"

  python3 - "$source_archive" "$destination_archive" "$MAX_TAR_BYTES" \
    "$MIN_FREE_BYTES" <<'PY'
import os
import resource
import stat
import sys
import zlib

source, destination, maximum_raw, reserve_raw = sys.argv[1:]
maximum = int(maximum_raw)
reserve = int(reserve_raw)
if sys.platform.startswith("linux"):
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (45, 50))

source_fd = destination_fd = None
try:
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    source_stat = os.fstat(source_fd)
    if not stat.S_ISREG(source_stat.st_mode) or source_stat.st_nlink != 1:
        raise ValueError("sealed archive must be one regular file")
    destination_fd = os.open(
        destination,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o400,
    )
    total = 0
    decompressor = zlib.decompressobj(wbits=31)
    with os.fdopen(os.dup(source_fd), "rb", closefd=True) as source_handle:
        while True:
            compressed_chunk = source_handle.read(1024 * 1024)
            if not compressed_chunk:
                break
            if decompressor.eof:
                raise ValueError("archive has trailing data or concatenated gzip streams")
            expanded_chunk = decompressor.decompress(
                compressed_chunk,
                maximum + 1 - total,
            )
            if decompressor.unconsumed_tail:
                raise ValueError("archive expands beyond the complete tar-stream limit")
            total += len(expanded_chunk)
            if total > maximum:
                raise ValueError("archive expands beyond the complete tar-stream limit")
            view = memoryview(expanded_chunk)
            while view:
                written = os.write(destination_fd, view)
                view = view[written:]
            if decompressor.eof and (
                decompressor.unused_data or source_handle.read(1)
            ):
                raise ValueError("archive has trailing data or concatenated gzip streams")
            filesystem = os.statvfs(os.path.dirname(destination))
            if filesystem.f_bavail * filesystem.f_frsize < reserve:
                raise ValueError("decompression would consume the disk reserve")
    if not decompressor.eof:
        raise ValueError("gzip stream is truncated")
    final_chunk = decompressor.flush()
    total += len(final_chunk)
    if total > maximum:
        raise ValueError("archive expands beyond the complete tar-stream limit")
    view = memoryview(final_chunk)
    while view:
        written = os.write(destination_fd, view)
        view = view[written:]
    if total == 0 or total % 512 != 0:
        raise ValueError("uncompressed tar stream has an invalid size")
    os.fsync(destination_fd)
except (OSError, ValueError, zlib.error) as error:
    try:
        os.unlink(destination)
    except FileNotFoundError:
        pass
    print(f"Could not safely decompress release archive: {error}", file=sys.stderr)
    raise SystemExit(1)
finally:
    if destination_fd is not None:
        os.close(destination_fd)
    if source_fd is not None:
        os.close(source_fd)
PY
}

validate_archive() {
  local archive="$1"
  local expected_sha="$2"

  python3 - "$archive" "$expected_sha" "$MAX_EXPANDED_BYTES" \
    "$MAX_ARCHIVE_MEMBERS" <<'PY'
import os
import pathlib
import resource
import stat
import sys
import tarfile

archive, expected_sha, max_bytes_raw, max_members_raw = sys.argv[1:]
max_bytes = int(max_bytes_raw)
max_members = int(max_members_raw)
if sys.platform.startswith("linux"):
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (30, 35))

archive_stat = os.lstat(archive)
if not stat.S_ISREG(archive_stat.st_mode) or archive_stat.st_nlink != 1:
    raise SystemExit("archive must be one regular file")

seen = set()
regular_files = {}
expanded_bytes = 0
with tarfile.open(archive, mode="r:") as bundle:
    members = bundle.getmembers()
    if not members or len(members) > max_members:
        raise SystemExit("archive member count is invalid")

    for member in members:
        name = member.name
        while name.startswith("./"):
            name = name[2:]
        if name in {"", "."}:
            continue
        if "\\" in name:
            raise SystemExit("archive contains a backslash in a path")
        if any(ord(character) < 32 or ord(character) == 127 for character in name):
            raise SystemExit("archive contains a control character in a path")

        path = pathlib.PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or "." in path.parts:
            raise SystemExit("archive contains an unsafe path")
        normalized = str(path)
        if normalized in seen:
            raise SystemExit("archive contains a duplicate path")
        seen.add(normalized)
        if normalized != "REVISION" and path.parts[0] != "naglaz":
            raise SystemExit("archive contains a path outside the release root")
        if any(part.startswith("._") or part == ".DS_Store" for part in path.parts):
            raise SystemExit("archive contains platform metadata")
        if member.isdir() and member.type != tarfile.DIRTYPE:
            raise SystemExit("archive contains a non-standard directory")
        if member.isdir() and normalized not in {"naglaz", "naglaz/assets", "naglaz/art", "naglaz/naglaz", "naglaz/circle", "naglaz/colorfle"}:
            raise SystemExit("archive contains an unexpected directory")
        if member.isfile() and member.type not in {tarfile.REGTYPE, tarfile.AREGTYPE}:
            raise SystemExit("archive contains a sparse or non-standard regular file")
        if not (member.isdir() or member.isfile()):
            raise SystemExit("archive contains a link or special file")
        if member.isfile():
            if member.size < 0:
                raise SystemExit("archive contains a file with an invalid size")
            expanded_bytes += member.size
            if expanded_bytes > max_bytes:
                raise SystemExit("archive expands beyond the configured limit")
            regular_files[normalized] = member

    required = {"REVISION", "naglaz/index.html", "naglaz/naglaz/index.html", "naglaz/favicon.svg", "naglaz/favicon.ico"}
    if not required.issubset(regular_files):
        raise SystemExit("archive is missing required release files")
    if any(name.endswith("/.naglaz-artifact-sha256") for name in regular_files):
        raise SystemExit("archive must not provide server-owned metadata")
    javascript = [name for name in regular_files if name.startswith("naglaz/assets/") and name.endswith(".js")]
    stylesheets = [name for name in regular_files if name.startswith("naglaz/assets/") and name.endswith(".css")]
    artwork = [
        name
        for name in regular_files
        if name.startswith("naglaz/art/") and name.endswith(".png")
    ]
    if len(javascript) != 1 or len(stylesheets) != 1:
        raise SystemExit("archive must contain exactly one JavaScript and one CSS bundle")
    if len(artwork) > 64:
        raise SystemExit("archive contains too many artwork files")
    optional_pages = {"naglaz/circle/index.html", "naglaz/colorfle/index.html"} & set(regular_files)
    allowed_files = required | optional_pages | set(javascript) | set(stylesheets) | set(artwork)
    if set(regular_files) != allowed_files:
        raise SystemExit("archive contains an unexpected public file")
    for asset in javascript + stylesheets + artwork:
        asset_path = pathlib.PurePosixPath(asset)
        filename = asset_path.name
        expected_parent = "art" if asset in artwork else "assets"
        if asset_path.parts != ("naglaz", expected_parent, filename):
            raise SystemExit("archive contains an asset outside its exact directory")
        if not filename or any(
            character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
            for character in filename
        ):
            raise SystemExit("archive contains an invalid asset filename")

    revision_handle = bundle.extractfile(regular_files["REVISION"])
    if revision_handle is None:
        raise SystemExit("cannot read archive revision")
    revision = revision_handle.read(128).decode("ascii", errors="strict").strip()
    if revision != expected_sha:
        raise SystemExit("archive revision does not match requested Git SHA")
    print(expanded_bytes)
PY
}

require_extraction_space() {
  local expanded_bytes="$1"

  [[ "$expanded_bytes" =~ ^[0-9]+$ ]] || fail 'Validated expanded size is invalid'
  python3 - "$RELEASES_DIR" "$expanded_bytes" "$MIN_FREE_BYTES" <<'PY'
import os
import sys

path, expanded_raw, reserve_raw = sys.argv[1:]
filesystem = os.statvfs(path)
if filesystem.f_bavail * filesystem.f_frsize < int(expanded_raw) + int(reserve_raw):
    raise SystemExit("not enough free space to extract the release and preserve the reserve")
PY
}

check_release_directory() {
  local release_dir="$1"
  local expected_sha="$2"
  local expected_digest="${3:-}"
  local actual_digest
  local javascript_file
  local stylesheet_file

  [[ "$release_dir" = "$RELEASES_DIR"/* && -d "$release_dir" && ! -L "$release_dir" ]] ||
    return 1
  [[ "$(cat -- "$release_dir/REVISION" 2>/dev/null)" = "$expected_sha" ]] || return 1
  [[ -f "$release_dir/.naglaz-artifact-sha256" ]] || return 1
  actual_digest="$(cat -- "$release_dir/.naglaz-artifact-sha256")"
  is_digest "$actual_digest" || return 1
  [[ -z "$expected_digest" || "$actual_digest" = "$expected_digest" ]] || return 1
  [[ -f "$release_dir/naglaz/index.html" && -f "$release_dir/naglaz/favicon.svg" ]] || return 1
  [[ -z "$(find "$release_dir" \( -type l -o \( ! -type d ! -type f \) \) -print -quit)" ]] || return 1

  javascript_file="$(find "$release_dir/naglaz/assets" -maxdepth 1 -type f -name '*.js' -printf '%f\n')"
  stylesheet_file="$(find "$release_dir/naglaz/assets" -maxdepth 1 -type f -name '*.css' -printf '%f\n')"
  [[ "$javascript_file" =~ ^[A-Za-z0-9._-]+\.js$ ]] || return 1
  [[ "$stylesheet_file" =~ ^[A-Za-z0-9._-]+\.css$ ]] || return 1
  grep -Fq "/assets/$javascript_file" "$release_dir/naglaz/index.html" || return 1
  grep -Fq "/assets/$stylesheet_file" "$release_dir/naglaz/index.html" || return 1
  { grep -Fq '/art/playne-favicon-32.png' "$release_dir/naglaz/index.html" ||
    grep -Fq '/art/playne-logo.png' "$release_dir/naglaz/index.html" ||
    grep -Fq '/favicon.svg' "$release_dir/naglaz/index.html"; } || return 1
  grep -Fq 'https://mc.yandex.ru/watch/112711950' "$release_dir/naglaz/index.html" || return 1
  grep -Fq 'https://mc.yandex.ru/metrika/tag.js?id=' \
    "$release_dir/naglaz/assets/$javascript_file" || return 1
  grep -Fq '112711950' \
    "$release_dir/naglaz/assets/$javascript_file" || return 1
  grep -Fq 'naglaz_game_complete' \
    "$release_dir/naglaz/assets/$javascript_file" || return 1
}

prepare_release() {
  local archive="$1"
  local release_sha="$2"
  local expected_digest="$3"
  local final_dir="$RELEASES_DIR/$release_sha"
  local staging_dir="$RELEASES_DIR/.staging-$release_sha-$$"

  if [[ -e "$final_dir" ]]; then
    check_release_directory "$final_dir" "$release_sha" "$expected_digest" ||
      fail "Existing immutable release $release_sha is invalid or has another digest"
    PREPARED_RELEASE_DIR="$final_dir"
    return
  fi

  install -d -m 0755 -o root -g root "$staging_dir"
  ACTIVE_STAGING_DIR="$staging_dir"
  tar --extract --file "$archive" --directory "$staging_dir" \
    --no-same-owner --no-same-permissions --delay-directory-restore
  printf '%s\n' "$expected_digest" > "$staging_dir/.naglaz-artifact-sha256"
  chown -R root:root "$staging_dir"
  find "$staging_dir" -type d -exec chmod 0755 {} +
  find "$staging_dir" -type f -exec chmod 0644 {} +
  check_release_directory "$staging_dir" "$release_sha" "$expected_digest" ||
    fail 'Extracted release failed structural validation'
  mv -- "$staging_dir" "$final_dir"
  ACTIVE_STAGING_DIR=''
  ACTIVE_NEW_RELEASE="$final_dir"
  PREPARED_RELEASE_DIR="$final_dir"
}

health_check() {
  local release_dir="$1"
  local attempt
  local healthy=0
  local index_file
  local javascript_file
  local stylesheet_file
  local root_result
  local -a curl_options

  index_file="$(mktemp /run/naglaz-health.XXXXXXXX)"
  trap 'rm -f -- "$index_file"' RETURN
  javascript_file="$(find "$release_dir/naglaz/assets" -maxdepth 1 -type f -name '*.js' -printf '%f\n')"
  stylesheet_file="$(find "$release_dir/naglaz/assets" -maxdepth 1 -type f -name '*.css' -printf '%f\n')"
  curl_options=(
    --noproxy '*'
    --silent
    --show-error
    --connect-timeout 3
    --max-time 10
    --resolve 'playne.ru:443:127.0.0.1'
    --resolve 'www.playne.ru:443:127.0.0.1'
  )

  for attempt in {1..15}; do
    if curl "${curl_options[@]}" --fail https://playne.ru/ --output "$index_file" &&
      cmp --silent "$release_dir/naglaz/index.html" "$index_file"; then
      healthy=1
      break
    fi
    sleep 1
  done
  (( healthy == 1 )) || return 1

  curl "${curl_options[@]}" --fail \
    "https://playne.ru/assets/$javascript_file" --output "$index_file" || return 1
  cmp --silent "$release_dir/naglaz/assets/$javascript_file" "$index_file" || return 1
  curl "${curl_options[@]}" --fail \
    "https://playne.ru/assets/$stylesheet_file" --output "$index_file" || return 1
  cmp --silent "$release_dir/naglaz/assets/$stylesheet_file" "$index_file" || return 1

  if [[ -f "$release_dir/naglaz/naglaz/index.html" ]]; then
    curl "${curl_options[@]}" --fail https://playne.ru/naglaz/ --output "$index_file" || return 1
    cmp --silent "$release_dir/naglaz/naglaz/index.html" "$index_file" || return 1
  fi

  if [[ -f "$release_dir/naglaz/circle/index.html" ]]; then
    curl "${curl_options[@]}" --fail https://playne.ru/circle/ --output "$index_file" || return 1
    cmp --silent "$release_dir/naglaz/circle/index.html" "$index_file" || return 1
  fi

  if [[ -f "$release_dir/naglaz/colorfle/index.html" ]]; then
    curl "${curl_options[@]}" --fail https://playne.ru/colorfle/ --output "$index_file" || return 1
    cmp --silent "$release_dir/naglaz/colorfle/index.html" "$index_file" || return 1
  fi

  root_result="$(curl "${curl_options[@]}" --output /dev/null \
    --write-out '%{http_code}|%{redirect_url}' https://www.playne.ru/)" || return 1
  [[ "$root_result" = '308|https://playne.ru/' ]] || return 1

  rm -f -- "$index_file"
  trap - RETURN
}

remove_release_safely() {
  local release_sha="$1"
  local release_dir

  is_sha "$release_sha" || fail 'Retention encountered an invalid release name'
  release_dir="$RELEASES_DIR/$release_sha"
  [[ -d "$release_dir" && ! -L "$release_dir" ]] ||
    fail 'Retention target is not a release directory'
  rm -rf --one-file-system -- "$release_dir"
}

prune_releases() {
  local current_sha=''
  local previous_sha=''
  local protected_count=0
  local remaining_slots
  local kept_unprotected=0
  local release_sha
  local -a releases=()

  current_sha="$(linked_release_sha "$CURRENT_LINK" || true)"
  previous_sha="$(linked_release_sha "$PREVIOUS_LINK" || true)"
  [[ -n "$current_sha" ]] && ((protected_count += 1))
  if [[ -n "$previous_sha" && "$previous_sha" != "$current_sha" ]]; then
    ((protected_count += 1))
  fi
  remaining_slots=$((KEEP_RELEASES - protected_count))
  (( remaining_slots >= 0 )) || remaining_slots=0

  mapfile -t releases < <(
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d \
      -printf '%T@ %f\n' | sort -rn | awk '{print $2}'
  )
  for release_sha in "${releases[@]}"; do
    is_sha "$release_sha" || continue
    if [[ "$release_sha" = "$current_sha" || "$release_sha" = "$previous_sha" ]]; then
      continue
    fi
    if (( kept_unprotected < remaining_slots )); then
      ((kept_unprotected += 1))
    else
      log "Pruning old release $release_sha"
      remove_release_safely "$release_sha"
    fi
  done
}

deploy_release() {
  local release_sha="$1"
  local expected_digest="$2"
  local incoming_archive="$INCOMING_DIR/$release_sha.$expected_digest.tar.gz"
  local sealed_archive="$SEALED_DIR/$release_sha.$expected_digest.tar.gz"
  local tar_archive="$SEALED_DIR/$release_sha.$expected_digest.tar"
  local actual_digest
  local archive_size
  local expanded_bytes
  local release_dir
  local old_sha=''
  local old_previous_sha=''

  is_sha "$release_sha" || fail 'Deploy requires a full lowercase Git SHA'
  is_digest "$expected_digest" || fail 'Deploy requires a lowercase SHA-256 digest'
  [[ -f "$incoming_archive" && ! -L "$incoming_archive" ]] ||
    fail 'Expected uploaded archive is missing or invalid'

  mv -- "$incoming_archive" "$sealed_archive"
  ACTIVE_SEALED_ARCHIVE="$sealed_archive"
  chmod 0400 "$sealed_archive"
  chown root:root "$sealed_archive"
  archive_size="$(stat -c '%s' -- "$sealed_archive")"
  (( archive_size > 0 && archive_size <= MAX_ARCHIVE_BYTES )) ||
    fail 'Uploaded archive size is invalid'
  actual_digest="$(sha256sum "$sealed_archive" | awk '{print $1}')"
  [[ "$actual_digest" = "$expected_digest" ]] || fail 'Uploaded archive digest mismatch'

  ACTIVE_TAR_ARCHIVE="$tar_archive"
  decompress_archive_bounded "$sealed_archive" "$tar_archive"
  expanded_bytes="$(validate_archive "$tar_archive" "$release_sha")"
  require_extraction_space "$expanded_bytes"
  prepare_release "$tar_archive" "$release_sha" "$expected_digest"
  release_dir="$PREPARED_RELEASE_DIR"

  old_sha="$(capture_release_link "$CURRENT_LINK" current)" ||
    fail 'Cannot deploy over an invalid current link'
  old_previous_sha="$(capture_release_link "$PREVIOUS_LINK" previous)" ||
    fail 'Cannot deploy over an invalid previous link'
  ACTIVATION_OLD_SHA="$old_sha"
  ACTIVATION_OLD_PREVIOUS_SHA="$old_previous_sha"
  ACTIVATION_PENDING=1

  if is_sha "$old_sha" && [[ "$old_sha" != "$release_sha" ]]; then
    atomic_link "$PREVIOUS_LINK" "$RELEASES_DIR/$old_sha"
  fi
  atomic_link "$CURRENT_LINK" "$release_dir"
  if ! health_check "$release_dir"; then
    restore_release_link "$CURRENT_LINK" "$old_sha"
    restore_release_link "$PREVIOUS_LINK" "$old_previous_sha"
    ACTIVATION_PENDING=0
    fail "$release_sha failed production verification and was rolled back"
  fi
  ACTIVATION_PENDING=0
  ACTIVATION_OLD_SHA=''
  ACTIVATION_OLD_PREVIOUS_SHA=''

  rm -f -- "$sealed_archive" "$tar_archive"
  ACTIVE_SEALED_ARCHIVE=''
  ACTIVE_TAR_ARCHIVE=''
  prune_releases
  ACTIVE_NEW_RELEASE=''
  log "Release $release_sha is healthy and active"
}

main() {
  local action="${1:-}"

  require_root
  exec 9>"$LOCK_FILE"
  flock --wait 120 9 || fail 'Another Na Glaz deployment is still running'
  install -d -m 0700 -o root -g root "$SEALED_DIR"

  case "$action" in
    deploy)
      (( $# == 3 )) || fail 'Usage: naglaz-deploy deploy GIT_SHA ARCHIVE_SHA256'
      deploy_release "$2" "$3"
      ;;
    *)
      fail 'Usage: naglaz-deploy deploy GIT_SHA ARCHIVE_SHA256'
      ;;
  esac
}

main "$@"
