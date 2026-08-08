# VIGI MULTITRANS — findings (verified against a real VIGI C440 2.0)

## Device

`getDeviceInfo` -> alias "VIGI C440 2.0", type SECUR.IPCAM, model VIGI C440.
Control API on 20443 (https), stream API on 554 (`rtsp://<host>/multitrans`).

## FIXED: digest auth was silently failing

Camera's RTSP parser only accepts **quoted** digest params.

- `algorithm=SHA-256, qop=auth, nc=00000001` (RFC 7616 style) -> 401
- `algorithm="SHA-256", qop="auth", nc="00000001"` -> 200 OK + `Session: <id>`
  Fix applied in src/vigi/digest.ts: quote every field.

## SOLVED: the MULTITRANS JSON envelope

The VIGI-SPEC.md shape `{"type":"request","seq":"1","params":{"method":"download","params":{…}}}`
is **wrong** for this firmware — it is silently dropped.

The real shape (found via `AlexxIT/go2rtc` `pkg/multitrans/client.go`) is TP-Link's
module style, with a **numeric** `seq`:

```json
{"type":"request","seq":0,"params":{"method":"get","<module>":{ … }}}
```

Verified working call (the first params request the camera ever answered):

```
-> {"type":"request","seq":0,"params":{"method":"get","talk":{"mode":"full_duplex"}}}
<- {"type":"response", "seq":0, "params":{"error_code":0, "session_id":"0"}}
```

go2rtc also sends an `X-Client-UUID: <uuid>` header on every request and echoes
the `Session:` id from the 200 OK. Both are now sent by temp/multitrans-probe.ts.

### Reply taxonomy observed

| params shape                                  | reply             |
| --------------------------------------------- | ----------------- |
| `{"method":"get","talk":{…}}`                 | `error_code 0`    |
| `{"method":"get","download":{…}}`             | `error_code -502` |
| `{"method":"do","download":{"start":{…}}}`    | `error_code -502` |
| `{"method":"do","playback":{"start":{…}}}`    | `error_code -502` |
| `{"method":"get","system":{…}}`               | no reply          |
| no `params` key at all                        | `error_code -501` |
| spec-style `{"method":"download","params":…}` | no reply          |

Working theory: `-502` = module known but the inner structure is wrong;
**no reply** = module unknown. If that holds, `download` and `playback` both
exist and only the inner payload shape is still unknown.

## Ruled out (all tested against the live device)

- `Session:` header echoed on the request — no effect
- `session_id` in the JSON (top level, beside `method`, inside inner params,
  hex, decimal, `"0"`) — no effect
- `client_id` 1..12 — all silent
- OPTIONS/DESCRIBE/SETUP/PLAY handshake before MULTITRANS (SETUP/PLAY return
  400 Bad Request on `/multitrans`)
- `Transport: RTP/AVP/TCP;unicast;interleaved=0-1` on the MULTITRANS request
- Body framing: trailing CRLF, trailing NUL, spaces after commas, pretty
  printing, body in a separate TCP write — all silent
- Real vs. placeholder `file_id` — the placeholder was in fact the real id
- Media backend health: `DESCRIBE rtsp://host/stream1` and `/stream2` both
  return valid SDP (H264 + PCMA), so the RTSP/media daemon is fine.
  `DESCRIBE /multitrans` -> 404 Stream Not Found (expected).

## Control API surface on this firmware

Supported: `doAuth`, `getDeviceInfo`, `getStreamPort` (-> 554),
`getMediaList`, `searchVideoList` (returns -10010 without proper params).
Unsupported (-10030): `getUserID`, `getDownloadStatus`, `getBasicInfo`,
`getCapability`, `getStorageInfo`, `getSdCardInfo`, `getEventList`,
`getClientID`, `getPreviewAuth`, `getPlaybackAuth`, `openStream`,
`startDownload`, `download`, `getOpenApiVersion`, `multipleRequest`.

`getMediaList` currently returns 1 recording:
`file_id 00010000000000`, 1786196152 -> 1786196170, 3318648 B, MotionDetection.

## Camera fragility

Sending `{"type":"request","seq":"1","params":"x"}` (params as a JSON **string**)
crashed the RTSP daemon — port 554 then refused all connections until a restart.
Never send a non-object value for `params`.
The device also closes the connection ~20s after a request it refuses to answer.

## Next steps

1. Enumerate modules with temp/probe-modules.ts (`{"method":"get","<mod>":{"mode":"x"}}`)
   to separate `-502` (known) from silence (unknown). This run was interrupted.
2. For the modules that answer `-502`, brute the inner shape. Leads worth trying:
   - `{"method":"get","download":{"name":["capability"]}}` with other section
     names (`status`, `info`, `config`)
   - `{"method":"do","download":{"client_id":1,"file_id":…}}` (params flat, not
     nested under `start`)
   - mirror the `talk` shape exactly: `{"method":"get","download":{"mode":"…"}}`
3. Check `bingooo/hass-tplink-ipc` and go2rtc issue #1724 — they likely contain
   a fuller list of module/section names for this JSON API.
4. Once `download` answers with `error_code 0`, the reply should carry
   `interleaved` / `av_config`; src/vigi/download.ts already parses that and the
   RTP-over-TCP depacketizer is in place.

## Probe scripts (temp/)

- `multitrans-probe.ts` — reusable MULTITRANS client (auth, session,
  X-Client-UUID, auto reconnect, silent-drop detection). Use this for new probes.
- `probe-modules.ts` — module enumeration (step 1 above)
- `probe-go2rtc-style.ts` — the run that cracked the envelope
- `probe-body-matrix.ts`, `probe-nesting.ts`, `probe-framing.ts`,
  `probe-session-id.ts`, `probe-client-id.ts`, `probe-handshake.ts` — negative
  results, kept as evidence
- `probe-methods.ts` — control API method sweep
- `probe-stream1.ts` — plain RTSP DESCRIBE control experiment
- `probe-download-real.ts` — end-to-end attempt with a real media entry
