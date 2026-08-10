#!/usr/bin/env bash
# Shared implementation behind each tool's install.sh / uninstall.sh.
# Usage: systemd.sh <install|uninstall> <tool dir>
set -euo pipefail

ACTION="$1"
TOOL_DIR="$2"
TOOL="$(basename "$TOOL_DIR")"
UNIT="vigi-$TOOL.service"
UNIT_PATH="/etc/systemd/system/$UNIT"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root, e.g. sudo $TOOL_DIR/$ACTION.sh" >&2
  exit 1
fi

if [[ "$ACTION" == "uninstall" ]]; then
  systemctl disable --now "$UNIT" 2>/dev/null || true
  rm -f "$UNIT_PATH"
  systemctl daemon-reload
  systemctl reset-failed
  echo "removed $UNIT"
  exit 0
fi

if [[ ! -f "$TOOL_DIR/.env" ]]; then
  echo "Missing $TOOL_DIR/.env - copy $TOOL/.env.schema and fill it in" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node was not found on PATH" >&2
  exit 1
fi

# The account the service runs as - the user who invoked sudo, not root.
SERVICE_USER="${SUDO_USER:-root}"
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

cat >"$UNIT_PATH" <<EOF
[Unit]
Description=vigi-tools $TOOL
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$TOOL_DIR
ExecStart=$NODE_BIN .
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

chmod 644 "$UNIT_PATH"
systemctl daemon-reload
systemctl enable --now "$UNIT"

echo "Installed and started $UNIT"
echo "Follow the logs with: journalctl -u vigi-$TOOL -f"
