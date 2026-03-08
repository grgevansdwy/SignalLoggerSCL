import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// ─── Firebase Admin Init ──────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ─── Thresholds (same as frontend) ───────────────────────────
const RSSI_ALERT    = -90;
const RSRQ_ALERT    = -15;
const RSRP_ALERT    = -100;
const SINR_ALERT    = 0;
const PING_ALERT    = 150;
const BATTERY_ALERT = 5;

function computeStatus({ rssi, rsrq, rsrp, sinr, ping, battery }) {
  if (
    (rssi    != null && rssi    < RSSI_ALERT)    ||
    (rsrq    != null && rsrq    < RSRQ_ALERT)    ||
    (rsrp    != null && rsrp    < RSRP_ALERT)    ||
    (sinr    != null && sinr    < SINR_ALERT)    ||
    (ping    != null && ping    > PING_ALERT)    ||
    (battery != null && battery < BATTERY_ALERT)
  ) {
    return "No-Go";
  }
  return "Go";
}

// ─── App ──────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── Auth Middleware ──────────────────────────────────────────
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── POST /logs ───────────────────────────────────────────────
app.post("/logs", requireApiKey, async (req, res) => {
  const { deviceId, readings } = req.body;

  if (!deviceId || !Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({
      error: "Body must have deviceId (string) and readings (non-empty array)",
    });
  }

  const batch = db.batch();
  const errors = [];

  readings.forEach((r, i) => {
    if (!r.timestamp) {
      errors.push(`readings[${i}]: missing timestamp`);
      return;
    }

    const rssi    = r.rssi    != null ? Number(r.rssi)    : null;
    const rsrq    = r.rsrq    != null ? Number(r.rsrq)    : null;
    const rsrp    = r.rsrp    != null ? Number(r.rsrp)    : null;
    const sinr    = r.sinr    != null ? Number(r.sinr)    : null;
    const ping    = r.ping    != null ? Number(r.ping)    : null;
    const battery = r.battery != null ? Number(r.battery) : null;

    const doc = {
      timestamp: admin.firestore.Timestamp.fromDate(new Date(r.timestamp)),
      deviceId,
      rssi,
      rsrq,
      rsrp,
      sinr,
      ping,
      battery,
      gps: r.gps?.lat != null && r.gps?.lng != null
        ? { lat: Number(r.gps.lat), lng: Number(r.gps.lng) }
        : null,
      status: computeStatus({ rssi, rsrq, rsrp, sinr, ping, battery }),
    };

    const ref = db.collection("logs").doc();
    batch.set(ref, doc);
  });

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  try {
    await batch.commit();
    res.status(201).json({
      message: `${readings.length} log(s) written for device ${deviceId}`,
    });
  } catch (err) {
    console.error("[SCL API] Firestore error:", err);
    res.status(500).json({ error: "Failed to write to Firestore" });
  }
});

// ─── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SCL API running on port ${PORT}`));
