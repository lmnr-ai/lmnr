#!/usr/bin/env bash
# Replace the vendored skills with the latest from the public lmnr-ai/lmnr-skills repo.
# Usage: app-server/skills/sync.sh [ref]   (default ref: main)
set -euo pipefail

REPO="https://github.com/lmnr-ai/lmnr-skills.git"
REF="${1:-main}"
SKILLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --quiet --depth 1 --branch "$REF" "$REPO" "$TMP/lmnr-skills"

# Each skill is a directory; top-level files here (README.md, this script) are not skills.
find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +
cp -R "$TMP/lmnr-skills/skills/." "$SKILLS_DIR/"

echo "Synced skills from $REPO@$(git -C "$TMP/lmnr-skills" rev-parse HEAD)"
