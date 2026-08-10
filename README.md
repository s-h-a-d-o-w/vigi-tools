# vigi-tools

CLI tools for a TP-Link VIGI camera, using its "Open API" (you have to enable this in the camera settings).

- `downloader` - syncs videos from the camera to a local directory. On error, delete the `.json` to retry.
- `presence` - pings the devices listed in `PRESENCE_DEVICES` once per
  `CHECK_INTERVAL_MS` and turns motion detection off while any of them is on the
  network, back on once none are. (All sub-settings (e.g. sensitivity) you've set via web UI or elsewhere are retained.)

## Requirements

The tools are bundled into dependency-free files that target Node 22, so they also
run on hardware that current dev dependencies don't support - e.g. a 32-bit
(armhf) Raspberry Pi.

- Build machine: Node.js 24+
- Target machine: Node.js 22+ and, for the downloader, `ffmpeg` on `PATH`
  (`sudo apt install ffmpeg`, or point `FFMPEG_PATH` at a binary)

## Build

```bash
git clone https://github.com/s-h-a-d-o-w/vigi-tools.git
cd vigi-tools
corepack enable
pnpm i
pnpm build
```

This produces a self-contained `dist` directory. Copy it to the target machine:

```bash
scp -r dist <user>@<host>:~/vigi-tools
```

## Configure

Create a `.env` next to the `index.mjs` of each tool you want to use; see the
`.env.schema` file sitting beside it. (Tools run continuously and repeat their
check every `CHECK_INTERVAL_MS`.)

## Running as a service

```bash
cd ~/vigi-tools
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
