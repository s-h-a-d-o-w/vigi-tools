# 2. OpenAPI Transaction

## 2.1 Request Format

### 2.1.1 The request format of OpenAPI Discovery

The OpenAPI Discovery Protocol (ODP) local service port is 23001, and the protocol type field in the Ethernet package is 0x7210.

The request packet must be constructed according to the OpenAPI Discovery Protocol. For details, see Section 3.

### 2.1.2 The request format of OpenAPI control interface

The VIGI OpenAPI request format is as follows:

```
POST https://device_addr:port/stok=xx HTTP/1.1
VIGI IPC Open API Document
Content-Type: application/json
Content-Length: xxx
{"method":"xx","params":{…}}
// or {"method":"xx"}
```

The VIGI OpenAPI information must be a json string containing 'method' and 'method' parameters. For details, see section -- 4.OpenAPI Interface.

Port opened by VIGI for the openAPI control interface can be obtained using the OpenAPI Discovery Protocol, the default value is 20443.

### 2.1.3 The request format of OpenAPI stream interface

The VIGI OpenAPI stream request format is as follows:

```
MULTITRANS rtsp://ip/multitrans RTSP/1.0
CSeq: 1
Content-Type: application/json
Content-Length: xxx
{"type":"request","seq":"1","params":{"method":"xx"}}
```

The VIGI OpenAPI stream information must be a json string. For details, see section -- 5.OpenAPI Stream interface.

The port corresponding to the OpenAPI stream interface is the port corresponding to the rtsp. The default port is 554. This port is available through the 'getStreamPort' interface.

## 2.2 Authentication

### 2.2.1 Method: doAuth

Method: doAuth indicates the authentication before using various OpenAPI control interfaces. After the authentication is successful, 'stok' is returned. 'stok' is required when using all types of openAPI interfaces (except doAuth).

The steps to use doAuth are as follows:

**Step 1:**

```
POST https://device_addr:port HTTP/1.1
Content-Type: application/json
Content-Length: xxx
{
  "method":"doAuth",
  "params":null
}
```

**Reply:**

```json
{
  "method": "doAuth",
  "authenticate": {
    "realm": "xxx",
    "nonce": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "algorithm": "xxx",
    "uri": "xxx",
    "method": "xxx"
  },
  "errCode": -10020
}
```

**Step 2:**

```
POST https://device_addr:port HTTP/1.1
Content-Type: application/json
Content-Length: xxx
{
  "method": "doAuth",
  "params": {
    "nonce": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "response": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

**Reply:**

```json
{
  "method": "doAuth",
  "stok": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "errCode": 0
}
```

In the second step, the response is calculated from the admin password and the authenticate returned by the IPC. If the algorithm returned by the ipc is SHA-256, the calculation method is as follows:

```
A1 = SHA256(admin:realm:password)
A2 = SHA256(method:uri)
response = SHA256(A1:nonce:A2)
```

Port opened by VIGI for the openAPI control interface can be obtained using the OpenAPI Discovery Protocol, the default value is 20443.

### 2.2.2 Digest Authentication

Digest authentication is used to establish OpenAPI stream connections. The client sends the request without authentication, and the server replies the message with the nonce. The client then sends a request with authorization label, which contains the response calculated by using information such as nonce. The server authenticates the packet after receiving the Authorization label, and continues to process the packet if it passes. Otherwise, a 401 Unauthorized error is displayed.

The process is as follows:

**No authentication request:**

```
C->S: MULTITRANS rtsp://ip/multitrans RTSP/1.0
      CSeq: 1
      Content-Type: application/json
      Content-Length: xxx
```

**Reply:**

```
S->C: RTSP/1.0 401 Unauthorized
      CSeq: 1
      WWW-Authenticate: Digest realm="<Request domain>", nonce="<nonce>", algorithm="SHA-256", qop="auth"
```

**Authentication request:**

```
C->S: MULTITRANS rtsp://ip/multitrans RTSP/1.0
      CSeq: 1
      Authorization: Digest username="<username>", realm="<Request domain>",
                     nonce="<A random 32-bit character string returned by the Server>",
                     uri="rtsp://ip/multitrans", qop="auth", cnonce="<cnonce>", nc="<nc>",
                     response=""
      Content-Type: application/json
      Content-Length: xxx
```

**Reply:**

```
S->C: RTSP/1.0 200 OK
      CSeq: 1
      Content-Type: application/json
      Content-Length: xxx
```

## 2.3 Data Transmission

The data transfer occurs after IPC successfully responds to the relevant request. Using the idea of RTP Over TCP. The format is as follows:

```
$ (1B) Chn ID (1B) Length (2B)
```

# 4.

### 4.1.1 doAuth

**Command:** `doAuth`

**Description:** This API is used for Auth, requires the password of admin.

#### Request Parameters

| Parameter  | Type   | Description                                                                                                                                                                                                                                                                               |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nonce`    | String | The value needs to be the same as the nonce returned by the IPC.                                                                                                                                                                                                                          |
| `response` | String | The value is calculated based on the password of the IPC and the authenticate field returned. If the algorithm returned by the ipc is SHA-256, the calculation method is as follows:<br/>A1 = SHA256(admin:realm:password)<br/>A2 = SHA256(method:uri)<br/>response = SHA256(A1:nonce:A2) |

#### Response Parameters

| Parameter   | Type   | Description                                                                                                                                              |
| ----------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stok`      | String | Token required for control protocol instruction authentication. All other control interfaces need to carry tokens. The token aging time is half an hour. |
| `realm`     | String | Calculate the value required for the response.                                                                                                           |
| `nonce`     | String | Calculate the value required for the response. In addition, the nonce needs to be sent synchronously with the response when sending the request.         |
| `algorithm` | String | The algorithm used to calculate the response.                                                                                                            |
| `method`    | String | Calculate the value required for the response.                                                                                                           |
| `uri`       | String | Calculate the value required for the response.                                                                                                           |

#### Example

The process of using this API is as follows:

First, you need to send a doAuth request with empty params, and the device will return the fields required for authentication.

**Request:**

```json
{
  "method": "doAuth",
  "params": null
}
```

**Response:**

```json
{
  "method": "doAuth",
  "authenticate": {
    "realm": "TP-LINK IP-Camera",
    "nonce": "6220dc9a1eea3ad4608a6a780a7958eb",
    "algorithm": "SHA-256",
    "uri": "doAuth",
    "method": "POST"
  },
  "errCode": -10020
}
```

The response is then calculated based on these fields, and a doAuth request with nonce and response is sent.

**Request:**

```json
{
  "method": "doAuth",
  "params": {
    "nonce": "6220dc9a1eea3ad4608a6a780a7958eb",
    "response": "8fd7dad29e3fe169a566c164b83d8cf8671b9f1e42a179e6ee6c24c04acbbf4b"
  }
}
```

**Response:**

```json
{
  "method": "doAuth",
  "stok": "ym(WCEIUs8n4uv3*4J3SJ4o9v3nx94Ez",
  "errCode": 0
}
```

### 4.11.1 getMediaList

**Command:** `getMediaList`

**Description:** This API is used for getting media list

#### Request Parameters

| Parameter     | Type          | Description                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start_time`  | String        | The start time of the query, in seconds since 1970-01-01                                                                                                                                                                                                                                                     |
| `end_time`    | String        | The end time of the query, in seconds since 1970-01-01                                                                                                                                                                                                                                                       |
| `event_type`  | Array<string> | Event type filter. Possible values: `Timing`, `MotionDetection`, `TamperDetection`, `CrossLineDetection`, `InvasionDetection`, `AreaEntryDetection`, `AreaLeaveDetection`, `PeopleDetection`, `VehicleDetection`, `DropAndTakeDetection`, `LoiterDetection`, `SceneChangeDetection`, `AudioAnomalyDetection` |
| `media_type`  | Array<string> | Media file type. Currently only supports `["video"]`                                                                                                                                                                                                                                                         |
| `start_index` | Int           | _(Optional)_ Query start index (0-based). Must be paired with `max_num`                                                                                                                                                                                                                                      |
| `max_num`     | Int           | _(Optional)_ Maximum number of results to return. Must be paired with `start_index`                                                                                                                                                                                                                          |
| `user_id`     | Int           | _(Optional)_ User ID (returned by `getUserID` command)                                                                                                                                                                                                                                                       |

#### Response Parameters

| Parameter    | Type          | Description                                                                                    |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------- |
| `error_code` | Int           | Error code                                                                                     |
| `start_time` | Array<string> | Start time of each media, in seconds since 1970-01-01. Default: `""`                           |
| `end_time`   | Array<string> | End time of each media, in seconds since 1970-01-01. Default: `""`                             |
| `size`       | Array<int>    | Size of each file in bytes. Default: `0`                                                       |
| `file_id`    | Array<string> | Unique file identifier for each media. Default: `""`                                           |
| `event_type` | Array<string> | Event type of each media                                                                       |
| `media_type` | Array<string> | Media file type of each media                                                                  |
| `index`      | Array<int>    | _(Optional)_ Index number of each result, starting from `start_index`. Default: `0`            |
| `rest_num`   | String        | _(Optional)_ Number of remaining cached media. Returned when supported by device               |
| `total_num`  | String        | _(Optional)_ Total number of media matching search criteria. Returned when supported by device |

#### Example Request

```json
{
  "method": "getMediaList",
  "params": {
    "start_time": "1688350527",
    "end_time": "1688351757",
    "event_type": ["MotionDetection", "DropAndTakeDetection"],
    "media_type": ["video"],
    "start_index": 0,
    "max_num": 20
  }
}
```

#### Example Response

```json
{
  "media": {
    "total_num": "2",
    "start_time": ["1688350527", "1688351737"],
    "end_time": ["1688350546", "1688351757"],
    "size": [3467800, 963784],
    "file_id": ["00010000000001", "00010000000002"],
    "event_type": ["MotionDetection", "DropAndTakeDetection"],
    "media_type": ["video", "video"]
  },
  "error_code": 0
}
```

# 5. OpenAPI Stream interface

The interfaces in this section are based on the RTSP protocol. See 2.1.3 for the format
of the request. Streaming data is transmitted using the RTP over TCP.

## 5.3 download

**Command:** `download`

**Description:** This API is used for downloading media. You need to use the `searchVideoList` or `getMediaList` interfaces to obtain related information before downloading. If the parameters of the download video are inconsistent with the parameters of the current response, the device will send a notification message.

#### Request Parameters

| Parameter    | Type          | Description                                                                                                                                                                                                                                                                                                       |
| ------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client_id`  | Int           | Range: [1, 32]                                                                                                                                                                                                                                                                                                    |
| `file_id`    | String        | _(Optional)_ Unique identifier for a media file, but can be corroborated by `start_time`, `end_time`, and `event_type`. Available from `getMediaList`                                                                                                                                                             |
| `event_type` | Array<string> | Event type to download. Possible values: `Timing`, `MotionDetection`, `TamperDetection`, `CrossLineDetection`, `InvasionDetection`, `AreaEntryDetection`, `AreaLeaveDetection`, `PeopleDetection`, `VehicleDetection`, `DropAndTakeDetection`, `LoiterDetection`, `SceneChangeDetection`, `AudioAnomalyDetection` |
| `media_type` | String        | Media type. Value: `"video"` (Currently, the download interface only supports media_type with a value of "video")                                                                                                                                                                                                 |
| `start_time` | String        | Start time, the number of seconds since 1970-01-01                                                                                                                                                                                                                                                                |
| `end_time`   | String        | End time, the number of seconds since 1970-01-01                                                                                                                                                                                                                                                                  |

#### Response Parameters

| Parameter             | Type   | Description                                                                                                                          |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `error_code`          | Int    | Error code                                                                                                                           |
| `session_id`          | String | Session identifier for the download                                                                                                  |
| `range`               | String | Byte range format: `"x-y/n"`                                                                                                         |
| `interleaved`         | Array  | Array of interleaved stream information                                                                                              |
| `interleaved_id`      | String | _(in interleaved array)_ ID segment format: `"a-b"` (occupies ids from a to b, typically video then audio), or `"a"` (occupies id a) |
| `channel`             | Int    | _(in interleaved array)_ Channel number                                                                                              |
| `av_config`           | Array  | Audio and video configuration array                                                                                                  |
| `channel`             | Int    | _(in av_config array)_ Channel number                                                                                                |
| `video_codec`         | String | _(in av_config array)_ Video codec (e.g., "H264")                                                                                    |
| `audio_codec`         | String | _(in av_config array)_ Audio codec (e.g., "G711alaw")                                                                                |
| `audio_sampling_rate` | String | _(in av_config array)_ Audio sampling rate (e.g., "8")                                                                               |
| `audio_bitwidth`      | String | _(in av_config array)_ Audio bitwidth (e.g., "16")                                                                                   |
| `audio_channels`      | String | _(in av_config array)_ Number of audio channels (e.g., "1")                                                                          |

### Example Request

```json
{
  "method": "download",
  "params": {
    "client_id": 1,
    "start_time": "123123123",
    "end_time": "1231231231",
    "file_id": "01230123",
    "event_type": ["MotionDetection"],
    "media_type": "video"
  }
}
```

### Example Response

```json
{
  "error_code": 0,
  "session_id": "xxx",
  "range": "x-y/n",
  "interleaved": [
    {
      "channel": 0,
      "interleaved_id": "0-1"
    }
  ],
  "av_config": [
    {
      "channel": 0,
      "video_codec": "H264",
      "audio_codec": "G711alaw",
      "audio_sampling_rate": "8",
      "audio_bitwidth": "16",
      "audio_channels": "1"
    }
  ]
}
```

### Notification

If the parameters of the download video are inconsistent with the parameters of the current response (for example, `video_codec`), the device will send a notification message:

```json
{
  "type": "notification",
  "params": {
    "event_type": "channel_preview_params",
    "channels": [0],
    "resolutions": ["HD"],
    "audio": ["enable"],
    "av_config": [
      {
        "channel": 0,
        "video_codec": "H264",
        "audio_codec": "G711alaw",
        "audio_sampling_rate": "8",
        "audio_bitwidth": "16"
      }
    ]
  }
}
```
