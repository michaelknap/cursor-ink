#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/src"
OUT_DIR="${SCRIPT_DIR}/dist"

for tool in gnome-extensions glib-compile-schemas; do
    command -v "$tool" >/dev/null || {
        printf '%s is required to build the extension bundle.\n' "$tool" >&2
        exit 1
    }
done

glib-compile-schemas --strict --dry-run "${SOURCE_DIR}/schemas"
mkdir -p -- "$OUT_DIR"

(
    cd -- "$SOURCE_DIR"
    gnome-extensions pack . \
        --schema=schemas/org.gnome.shell.extensions.cursor-ink.gschema.xml \
        --extra-source=../README.md \
        --extra-source=../LICENSE \
        --out-dir="$OUT_DIR" \
        --force
)

printf 'Created %s/cursor-ink@mknap.com.shell-extension.zip\n' "$OUT_DIR"
