#!/usr/bin/env bash
set -euo pipefail

SCAN_SECONDS="${1:-5}"

interrupted=0
trap 'interrupted=1' INT

while true; do
  echo "--- $(date '+%Y-%m-%d %H:%M:%S') scanning for ${SCAN_SECONDS}s ---"
  bluetoothctl --timeout "$SCAN_SECONDS" scan le || true

  if [[ $interrupted -eq 1 ]]; then
    echo "Interrupted."
    exit 130
  fi
done
