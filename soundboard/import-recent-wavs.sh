#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SCRIPT_DIR/assets"
find "$HOME/Downloads" -type f -iname '*.wav' -mmin -1440 -exec cp -p {} "$SCRIPT_DIR/assets/" \;

echo "Imported WAV files downloaded in the last 24 hours into $SCRIPT_DIR/assets"
