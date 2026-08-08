# VIGI MULTITRANS Timeout — findings (verified against real camera)

## FIXED: digest auth was silently failing

Camera's RTSP parser only accepts **quoted** digest params.

- `algorithm=SHA-256, qop=auth, nc=00000001` (RFC 7616 style) -> 401
- `algorithm="SHA-256", qop="auth", nc="00000001"` -> 200 OK + `Session: <id>`
  Fix applied in src/vigi/digest.ts: quote every field.

## Verified device behaviour (port 554, MULTITRANS rtsp://<host>/multitrans)

- OPTIONS -> 200, Public: OPTIONS, DESCRIBE, SETUP, TEARDOWN, PLAY, PAUSE,
  GET_PARAMETER, SET_PARAMETER, MULTITRANS
- MULTITRANS without body -> 401 challenge (Digest, SHA-256, qop=auth)
- Body `{"type":"request","seq":"1"}` (no params key) -> 200 OK,
  `{"type":"response","seq":1,"params":{"error_code":-501,...}}` (-501 = "Json error")
- Body without `type` (e.g. `{"method":"download","params":{...}}`) -> -501
- **Any body containing a nested `params` object -> no reply at all**
  (connection stays alive; a later request on the same socket is answered)
- Body length is not the trigger (586 B body answered fine)
- getUserID / getDownloadStatus -> errCode -10030 (unsupported); getStreamPort -> 554

## Camera fragility

Sending `{"type":"request","seq":"1","params":"x"}` (params as a JSON string)
crashed the RTSP daemon — port 554 then refused all connections.
Needs a camera restart before further probing.

## Open question

Correct JSON envelope for `download`. Spec 2.1.3 says
`{"type":"request","seq":"1","params":{"method":"download","params":{...}}}`
but the device never answers that. Next ideas: SETUP/PLAY handshake before
MULTITRANS, or a different key name for the nested params.
