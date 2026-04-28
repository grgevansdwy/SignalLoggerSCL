import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { DEVICE_IDS, parseTimestampId } from "../deviceConfig";
import sclLogo from "../assets/scl_logo.svg";
import {
  Signal,
  Battery,
  AlertTriangle,
  CheckCircle,
  Activity,
  Search,
  MapPin,
  Zap,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────
const RSSI_ALERT = -90;
const RSRQ_ALERT = -15;
const RSRP_ALERT = -100;
const SINR_ALERT = 0;
const PING_ALERT = 150;
const BATTERY_ALERT = 5;

const SEATTLE_CENTER = { lat: 47.6062, lng: -122.3321 };
const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const MAP_OPTIONS = {
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  zoomControlOptions: { position: 7 }, // LEFT_BOTTOM
};

// ─── Helpers ──────────────────────────────────────────────────
const isLogAlert = (log) =>
  (log.rssi != null && log.rssi < RSSI_ALERT) ||
  (log.rsrq != null && log.rsrq < RSRQ_ALERT) ||
  (log.rsrp != null && log.rsrp < RSRP_ALERT) ||
  (log.sinr != null && log.sinr < SINR_ALERT) ||
  (log.ping != null && log.ping > PING_ALERT) ||
  (log.battery != null &&
    (log.battery > 5 ? log.battery : (log.battery / 4.2) * 100) <
      BATTERY_ALERT);

const formatBattery = (val) => {
  if (val == null) return "—";
  return val > 5 ? `${Math.round(val)}%` : `${Number(val).toFixed(2)} V`;
};

const formatLastSeen = (d) => {
  if (!d) return "—";
  return (
    d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }) + " UTC"
  );
};

const normalizeLog = (d, deviceId) => {
  const data = d.data();
  const rawBattery = data.battery ?? null;
  const battery =
    rawBattery != null && rawBattery > 1000 ? rawBattery / 1000 : rawBattery;
  const gps =
    data.gps ??
    (data.latitude != null
      ? { lat: data.latitude, lng: data.longitude }
      : null);
  return {
    id: d.id,
    deviceId,
    ...data,
    battery,
    gps,
    _parsedTimestamp: parseTimestampId(d.id),
  };
};

// ─── MapView ──────────────────────────────────────────────────
export default function MapView() {
  const navigate = useNavigate();
  const [allDeviceLogs, setAllDeviceLogs] = useState({});
  const [search, setSearch] = useState("");
  const [mapInstance, setMapInstance] = useState(null);
  const markersRef = useRef([]);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "",
  });

  const onMapLoad = useCallback((map) => {
    setMapInstance(map);
  }, []);

  useEffect(() => {
    const logsMap = {};
    const unsubs = DEVICE_IDS.map((deviceId) =>
      onSnapshot(
        collection(db, deviceId),
        (snap) => {
          logsMap[deviceId] = snap.docs.map((d) => normalizeLog(d, deviceId));
          setAllDeviceLogs({ ...logsMap });
        },
        (err) => console.error(`[MapView] ${deviceId}:`, err),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Build one summary object per device
  const deviceSummaries = useMemo(() => {
    return Object.entries(allDeviceLogs).map(([deviceId, logs]) => {
      const sorted = [...logs].sort(
        (a, b) =>
          (b._parsedTimestamp?.getTime() ?? 0) -
          (a._parsedTimestamp?.getTime() ?? 0),
      );
      const latest = sorted[0] ?? null;
      const alertCount = logs.filter(isLogAlert).length;
      // Walk back through history to find the most recent valid GPS fix
      const latestGpsLog = sorted.find((log) => {
        const g = log.gps;
        return (
          g && g.lat != null && g.lng != null && !(g.lat === 0 && g.lng === 0)
        );
      });
      const gps = latestGpsLog?.gps ?? null;
      return {
        deviceId,
        latest,
        alertCount,
        hasAlert: latest ? isLogAlert(latest) : false,
        totalLogs: logs.length,
        gps,
      };
    });
  }, [allDeviceLogs]);

  const filteredSummaries = useMemo(
    () =>
      deviceSummaries.filter(
        (s) =>
          !search || s.deviceId.toLowerCase().includes(search.toLowerCase()),
      ),
    [deviceSummaries, search],
  );

  const totalLogs = deviceSummaries.reduce((a, s) => a + s.totalLogs, 0);
  const totalAlerts = deviceSummaries.reduce((a, s) => a + s.alertCount, 0);

  const handleDeviceSelect = useCallback(
    (deviceId) => navigate(`/device/${deviceId}`),
    [navigate],
  );

  const buildMarkerIcon = (hasAlert) => {
    const color = hasAlert ? "#ef4444" : "#22c55e";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="6" fill="white" fill-opacity="0.5"/>
    </svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(28, 40),
      anchor: new window.google.maps.Point(14, 40),
    };
  };

  // Imperatively manage markers so they survive map remounts after navigation
  useEffect(() => {
    if (!mapInstance || !window.google?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    deviceSummaries
      .filter((s) => s.gps)
      .forEach((s) => {
        const marker = new window.google.maps.Marker({
          position: { lat: s.gps.lat, lng: s.gps.lng },
          map: mapInstance,
          icon: buildMarkerIcon(s.hasAlert),
          title: s.deviceId,
        });
        marker.addListener("click", () => handleDeviceSelect(s.deviceId));
        markersRef.current.push(marker);
      });

    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
  }, [mapInstance, deviceSummaries, handleDeviceSelect]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ fontFamily: '"Open Sans", Verdana, sans-serif' }}
    >
      {/* ══ MAP (full screen) ══ */}
      <div className="absolute inset-0">
        {loadError ? (
          <MapError message={loadError.message} />
        ) : !isLoaded ? (
          <MapLoading />
        ) : (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={SEATTLE_CENTER}
            zoom={12}
            options={MAP_OPTIONS}
            onLoad={onMapLoad}
          />
        )}
      </div>

      {/* ══ FLOATING RIGHT PANEL ══ */}
      <div className="absolute top-6 right-4 bottom-6 w-96 flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="bg-[#003DA5] text-white px-4 py-3 flex-shrink-0 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <img
              src={sclLogo}
              alt="SCL"
              className="h-10 w-auto flex-shrink-0"
            />
            <div className="border-l border-white/20 pl-2.5 min-w-0">
              <p className="text-blue-200 text-[9px] font-semibold uppercase tracking-[0.18em] select-none">
                Seattle City Light
              </p>
              <h1 className="text-white font-bold text-sm leading-tight">
                Signal Quality Data Logger
              </h1>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex border-b border-gray-200 bg-gray-50/80 flex-shrink-0">
          {[
            {
              label: "Logs",
              value: totalLogs,
              icon: <Activity size={13} />,
              alert: false,
            },
            {
              label: "Alerts",
              value: totalAlerts,
              icon: <AlertTriangle size={13} />,
              alert: totalAlerts > 0,
            },
            {
              label: "Devices",
              value: deviceSummaries.length,
              icon: <Signal size={13} />,
              alert: false,
            },
          ].map(({ label, value, icon, alert }) => (
            <div
              key={label}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 border-r border-gray-200 last:border-r-0"
            >
              <span className={alert ? "text-red-500" : "text-[#003DA5]"}>
                {icon}
              </span>
              <span
                className={`font-bold text-base leading-none ${alert ? "text-red-600" : "text-gray-900"}`}
              >
                {value}
              </span>
              <span className="text-[9px] text-gray-400 uppercase tracking-wider">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-gray-200 flex-shrink-0">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search devices…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#003DA5]/40 focus:border-[#003DA5]"
            />
          </div>
        </div>

        {/* Device card list */}
        <div className="flex-1 overflow-y-auto">
          {filteredSummaries.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Signal size={36} className="mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm">
                {search ? "No devices match your search" : "No devices yet"}
              </p>
            </div>
          ) : (
            filteredSummaries.map((s) => (
              <DeviceCard
                key={s.deviceId}
                summary={s}
                onClick={() => handleDeviceSelect(s.deviceId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Device Card ──────────────────────────────────────────────
function DeviceCard({ summary, onClick }) {
  const { deviceId, latest, hasAlert, alertCount, gps } = summary;
  const gpsStr = gps
    ? `${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)}`
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-blue-50/60 active:bg-blue-100/50 transition-colors duration-100"
    >
      {/* Top row: device ID + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded bg-[#003DA5]/10">
            <Signal size={12} className="text-[#003DA5]" strokeWidth={2.5} />
          </span>
          <span className="font-bold text-sm text-[#003DA5] font-mono truncate">
            {deviceId}
          </span>
        </div>
        <span
          className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${
            hasAlert
              ? "bg-red-50 text-red-700 ring-red-300"
              : "bg-green-50 text-green-800 ring-green-300"
          }`}
        >
          {hasAlert ? (
            <AlertTriangle size={9} strokeWidth={2.5} />
          ) : (
            <CheckCircle size={9} strokeWidth={2.5} />
          )}
          {hasAlert ? "Alert" : "Go"}
        </span>
      </div>

      {/* Detail rows */}
      <div className="mt-1.5 pl-8 space-y-0.5">
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Battery size={11} className="text-gray-400" />
            {latest ? formatBattery(latest.battery) : "—"}
          </span>
          {alertCount > 0 && (
            <span className="text-red-500 font-semibold text-[10px]">
              {alertCount} alert{alertCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {gpsStr ? (
          <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono">
            <MapPin size={9} className="flex-shrink-0" />
            {gpsStr}
          </div>
        ) : (
          <div className="text-[10px] text-gray-300 italic">No GPS fix</div>
        )}

        <div className="text-[10px] text-gray-400">
          {latest ? formatLastSeen(latest._parsedTimestamp) : "No data"}
        </div>
      </div>
    </button>
  );
}

// ─── Map loading states ───────────────────────────────────────
function MapLoading() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 gap-4">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-4 border-[#003DA5]/20 border-t-[#003DA5] animate-spin" />
        <Zap className="absolute inset-0 m-auto text-[#003DA5]" size={20} />
      </div>
      <p className="text-[#003DA5] font-semibold text-sm">Loading Map…</p>
    </div>
  );
}

function MapError({ message }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 gap-3">
      <AlertTriangle size={40} className="text-red-400" />
      <p className="font-semibold text-gray-700">Map failed to load</p>
      <p className="text-xs text-red-500 font-mono max-w-xs text-center">
        {message}
      </p>
    </div>
  );
}
