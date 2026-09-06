# vigi-tools

CLI tools for a TP-Link VIGI camera, using its "Open API" (you have to enable this in the camera settings).

- `downloader` - syncs videos from the camera to a local directory. On error, delete the `.json` to retry. (Also provides the option to send e-mail notifications via AWS SES when downloads start and finish.)
- `presence` - repeatedly scans for the Bluetooth LE devices listed in `PRESENCE_DEVICES`, in
  `CHECK_INTERVAL_SECONDS` long scans, and turns motion detection off while any of them is in
  range, back on once none are. (All camera sub-settings (e.g. sensitivity) you've set via web UI or elsewhere are retained.) (Also provides the option to send an e-mail warning via AWS SES when a nearby device's battery gets low.)

## Requirements (running, not building)

- Node.js
- `ffmpeg` globally available (for `downloader` only)
- `bluetoothctl` globally available (for `presence` only)

## How to use

```bash
npm install --global vigi-tools
# Run where you want to store the config file(s).
vigi-tools <tool> configure
vigi-tools <tool>
```

To run as a service:

```bash
vigi-tools <tool> install
```

A service runs as the user who invoked it and starts on boot. It is not
restarted automatically: An error stops it so that repeated failing API calls cannot get the account locked out

Logs go to the journal:

```bash
journalctl -u vigi-<tool> -f
```

To stop and remove:

```bash
vigi-tools <tool> uninstall
```

### Notes on BLE devices

**Low battery warning is only supported for Teltonika Eye Beacon, as those payloads may be vendor-specific.**

I had a hard time finding beacons that aren't from AliExpress, with configuration apps that may or may not be reliable, so I want to point out examples I've found: Teltonika Eye Beacon (Lithuania), Blue Charm BC04P (USA)

The key thing to watch out for is configurable Tx (transmission strength), interval, overall battery time AND docs on vendor payloads for reading battery info - if you want to contribute code for your device (see e.g. [Teltonika Eye Beacon docs](https://wiki.teltonika-gps.com/view/EYE_SENSOR_/_BTSMP1#Sensor_advertising)).

In an apartment building with concrete walls, you may need to use very high power to get through just one wall.

After configuring and initial checks with `vigi-tools presence`, I recommend running `vigi-tools presence | grep nobody` for a few days (you should see no output when your BLE device is in range) to ensure that motion detection won't turn on randomly while you're home.

For me, that required maximum transmission strength (8 dB) at 1 sec. interval but with a 5 sec. presence check interval. So, realistically, collecting up to 4 samples.

### Note on using SES

I recommend creating an IAM user with something like the following policy, so that if the token leaks, an attacker can only send emails to you:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*",
      "Condition": {
        "ForAllValues:StringEquals": {
          "ses:Recipients": ["your@email.com"]
        },
        "StringEquals": {
          "ses:FromAddress": "your@email.com"
        }
      }
    }
  ]
}
```
