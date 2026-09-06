# Using phone for presence

Unreliable in every way - may drop wifi connections, may stop advertising on BT, battery may run out (as opposed to beacons where batteries usually last months to years).

# Bluetooth strategies

## Continious scanning with `bluetoothctl`

Problem: Daemon might restart, or the adapter might be reset, then `bluetoothctl` will stop scanning.

## Using noble

Uses 2x CPU compared to bluetoothctl. (8% instead of 4% on a Raspberry Pi 400.)
