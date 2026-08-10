# vigi-tools

CLI tools for a TP-Link VIGI camera, using its "Open API" (you have to enable this in the camera settings).

- `downloader` - syncs videos from the camera to a local directory. On error, delete the `.json` to retry.
- `presence` - pings the devices listed in `PRESENCE_DEVICES` once per
  `CHECK_INTERVAL_MS` and turns motion detection off while any of them is on the
  network, back on once none are. (All sub-settings (e.g. sensitivity) you've set via web UI or elsewhere are retained.)

## Requirements (running, not building)

- Node.js 22+ (intentionally legacy for 32-bit (armhf) Raspberry Pi support)
- ffmpeg globally available on PATH (for `downloader` only)

## How to use

```bash
npm install --global vigi-tools
# Run where you want to store the config file(s).
vigi-tools presence configure
vigi-tools presence
```

To run as a service:

```bash
vigi-tools presence install
```

A service runs as the user who invoked it, is restarted automatically and
starts on boot. Logs go to the journal:

```bash
journalctl -u vigi-<tool> -f
```

To stop and remove:

```bash
vigi-tools presence uninstall
```
