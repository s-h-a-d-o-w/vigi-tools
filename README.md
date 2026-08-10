# vigi-tools

CLI tools for a TP-Link VIGI camera, using its "Open API" (you have to enable this in the camera settings).

- `downloader` - syncs videos from the camera to a local directory. On error, delete the `.json` to retry.
- `presence` - pings the devices listed in `PRESENCE_DEVICES` once per
  `CHECK_INTERVAL_MS` and turns motion detection off while any of them is on the
  network, back on once none are. (All sub-settings (e.g. sensitivity) you've set via web UI or elsewhere are retained.)

## Requirements

- Node.js

## How to use

```bash
git clone https://github.com/s-h-a-d-o-w/vigi-tools.git
cd vigi-tools
corepack enable
pnpm i
```

- Create a `.env` file for each tool you want to use; see `.env.schema` files. (Tools run continuously and repeat their check every `CHECK_INTERVAL_MS`.)

### Running as a service

```bash
sudo ./downloader/install.sh
sudo ./presence/install.sh
```

A service runs as the user who invoked `sudo`, is restarted automatically and
starts on boot. Logs go to the journal:

```bash
journalctl -u vigi-downloader -f
```

To stop and remove:

```bash
sudo ./downloader/uninstall.sh
sudo ./presence/uninstall.sh
```
