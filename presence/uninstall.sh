#!/usr/bin/env bash
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$TOOL_DIR/../shared/systemd.sh" uninstall "$TOOL_DIR"
