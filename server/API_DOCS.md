# SCL Signal Logger — API Documentation

This is the backend API for the **Seattle City Light Cellular Reliability Data Logger**.
It receives signal quality readings from field devices and stores them in Firestore,
where they appear live on the dashboard.

---

## Base URL

When running locally:
```
http://localhost:3001
```

When deployed, replace with your server's URL (e.g. `https://scl-api.onrender.com`).

---

## Authentication

Every request must include your API key in the request header:

```
x-api-key: cad9f626033c3a612bb689710cef8499728dc6a1ee9f38fc771ecaa9cd862e66
```

Requests without a valid key will get a `401 Unauthorized` response.

---

## Endpoints

### `GET /health`

Check if the server is running.

**Request**
```
GET /health
```

**Response**
```json
{ "status": "ok" }
```

---

### `POST /logs`

Submit a batch of signal readings for one device.
Call this once per hour with up to 12 readings (one every 5 minutes).

**Headers**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `x-api-key` | your API key |

**Request Body**

```json
{
  "deviceId": "SCL-001",
  "readings": [
    {
      "timestamp": "2026-03-08T10:00:00Z",
      "rssi": -85,
      "rsrq": -12,
      "rsrp": -95,
      "sinr": 5,
      "ping": 80,
      "battery": 90,
      "gps": {
        "lat": 47.6062,
        "lng": -122.3321
      }
    },
    {
      "timestamp": "2026-03-08T10:05:00Z",
      "rssi": -88,
      "rsrq": -13,
      "rsrp": -97,
      "sinr": 4,
      "ping": 95,
      "battery": 89,
      "gps": {
        "lat": 47.6063,
        "lng": -122.3322
      }
    }
  ]
}
```

**Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deviceId` | string | Yes | Device identifier (e.g. `SCL-001`) |
| `readings` | array | Yes | Array of reading objects (min 1) |
| `readings[].timestamp` | string (ISO 8601 UTC) | Yes | Time of reading — e.g. `"2026-03-08T10:00:00Z"` |
| `readings[].rssi` | number | No | Received Signal Strength Indicator (dBm) |
| `readings[].rsrq` | number | No | Reference Signal Received Quality (dB) |
| `readings[].rsrp` | number | No | Reference Signal Received Power (dBm) |
| `readings[].sinr` | number | No | Signal to Interference & Noise Ratio (dB) |
| `readings[].ping` | number | No | Latency in milliseconds |
| `readings[].battery` | number | No | Battery — values > 5 treated as %, values ≤ 5 treated as voltage (V) |
| `readings[].gps` | object | No | `{ "lat": number, "lng": number }` |

> All signal fields are optional individually, but you should send whatever your device collects.

**Success Response — `201 Created`**

```json
{
  "message": "12 log(s) written for device SCL-001"
}
```

**Error Responses**

| Status | Meaning |
|--------|---------|
| `400 Bad Request` | Missing `deviceId`, empty `readings`, or missing `timestamp` in a reading |
| `401 Unauthorized` | Missing or wrong API key |
| `500 Internal Server Error` | Firestore write failed |

```json
{ "error": "Body must have deviceId (string) and readings (non-empty array)" }
```

---

## Status Auto-Computation

You do **not** need to send a `status` field. The API automatically computes it as `"Go"` or `"No-Go"` for each reading based on these thresholds:

| Metric | No-Go Condition |
|--------|----------------|
| RSSI | < −90 dBm |
| RSRQ | < −15 dB |
| RSRP | < −100 dBm |
| SINR | < 0 dB |
| Ping | > 150 ms |
| Battery | < 5% |

If **any** threshold is breached, the reading is marked `No-Go`.

---

## Example — cURL

```bash
curl -X POST https://your-server-url/logs \
  -H "Content-Type: application/json" \
  -H "x-api-key: cad9f626033c3a612bb689710cef8499728dc6a1ee9f38fc771ecaa9cd862e66" \
  -d '{
    "deviceId": "SCL-001",
    "readings": [
      {
        "timestamp": "2026-03-08T10:00:00Z",
        "rssi": -85,
        "rsrq": -12,
        "rsrp": -95,
        "sinr": 5,
        "ping": 80,
        "battery": 90,
        "gps": { "lat": 47.6062, "lng": -122.3321 }
      }
    ]
  }'
```

## Example — Python

```python
import requests
from datetime import datetime, timezone

API_URL = "https://your-server-url/logs"
API_KEY = "cad9f626033c3a612bb689710cef8499728dc6a1ee9f38fc771ecaa9cd862e66"

payload = {
    "deviceId": "SCL-001",
    "readings": [
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "rssi": -85,
            "rsrq": -12,
            "rsrp": -95,
            "sinr": 5,
            "ping": 80,
            "battery": 90,
            "gps": { "lat": 47.6062, "lng": -122.3321 }
        }
    ]
}

response = requests.post(API_URL, json=payload, headers={"x-api-key": API_KEY})
print(response.json())
```

---

## Running the Server Locally

### Prerequisites
- Node.js v18+

### Steps

1. Unzip the `server` folder
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```
4. Fill in the values in `.env`:
   ```
   API_KEY=cad9f626033c3a612bb689710cef8499728dc6a1ee9f38fc771ecaa9cd862e66
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account", ...}  ← paste the full JSON as one line
   PORT=3001
   ```
5. Start the server:
   ```bash
   npm start
   ```

Server will be available at `http://localhost:3001`.
