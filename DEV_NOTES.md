# Bluetooth strategies

## Using phones

Phones randomize their Bluetooth LE MAC address, so you can't reliably use them for presence detection. Would require pairing them.

## Continious scanning with `bluetoothctl`

Problem: Daemon might restart, or the adapter might be reset, then `bluetoothctl` will stop scanning.

## Using noble

Uses 2x CPU compared to bluetoothctl. (8% instead of 4% on a Raspberry Pi 400.)
