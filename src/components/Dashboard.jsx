import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import sclLogo from "../assets/scl_logo.svg";
import {
  collection,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { DEVICE_IDS, parseTimestampId } from "../deviceConfig";
import {
  Signal,
  Battery,
  MapPin,
  Wifi,
  AlertTriangle,
  CheckCircle,
  Activity,
  Zap,
  ChevronDown,
  Download,
  Calendar,
  SlidersHorizontal,
} from "lucide-react";

// ─── Thresholds ──────────────────────────────────────────────
const RSSI_ALERT = -90;
const RSRQ_ALERT = -15;
const RSRP_ALERT = -100;
const SINR_ALERT = 0;
const PING_ALERT = 150;
const BATTERY_ALERT = 5;
const PAGE_SIZE = 100;

// ─── Slider configs ───────────────────────────────────────────
const SLIDER_CONFIGS = {
  rssi: {
    min: -120,
    max: -40,
    step: 1,
    unit: " dBm",
    label: "RSSI",
    gradient:
      "linear-gradient(to right,#ef4444 43.75%,#eab308 43.75%,#eab308 56.25%,#22c55e 56.25%)",
  },
  rsrq: {
    min: -25,
    max: 0,
    step: 1,
    unit: " dB",
    label: "RSRQ",
    gradient:
      "linear-gradient(to right,#ef4444 20%,#eab308 20%,#eab308 40%,#22c55e 40%)",
  },
  rsrp: {
    min: -140,
    max: -44,
    step: 1,
    unit: " dBm",
    label: "RSRP",
    gradient:
      "linear-gradient(to right,#ef4444 38.54%,#eab308 38.54%,#eab308 52.08%,#22c55e 52.08%)",
  },
  sinr: {
    min: -20,
    max: 30,
    step: 1,
    unit: " dB",
    label: "SINR",
    gradient:
      "linear-gradient(to right,#ef4444 40%,#eab308 40%,#eab308 66%,#22c55e 66%)",
  },
  ping: {
    min: 0,
    max: 500,
    step: 5,
    unit: " ms",
    label: "Ping",
    gradient:
      "linear-gradient(to right,#22c55e 12%,#eab308 12%,#eab308 30%,#ef4444 30%)",
  },
  battery: {
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    label: "Battery",
    gradient: "linear-gradient(to right,#eab308 20%,#22c55e 20%)",
  },
};

const FILTER_DEFAULTS = {
  dateFrom: "",
  dateTo: "",
  devices: [],
  rssi: [SLIDER_CONFIGS.rssi.min, SLIDER_CONFIGS.rssi.max],
  rsrq: [SLIDER_CONFIGS.rsrq.min, SLIDER_CONFIGS.rsrq.max],
  rsrp: [SLIDER_CONFIGS.rsrp.min, SLIDER_CONFIGS.rsrp.max],
  sinr: [SLIDER_CONFIGS.sinr.min, SLIDER_CONFIGS.sinr.max],
  ping: [SLIDER_CONFIGS.ping.min, SLIDER_CONFIGS.ping.max],
  battery: [SLIDER_CONFIGS.battery.min, SLIDER_CONFIGS.battery.max],
};

// ─── Helpers ─────────────────────────────────────────────────

const formatTimestamp = (ts) => {
  if (!ts) return "—";
  try {
    let d;
    if (ts instanceof Date) {
      d = ts;
    } else if (ts?.toDate) {
      d = ts.toDate();
    } else if (typeof ts === "string" && /^\d{6}_\d{6}$/.test(ts)) {
      d = parseTimestampId(ts);
    } else {
      d = new Date(ts);
    }
    if (!d || isNaN(d.getTime())) return "—";
    return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return "—";
  }
};

const formatGPS = (gps) => {
  if (!gps) return null;
  const lat = gps.lat ?? gps.latitude;
  const lng = gps.lng ?? gps.longitude;
  if (lat == null || lng == null) return null;
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
};

const formatBattery = (val) => {
  if (val == null) return null;
  return val > 5 ? `${Math.round(val)}%` : `${Number(val).toFixed(2)} V`;
};

const getBatteryColor = (val) => {
  if (val == null) return "text-gray-300";
  const pct = val > 5 ? val : (val / 4.2) * 100;
  return pct < 20 ? "text-yellow-500" : "text-green-600";
};

const computeStatus = ({ rssi, rsrq, rsrp, sinr, ping, battery }) => {
  const pct =
    battery != null ? (battery > 5 ? battery : (battery / 4.2) * 100) : null;
  const noGo =
    (rssi != null && rssi < RSSI_ALERT) ||
    (rsrq != null && rsrq < RSRQ_ALERT) ||
    (rsrp != null && rsrp < RSRP_ALERT) ||
    (sinr != null && sinr < SINR_ALERT) ||
    (ping != null && ping > PING_ALERT) ||
    (pct != null && pct < BATTERY_ALERT);
  return noGo ? "No-Go" : "Go";
};

const isAlert = (log) =>
  (log.rssi != null && log.rssi < RSSI_ALERT) ||
  (log.rsrq != null && log.rsrq < RSRQ_ALERT) ||
  (log.rsrp != null && log.rsrp < RSRP_ALERT) ||
  (log.sinr != null && log.sinr < SINR_ALERT) ||
  (log.ping != null && log.ping > PING_ALERT) ||
  (log.battery != null &&
    (log.battery > 5 ? log.battery : (log.battery / 4.2) * 100) <
      BATTERY_ALERT);

const isRangeActive = (key, filters) =>
  filters[key][0] !== SLIDER_CONFIGS[key].min ||
  filters[key][1] !== SLIDER_CONFIGS[key].max;

const applyFilters = (logs, filters) =>
  logs.filter((log) => {
    if (filters.dateFrom || filters.dateTo) {
      const d =
        log._parsedTimestamp ??
        (log.timestamp?.toDate
          ? log.timestamp.toDate()
          : new Date(log.timestamp));
      if (filters.dateFrom && d < new Date(filters.dateFrom + "T00:00:00Z"))
        return false;
      if (filters.dateTo && d > new Date(filters.dateTo + "T23:59:59Z"))
        return false;
    }
    if (filters.devices.length > 0 && !filters.devices.includes(log.deviceId))
      return false;
    for (const k of ["rssi", "rsrq", "rsrp", "sinr"]) {
      if (isRangeActive(k, filters)) {
        if (log[k] == null) return false;
        if (log[k] < filters[k][0] || log[k] > filters[k][1]) return false;
      }
    }
    if (isRangeActive("ping", filters)) {
      if (log.ping == null) return false;
      if (log.ping < filters.ping[0] || log.ping > filters.ping[1])
        return false;
    }
    if (isRangeActive("battery", filters)) {
      if (log.battery == null) return false;
      const pct = log.battery > 5 ? log.battery : (log.battery / 4.2) * 100;
      if (pct < filters.battery[0] || pct > filters.battery[1]) return false;
    }
    return true;
  });

const downloadCSV = (logs) => {
  const headers = [
    "Timestamp (UTC)",
    "Device ID",
    "RSSI (dBm)",
    "RSRQ (dB)",
    "RSRP (dBm)",
    "SINR (dB)",
    "Ping (ms)",
    "Latitude",
    "Longitude",
    "Battery",
    "Status",
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = logs.map((log) =>
    [
      formatTimestamp(log._parsedTimestamp ?? log.timestamp),
      log.deviceId ?? "",
      log.rssi ?? "",
      log.rsrq ?? "",
      log.rsrp ?? "",
      log.sinr ?? "",
      log.ping ?? "",
      log.gps?.lat ?? "",
      log.gps?.lng ?? "",
      formatBattery(log.battery) ?? "",
      log.status ?? "",
    ].map(esc),
  );
  const csv = [headers.map(esc), ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scl-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── RangeSlider ─────────────────────────────────────────────
const RangeSlider = ({ configKey, value, onChange }) => {
  const { min, max, step, unit, gradient } = SLIDER_CONFIGS[configKey];
  const [low, high] = value;
  const pct = (v) => ((v - min) / (max - min)) * 100;
  const lPct = pct(low);
  const hPct = pct(high);
  return (
    <div className="space-y-2">
      <div className="relative h-6 flex items-center select-none">
        {/* Colored zone track */}
        <div
          className="absolute w-full h-1.5 rounded-full"
          style={{ background: gradient }}
        >
          <div
            className="absolute h-full bg-gray-200/80 rounded-l-full"
            style={{ width: `${lPct}%` }}
          />
          <div
            className="absolute h-full bg-gray-200/80 rounded-r-full"
            style={{ left: `${hPct}%`, right: 0 }}
          />
        </div>
        {/* Low handle */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v <= high - step) onChange([v, high]);
          }}
          className="range-thumb absolute w-full h-full opacity-0"
          style={{ zIndex: low >= high - (max - min) * 0.05 ? 5 : 3 }}
        />
        {/* High handle */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= low + step) onChange([low, v]);
          }}
          className="range-thumb absolute w-full h-full opacity-0"
          style={{ zIndex: high <= low + (max - min) * 0.05 ? 5 : 4 }}
        />
        {/* Visual thumbs */}
        <div
          className="absolute w-4 h-4 rounded-full bg-white border-2 border-[#003DA5] shadow pointer-events-none"
          style={{ left: `calc(${lPct}% - 8px)`, zIndex: 6 }}
        />
        <div
          className="absolute w-4 h-4 rounded-full bg-white border-2 border-[#003DA5] shadow pointer-events-none"
          style={{ left: `calc(${hPct}% - 8px)`, zIndex: 6 }}
        />
      </div>
      <div className="flex justify-between text-[11px] font-mono text-gray-600">
        <span>
          {low}
          {unit}
        </span>
        <span>
          {high}
          {unit}
        </span>
      </div>
    </div>
  );
};

// ─── FilterPill ───────────────────────────────────────────────
const FilterPill = ({ label, icon, active, onClear, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all select-none ${
          active
            ? "bg-[#003DA5] text-white border-[#003DA5]"
            : "bg-white text-gray-700 border-gray-300 hover:border-[#003DA5] hover:text-[#003DA5]"
        }`}
      >
        {icon}
        {label}
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-200 z-30 p-4">
          {children}
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between">
            {active && onClear && (
              <button
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition"
              >
                Reset
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="ml-auto text-xs text-[#003DA5] font-semibold hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Device filter panel (own search state) ───────────────────
const DeviceFilterPanel = ({ allDevices, selected, onChange }) => {
  const [search, setSearch] = useState("");
  const visible = allDevices.filter((d) =>
    d.toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    onChange([...s]);
  };
  return (
    <div className="w-64">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Device ID
      </p>
      <input
        type="text"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-[#003DA5]/40 focus:border-[#003DA5]"
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {visible.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">
            No devices found
          </p>
        ) : (
          visible.map((d) => (
            <label
              key={d}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-1"
            >
              <input
                type="checkbox"
                checked={selected.includes(d)}
                onChange={() => toggle(d)}
                className="accent-[#003DA5]"
              />
              <span className="text-xs font-mono text-gray-700">{d}</span>
            </label>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <p className="text-[10px] text-[#003DA5] mt-1.5 font-semibold">
          {selected.length} selected
        </p>
      )}
    </div>
  );
};

// ─── FilterBar ────────────────────────────────────────────────
const FilterBar = ({ filters, onChange, allDevices }) => {
  const set = (key) => (val) => onChange({ ...filters, [key]: val });
  const isDateActive = !!(filters.dateFrom || filters.dateTo);
  const isDeviceActive = filters.devices.length > 0;
  const isSignalActive = ["rssi", "rsrq", "rsrp", "sinr"].some((k) =>
    isRangeActive(k, filters),
  );
  const isLatencyActive = isRangeActive("ping", filters);
  const isBatteryActive = isRangeActive("battery", filters);
  const anyActive =
    isDateActive ||
    isDeviceActive ||
    isSignalActive ||
    isLatencyActive ||
    isBatteryActive;
  const labelCls =
    "text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2 block";

  return (
    <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-[#BBBDC0] bg-gray-50/60 flex-wrap">
      {/* ── Date ── */}
      <FilterPill
        label="Date"
        icon={<Calendar size={11} />}
        active={isDateActive}
        onClear={() => onChange({ ...filters, dateFrom: "", dateTo: "" })}
      >
        <div className="w-64">
          <span className={labelCls}>Date Range (UTC)</span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">
                From
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  onChange({ ...filters, dateFrom: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA5]/40 focus:border-[#003DA5]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  onChange({ ...filters, dateTo: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#003DA5]/40 focus:border-[#003DA5]"
              />
            </div>
          </div>
        </div>
      </FilterPill>

      {/* ── Device ── */}
      <FilterPill
        label="Device"
        icon={<Signal size={11} />}
        active={isDeviceActive}
        onClear={() => onChange({ ...filters, devices: [] })}
      >
        <DeviceFilterPanel
          allDevices={allDevices}
          selected={filters.devices}
          onChange={set("devices")}
        />
      </FilterPill>

      {/* ── Signal Metrics ── */}
      <FilterPill
        label="Signal Metrics"
        icon={<SlidersHorizontal size={11} />}
        active={isSignalActive}
        onClear={() =>
          onChange({
            ...filters,
            rssi: FILTER_DEFAULTS.rssi,
            rsrq: FILTER_DEFAULTS.rsrq,
            rsrp: FILTER_DEFAULTS.rsrp,
            sinr: FILTER_DEFAULTS.sinr,
          })
        }
      >
        <div className="w-72 space-y-4">
          <span className={labelCls}>Signal Metrics</span>
          {["rssi", "rsrq", "rsrp", "sinr"].map((k) => (
            <div key={k}>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">
                {SLIDER_CONFIGS[k].label}
              </p>
              <RangeSlider configKey={k} value={filters[k]} onChange={set(k)} />
            </div>
          ))}
        </div>
      </FilterPill>

      {/* ── Latency ── */}
      <FilterPill
        label="Latency"
        active={isLatencyActive}
        onClear={() => onChange({ ...filters, ping: FILTER_DEFAULTS.ping })}
      >
        <div className="w-64">
          <span className={labelCls}>Ping / Latency</span>
          <RangeSlider
            configKey="ping"
            value={filters.ping}
            onChange={set("ping")}
          />
        </div>
      </FilterPill>

      {/* ── Battery ── */}
      <FilterPill
        label="Battery"
        active={isBatteryActive}
        onClear={() =>
          onChange({ ...filters, battery: FILTER_DEFAULTS.battery })
        }
      >
        <div className="w-64">
          <span className={labelCls}>Battery (%)</span>
          <RangeSlider
            configKey="battery"
            value={filters.battery}
            onChange={set("battery")}
          />
        </div>
      </FilterPill>

      {/* ── Clear all ── */}
      {anyActive && (
        <button
          onClick={() => onChange(FILTER_DEFAULTS)}
          className="text-xs text-gray-400 hover:text-red-500 transition font-medium ml-1"
        >
          Clear all
        </button>
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────

const SignalGrid = ({ rssi, rsrq, rsrp, sinr }) => {
  const metrics = [
    {
      key: "RSSI",
      value: rssi,
      unit: "dBm",
      warn: rssi != null && rssi < RSSI_ALERT,
    },
    {
      key: "RSRQ",
      value: rsrq,
      unit: "dB",
      warn: rsrq != null && rsrq < RSRQ_ALERT,
    },
    {
      key: "RSRP",
      value: rsrp,
      unit: "dBm",
      warn: rsrp != null && rsrp < RSRP_ALERT,
    },
    {
      key: "SINR",
      value: sinr,
      unit: "dB",
      warn: sinr != null && sinr < SINR_ALERT,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-px font-mono text-xs min-w-[190px]">
      {metrics.map(({ key, value, unit, warn }) => (
        <React.Fragment key={key}>
          <span className="text-gray-400 text-[10px] uppercase tracking-wide leading-5 select-none">
            {key}
          </span>
          <span
            className={`font-semibold leading-5 ${value == null ? "text-gray-300" : warn ? "text-red-600" : "text-gray-800"}`}
          >
            {value != null ? (
              <>
                {value > 0 ? "+" : ""}
                {value}{" "}
                <span className="text-[10px] font-normal text-gray-400">
                  {unit}
                </span>
              </>
            ) : (
              "—"
            )}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  if (!status) return <span className="text-gray-300 select-none">—</span>;
  const ok = status === "Go";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ring-1 ${ok ? "bg-green-50 text-green-800 ring-green-300" : "bg-red-50 text-red-800 ring-red-300"}`}
    >
      {ok ? (
        <CheckCircle size={11} strokeWidth={2.5} />
      ) : (
        <AlertTriangle size={11} strokeWidth={2.5} />
      )}
      {status}
    </span>
  );
};

const BatteryCell = ({ battery }) => {
  const label = formatBattery(battery);
  if (!label) return <span className="text-gray-300 select-none">—</span>;
  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono font-semibold text-sm ${getBatteryColor(battery)}`}
    >
      <Battery size={14} strokeWidth={2} />
      {label}
    </div>
  );
};

const StatTile = ({ icon, label, value, alert }) => (
  <div className="flex items-center gap-2.5">
    <span
      className={`flex-shrink-0 ${alert ? "text-red-500" : "text-[#003DA5]"}`}
    >
      {icon}
    </span>
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-0.5">
        {label}
      </p>
      <p
        className={`font-bold text-base leading-none ${alert ? "text-red-600" : "text-gray-900"}`}
      >
        {value}
      </p>
    </div>
  </div>
);

const SCLLogo = () => (
  <img
    src={sclLogo}
    alt="Seattle City Light logo"
    className="flex-shrink-0 h-[54px] w-auto"
  />
);

const LoadingScreen = () => (
  <div
    className="min-h-screen bg-white flex flex-col items-center justify-center gap-5"
    style={{ fontFamily: '"Open Sans", Verdana, sans-serif' }}
  >
    <div className="relative">
      <div className="w-16 h-16 rounded-full border-4 border-[#003DA5]/20 border-t-[#003DA5] animate-spin" />
      <Zap className="absolute inset-0 m-auto text-[#003DA5]" size={22} />
    </div>
    <div className="text-center">
      <p className="text-[#003DA5] font-bold text-lg">Loading Signal Data</p>
      <p className="text-gray-400 text-sm mt-1">Connecting to Firestore…</p>
    </div>
  </div>
);

const EmptyState = () => (
  <div className="py-20 text-center">
    <Signal
      size={52}
      className="text-[#BBBDC0] mx-auto mb-4"
      strokeWidth={1.5}
    />
    <p className="text-gray-600 font-semibold text-base">No Data Found</p>
    <p className="text-gray-400 text-sm mt-1.5 max-w-xs mx-auto leading-relaxed">
      No log entries match the current filters.
    </p>
  </div>
);

const COLUMNS = [
  "Timestamp (UTC)",
  "Device ID",
  "Signal Metrics",
  "Latency (Ping)",
  "GPS (Lat / Long)",
  "Battery",
  "Status",
];

// ─── Dashboard ───────────────────────────────────────────────
export default function Dashboard() {
  const { deviceId: urlDeviceId } = useParams();
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filters, setFilters] = useState(() => ({
    ...FILTER_DEFAULTS,
    devices: urlDeviceId ? [urlDeviceId] : [],
  }));
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const allDeviceLogs = {};
    let loadedCount = 0;

    const mergeLogs = () => {
      const merged = Object.values(allDeviceLogs)
        .flat()
        .sort((a, b) => {
          const ta = a._parsedTimestamp?.getTime() ?? 0;
          const tb = b._parsedTimestamp?.getTime() ?? 0;
          return tb - ta;
        });

      // Find most recent GPS per device (merged is newest-first)
      const latestGps = {};
      merged.forEach((log) => {
        if (log.gps && !latestGps[log.deviceId]) {
          latestGps[log.deviceId] = log.gps;
        }
      });

      const enriched = merged.map((log) => ({
        ...log,
        gps: log.gps ?? latestGps[log.deviceId] ?? null,
      }));

      setLogs(enriched);
      setLastUpdated(new Date());
    };

    const unsubs = DEVICE_IDS.map((deviceId) =>
      onSnapshot(
        collection(db, deviceId),
        (snap) => {
          allDeviceLogs[deviceId] = snap.docs.map((d) => {
            const data = d.data();
            const rawBattery = data.battery ?? null;
            const battery =
              rawBattery != null && rawBattery > 1000
                ? rawBattery / 1000
                : rawBattery;
            const gps =
              data.gps ??
              (data.latitude != null
                ? { lat: data.latitude, lng: data.longitude }
                : null);
            const status =
              data.status ??
              computeStatus({
                rssi: data.rssi,
                rsrq: data.rsrq,
                rsrp: data.rsrp,
                sinr: data.sinr,
                ping: data.ping,
                battery,
              });
            return {
              id: `${deviceId}_${d.id}`,
              deviceId,
              ...data,
              battery,
              gps,
              status,
              _parsedTimestamp: parseTimestampId(d.id),
            };
          });
          loadedCount++;
          if (loadedCount >= DEVICE_IDS.length) setLoading(false);
          mergeLogs();
        },
        (err) => {
          console.error(`[SCL Dashboard] ${deviceId}:`, err);
          setError(err.message);
          setLoading(false);
        },
      ),
    );

    return () => unsubs.forEach((u) => u());
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => setCurrentPage(1), [filters]);

  if (loading) return <LoadingScreen />;

  const deviceSet = [...new Set(logs.map((l) => l.deviceId).filter(Boolean))];
  const filteredLogs = applyFilters(logs, filters);
  const alertCount = filteredLogs.filter(isAlert).length;
  // Show "Viewing" label only when exactly one device is in view
  const viewingDevice =
    filters.devices.length === 1
      ? filters.devices[0]
      : filters.devices.length === 0 && urlDeviceId
        ? urlDeviceId
        : null;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedLogs = filteredLogs.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const anyFilter =
    ["rssi", "rsrq", "rsrp", "sinr", "ping", "battery"].some((k) =>
      isRangeActive(k, filters),
    ) ||
    !!(filters.dateFrom || filters.dateTo) ||
    filters.devices.length > 0;

  // Build pagination page numbers (max 7 visible)
  const pageNums = (() => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, "…", totalPages];
    if (safePage >= totalPages - 3)
      return [
        1,
        "…",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    return [1, "…", safePage - 1, safePage, safePage + 1, "…", totalPages];
  })();

  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      style={{ fontFamily: '"Open Sans", Verdana, sans-serif' }}
    >
      {/* ══ HEADER ══ */}
      <header className="bg-[#003DA5] text-white shadow-md">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <SCLLogo />
            <div className="border-l border-white/20 pl-3 min-w-0">
              <p className="text-blue-200 text-[10px] font-semibold uppercase tracking-[0.18em] select-none">
                Seattle City Light
              </p>
              <h1 className="text-white font-bold text-xl sm:text-2xl leading-tight truncate">
                Signal Quality Data Logger
              </h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                <span className="text-green-300 text-xs font-semibold tracking-widest uppercase">
                  Live
                </span>
              </div>
              {lastUpdated && (
                <p className="text-blue-300/70 text-[10px] mt-0.5">
                  Updated{" "}
                  {lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ══ STATS BAR ══ */}
      <div className="border-b border-[#BBBDC0] bg-gray-50">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center">
          {/* Left: Map button */}
          <button
            onClick={() => navigate("/")}
            className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[#003DA5] hover:text-white hover:bg-[#003DA5] border border-[#003DA5]/40 hover:border-[#003DA5] px-2.5 py-1.5 rounded-md transition font-semibold"
          >
            ← Map
          </button>

          {/* Center: per-device stats */}
          <div className="flex-1 flex justify-center gap-x-8 gap-y-3 flex-wrap">
            <StatTile
              icon={<Activity size={16} />}
              label="Total Logs"
              value={filteredLogs.length}
            />
            <StatTile
              icon={<AlertTriangle size={16} />}
              label="Alerts"
              value={alertCount}
              alert={alertCount > 0}
            />
          </div>

          {/* Right: single-device label */}
          {viewingDevice ? (
            <div className="flex-shrink-0 hidden sm:flex items-center gap-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                Viewing
              </p>
              <p className="text-lg text-[#003DA5] font-bold font-mono leading-none">
                {viewingDevice}
              </p>
            </div>
          ) : (
            <div className="flex-shrink-0 hidden sm:block w-[120px]" />
          )}
        </div>
      </div>

      {/* ══ MAIN CONTENT ══ */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Firestore Connection Error</p>
              <p className="mt-0.5 font-mono text-xs text-red-600">{error}</p>
            </div>
          </div>
        )}

        <div className="bg-white border border-[#BBBDC0] rounded-lg shadow-sm overflow-hidden">
          {/* ── Card header ── */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#BBBDC0] bg-gray-50/80">
            <div className="flex items-center gap-2">
              <Wifi size={15} className="text-[#003DA5]" />
              <h2 className="text-gray-800 font-semibold text-sm">
                Signal Logs
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadCSV(filteredLogs)}
                className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 hover:border-[#003DA5] hover:text-[#003DA5] text-xs font-semibold px-3 py-1.5 rounded-md transition"
              >
                <Download size={13} strokeWidth={2.5} />
                Export CSV
              </button>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <FilterBar
            filters={filters}
            onChange={setFilters}
            allDevices={deviceSet}
          />

          {/* ── Table ── */}
          <div className="overflow-x-auto table-scroll">
            {pagedLogs.length === 0 && !error ? (
              <EmptyState />
            ) : (
              <table className="w-full text-sm border-collapse min-w-[960px]">
                <thead>
                  <tr className="bg-[#003DA5] text-white">
                    {COLUMNS.map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap border-r border-white/10 last:border-r-0"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedLogs.map((log, idx) => {
                    const alert = isAlert(log);
                    const gps = formatGPS(log.gps);
                    const rowBg = alert
                      ? "bg-red-50 hover:bg-red-100/70"
                      : idx % 2 === 0
                        ? "bg-white hover:bg-blue-50/30"
                        : "bg-gray-50/60 hover:bg-blue-50/30";
                    return (
                      <tr
                        key={log.id}
                        className={`border-b border-[#BBBDC0]/50 transition-colors duration-100 ${rowBg}`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {alert && (
                              <AlertTriangle
                                size={12}
                                className="text-red-500 flex-shrink-0"
                                strokeWidth={2.5}
                              />
                            )}
                            <span className="font-mono text-xs text-gray-600">
                              {formatTimestamp(
                                log._parsedTimestamp ?? log.timestamp,
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 bg-[#003DA5]/10 text-[#003DA5] font-mono font-bold text-xs px-2.5 py-1 rounded">
                            <Signal size={11} strokeWidth={2.5} />
                            {log.deviceId ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <SignalGrid
                            rssi={log.rssi}
                            rsrq={log.rsrq}
                            rsrp={log.rsrp}
                            sinr={log.sinr}
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {log.ping != null ? (
                            <span
                              className={`font-mono font-bold text-sm ${log.ping > PING_ALERT ? "text-red-600" : log.ping > 80 ? "text-yellow-500" : "text-green-700"}`}
                            >
                              {log.ping}
                              <span className="text-xs font-normal text-gray-400">
                                {" "}
                                ms
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xl leading-none select-none">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {gps ? (
                            <div className="flex items-center gap-1 text-xs font-mono text-gray-700">
                              <MapPin
                                size={12}
                                className="text-[#003DA5] flex-shrink-0"
                                strokeWidth={2}
                              />
                              {gps}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xl leading-none select-none">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <BatteryCell battery={log.battery} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge status={log.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-[#BBBDC0] bg-gray-50/60">
              <p className="text-xs text-gray-500">
                Showing{" "}
                <span className="font-semibold text-gray-700">
                  {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredLogs.length)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-gray-700">
                  {filteredLogs.length}
                </span>{" "}
                results
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-300 rounded-md hover:border-[#003DA5] hover:text-[#003DA5] disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ‹ Prev
                </button>
                {pageNums.map((p, i) =>
                  p === "…" ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-2 py-1.5 text-xs text-gray-400 select-none"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`min-w-[32px] px-2.5 py-1.5 text-xs font-semibold rounded-md border transition ${
                        p === safePage
                          ? "bg-[#003DA5] text-white border-[#003DA5]"
                          : "bg-white text-gray-600 border-gray-300 hover:border-[#003DA5] hover:text-[#003DA5]"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage === totalPages}
                  className="px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-300 rounded-md hover:border-[#003DA5] hover:text-[#003DA5] disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-[#BBBDC0] bg-gray-50/50 py-4 mt-2">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
          <span>
            © {new Date().getFullYear()} Seattle City Light — Internal Use Only
          </span>
        </div>
      </footer>
    </div>
  );
}
