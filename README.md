# vigi-tools

CLI tools for a TP-Link VIGI camera, using its "OpenAPI".

- `downloader` - syncs videos from the camera to a local directory. On error, delete the `.json` to retry.
- `presence` - pings the devices listed in `PRESENCE_DEVICES` once per
  `CHECK_INTERVAL_MS` and turns motion detection off while any of them is on the
  network, back on once none are.

Each tool reads its own `.env`; see the `.env.schema` next to it.
