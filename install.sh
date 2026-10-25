#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/src"
EXTENSION_PATH="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/cursor-ink@mknap.com"

if (( EUID == 0 )); then
    printf 'Run this script as your desktop user, without sudo.\n' >&2
    exit 1
fi

command -v glib-compile-schemas >/dev/null || {
    printf 'glib-compile-schemas is required. Install the GLib tools first.\n' >&2
    exit 1
}

# Compile before touching the installed extension.
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf -- "$STAGING_DIR"' EXIT
cp -R -- "${SOURCE_DIR}/." "$STAGING_DIR/"
glib-compile-schemas --strict "${STAGING_DIR}/schemas"

mkdir -p -- "$EXTENSION_PATH"
cp -R -- "${STAGING_DIR}/." "$EXTENSION_PATH/"

printf 'Installed Cursor Ink to %s\n' "$EXTENSION_PATH"
printf 'Log out and back in, then enable Cursor Ink in the Extensions app.\n'
