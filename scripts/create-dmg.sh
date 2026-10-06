#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/apps/tauri/src-tauri/target/release/bundle/macos/Ichibot.app"
OUTPUT_DIR="$ROOT_DIR/apps/tauri/src-tauri/target/release/bundle/dmg"
OUTPUT_PATH="$OUTPUT_DIR/Ichibot_0.0.1_$(uname -m).dmg"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ichibot-dmg.XXXXXX")"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

if [[ ! -d "$APP_PATH" ]]; then
  echo "Ichibot.app was not found at $APP_PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_PATH"
cp -R "$APP_PATH" "$STAGING_DIR/Ichibot.app"
ln -s /Applications "$STAGING_DIR/Applications"

echo "Creating $OUTPUT_PATH"
hdiutil create \
  -volname "Ichibot" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$OUTPUT_PATH"

echo "DMG ready: $OUTPUT_PATH"
