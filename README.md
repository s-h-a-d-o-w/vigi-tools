# vigi-tools

CLI tools for a TP-Link VIGI camera, using its "Open API" (you have to enable this in the camera settings).

- `downloader` - syncs videos from the camera to a local directory. On error, delete the `.json` to retry. (Also provides the option to send e-mail notifications via AWS SES when downloads start and finish.)
- `presence` - pings the devices listed in `PRESENCE_DEVICES` once per
  `CHECK_INTERVAL_SECONDS` and turns motion detection off while any of them is on the
  network, back on once none are. (All sub-settings (e.g. sensitivity) you've set via web UI or elsewhere are retained.)

## Requirements (running, not building)

- Node.js
- ffmpeg globally available on PATH (for `downloader` only)

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
