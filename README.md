# SCL Cellular Reliability Data Logger

A real-time dashboard for monitoring cellular signal quality logs, built for **Seattle City Light** internal use.

---

## Prerequisites

Make sure you have the following installed before getting started:

| Tool | Minimum Version | Download |
|------|----------------|---------|
| [Node.js](https://nodejs.org/) | v18+ | https://nodejs.org/ |
| npm | v9+ | Included with Node.js |

To check if you already have them:

```bash
node --version
npm --version
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd SCLWeb
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Firebase

Copy the example environment file and fill in your Firebase project credentials:

```bash
cp .env.example .env
```

Then open `.env` and replace the placeholder values with your actual Firebase config:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

> You can find these values in your [Firebase Console](https://console.firebase.google.com/) under **Project Settings → General → Your apps**.

### 4. Run the development server

```bash
npm run dev
```

The app will be available at **http://localhost:5173**

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the local development server |
| `npm run build` | Build the app for production (output in `/dist`) |
| `npm run preview` | Preview the production build locally |

---

## Project Structure

```
SCLWeb/
├── public/
│   └── scl_logo.svg          # Favicon / browser tab logo
├── src/
│   ├── assets/
│   │   └── scl_logo.svg      # SCL logo used in the header
│   ├── components/
│   │   └── Dashboard.jsx     # Main dashboard component
│   ├── firebase.js           # Firebase initialization
│   ├── index.css             # Global styles (Tailwind + custom)
│   └── main.jsx              # React entry point
├── .env                      # Local environment variables (not committed)
├── .env.example              # Environment variable template
├── index.html                # HTML entry point
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## Tech Stack

- **React 18** — UI framework
- **Vite** — Build tool and dev server
- **Tailwind CSS** — Utility-first styling
- **Firebase Firestore** — Real-time database
- **Lucide React** — Icons

---

## Firestore Data Structure

Logs are stored in the `logs` collection. Each document has the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | Timestamp | Date and time of the log (UTC) |
| `deviceId` | string | Device identifier (e.g. `SCL-001`) |
| `rssi` | number | Received Signal Strength Indicator (dBm) |
| `rsrq` | number | Reference Signal Received Quality (dB) |
| `rsrp` | number | Reference Signal Received Power (dBm) |
| `sinr` | number | Signal to Interference & Noise Ratio (dB) |
| `ping` | number | Latency in milliseconds |
| `battery` | number | Battery level — values > 5 treated as %, values ≤ 5 treated as voltage (V) |
| `gps` | object | `{ lat, lng }` coordinates |
| `status` | string | Auto-computed — `"Go"` or `"No-Go"` |

### Status thresholds (auto-computed on entry)

A log is marked **No-Go** if any of the following are true:

| Metric | No-Go condition |
|--------|----------------|
| RSSI | < −90 dBm |
| RSRQ | < −15 dB |
| RSRP | < −100 dBm |
| SINR | < 0 dB |
| Ping | > 150 ms |
| Battery | < 5% |
