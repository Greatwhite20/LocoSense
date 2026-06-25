import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── Config ────────────────────────────────────────────────────────────────────
const API = "http://localhost:5001";
const POLL_MS = 30000;

const RISK_META = {
  Low:      { color: "#1D9E75", bg: "#E1F5EE", border: "#A8DECE" },
  Medium:   { color: "#D97706", bg: "#FEF3C7", border: "#FCD34D" },
  High:     { color: "#D85A30", bg: "#FAECE7", border: "#F4A07A" },
  Critical: { color: "#DC2626", bg: "#FEE2E2", border: "#FCA5A5" },
};

const SENSOR_LABELS = {
  engine_temp:     "Engine Temp (°C)",
  oil_pressure:    "Oil Pressure (bar)",
  vibration:       "Vibration (mm/s)",
  fuel_efficiency: "Fuel Efficiency (%)",
  coolant_temp:    "Coolant Temp (°C)",
  bearing_temp:    "Bearing Temp (°C)",
  rpm:             "RPM",
  exhaust_temp:    "Exhaust Temp (°C)",
  turbo_pressure:  "Turbo Pressure (bar)",
  load_factor:     "Load Factor (%)",
  battery_voltage: "Battery Voltage (V)",
  brake_pressure:  "Brake Pressure (bar)",
};

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useApi(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetch_(); }, [fetch_, ...deps]);
  return { data, loading, error, refetch: fetch_ };
}

// ── Shared components ──────────────────────────────────────────────────────────
function RiskBadge({ risk, size = "sm" }) {
  const meta = RISK_META[risk] || RISK_META.Low;
  const pad  = size === "lg" ? "6px 14px" : "2px 9px";
  const fs   = size === "lg" ? 13 : 11;
  return (
    <span style={{
      display: "inline-block",
      padding: pad,
      borderRadius: 99,
      background: meta.bg,
      color: meta.color,
      border: `1px solid ${meta.border}`,
      fontSize: fs,
      fontWeight: 600,
      letterSpacing: "0.02em",
      whiteSpace: "nowrap",
    }}>
      {risk}
    </span>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#111827",
      border: `1px solid ${accent || "#374151"}`,
      borderRadius: 10,
      padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#F9FAFB", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Live Fleet Summary Bar (HUD style from first App) ─────────────────────────
function LiveFleetSummaryBar({ summary }) {
  if (!summary) return null;
  const rd = summary.risk_distribution || {};
  const alerts = (rd.High || 0) + (rd.Critical || 0);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #30363D", paddingBottom: 10, marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#2F80ED", fontSize: 16 }}>⚡</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C9D1D9" }}>
            Live Fleet Operations
          </span>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "monospace", fontSize: 11, color: "#8B949E",
          background: "#0D1117", border: "1px solid #30363D",
          padding: "4px 12px",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", display: "inline-block", animation: "spin 1s linear infinite" }} />
          ACTIVE MONITORED UNITS: {summary.total_locos}/{summary.total_locos}
        </div>
      </div>

      {/* Stat cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        {/* Total Fleet */}
        <div style={{ border: "1px solid #30363D", background: "#0D1117", padding: "12px 14px", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Fleet</div>
          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: "#C9D1D9", marginTop: 4 }}>{summary.total_locos}</div>
        </div>
        {/* Low Risk */}
        <div style={{ border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.05)", padding: "12px 14px", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#4ADE80", textTransform: "uppercase", letterSpacing: "0.06em" }}>Low Risk</div>
          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: "#22C55E", marginTop: 4 }}>{rd.Low || 0}</div>
        </div>
        {/* Medium Risk */}
        <div style={{ border: "1px solid rgba(234,179,8,0.3)", background: "rgba(234,179,8,0.05)", padding: "12px 14px", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#FACC15", textTransform: "uppercase", letterSpacing: "0.06em" }}>Medium Risk</div>
          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: "#EAB308", marginTop: 4 }}>{rd.Medium || 0}</div>
        </div>
        {/* High Risk */}
        <div style={{ border: "1px solid rgba(249,115,22,0.3)", background: "rgba(249,115,22,0.05)", padding: "12px 14px", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#FB923C", textTransform: "uppercase", letterSpacing: "0.06em" }}>High Risk</div>
          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: "#F97316", marginTop: 4 }}>{rd.High || 0}</div>
        </div>
        {/* Critical */}
        <div style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)", padding: "12px 14px", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#F87171", textTransform: "uppercase", letterSpacing: "0.06em" }}>Critical</div>
          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: "#EF4444", marginTop: 4 }}>{rd.Critical || 0}</div>
        </div>
        {/* Alert Count */}
        <div style={{
          border: alerts > 0 ? "1px solid #EF4444" : "1px solid #30363D",
          background: alerts > 0 ? "rgba(239,68,68,0.15)" : "#0D1117",
          padding: "12px 14px", textAlign: "center",
        }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Alert Count</div>
          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: alerts > 0 ? "#F87171" : "#C9D1D9", marginTop: 4 }}>{alerts}</div>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <div style={{
        width: 28, height: 28,
        border: "2px solid var(--border)",
        borderTopColor: "#3B82F6",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
    </div>
  );
}

function ErrorBanner({ msg }) {
  return (
    <div style={{
      background: "#FEE2E2", color: "#DC2626",
      border: "1px solid #FCA5A5",
      borderRadius: 8, padding: "10px 14px",
      fontSize: 13, marginBottom: 16,
    }}>
      ⚠ {msg}
    </div>
  );
}

// ── Fleet table ───────────────────────────────────────────────────────────────
function FleetTable({ locos, onSelect, selectedId }) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("failure_prob");

  const risks = ["All", "Critical", "High", "Medium", "Low"];

  const filtered = locos
    .filter(l => filter === "All" || l.risk_category === filter)
    .filter(l => l.loco_id.toLowerCase().includes(search.toLowerCase()) ||
                 l.loco_type.toLowerCase().includes(search.toLowerCase()) ||
                 l.zone.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b[sortBy] - a[sortBy]);

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search loco ID, type, zone…"
          style={{
            flex: 1, minWidth: 180,
            padding: "6px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 13,
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {risks.map(r => (
            <button key={r} onClick={() => setFilter(r)} style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: filter === r ? "#3B82F6" : "var(--surface)",
              color: filter === r ? "#fff" : "var(--text)",
              fontSize: 12, cursor: "pointer",
            }}>{r}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[
                ["Loco ID", "loco_id"],
                ["Type", "loco_type"],
                ["Zone", "zone"],
                ["Cycle", "cycle"],
                ["Risk", "risk_category"],
                ["Failure Prob", "failure_prob"],
                ["Days Since Svc", "days_since_svc"],
              ].map(([label, key]) => (
                <th key={key}
                  onClick={() => setSortBy(key)}
                  style={{
                    textAlign: "left", padding: "8px 10px",
                    color: "var(--muted)", fontWeight: 500,
                    cursor: "pointer", userSelect: "none",
                    whiteSpace: "nowrap",
                    borderBottom: sortBy === key ? "2px solid #3B82F6" : "none",
                  }}>
                  {label} {sortBy === key ? "↓" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.loco_id}
                onClick={() => onSelect(l.loco_id)}
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                  background: selectedId === l.loco_id ? "var(--selected)" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}>
                <td style={{ padding: "9px 10px", fontWeight: 600, color: "var(--text)" }}>
                  {l.loco_id}
                </td>
                <td style={{ padding: "9px 10px", color: "var(--muted)" }}>{l.loco_type}</td>
                <td style={{ padding: "9px 10px", color: "var(--muted)" }}>{l.zone}</td>
                <td style={{ padding: "9px 10px", color: "var(--muted)" }}>{l.cycle}</td>
                <td style={{ padding: "9px 10px" }}><RiskBadge risk={l.risk_category} /></td>
                <td style={{ padding: "9px 10px", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      height: 4, width: 60, background: "var(--border)",
                      borderRadius: 2, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${l.failure_prob * 100}%`,
                        background: RISK_META[l.risk_category]?.color || "#888",
                        borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ color: "var(--text)", fontSize: 12 }}>
                      {(l.failure_prob * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: "9px 10px", color: "var(--muted)" }}>{l.days_since_svc}d</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--muted)", fontSize: 13 }}>
            No locomotives match the current filter.
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        Showing {filtered.length} of {locos.length} locomotives
      </div>
    </div>
  );
}

// ── SHAP drivers bar ──────────────────────────────────────────────────────────
function ShapDrivers({ drivers }) {
  if (!drivers || drivers.length === 0) return null;
  const maxAbs = Math.max(...drivers.map(d => Math.abs(d.shap_value)));

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Top SHAP drivers
      </div>
      {drivers.map((d, i) => {
        const pct = Math.abs(d.shap_value) / maxAbs * 100;
        const isPos = d.shap_value > 0;
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                {d.feature_display || d.feature}
              </span>
              <span style={{ fontSize: 11, color: isPos ? "#DC2626" : "#1D9E75" }}>
                {isPos ? "↑ risk" : "↓ risk"} {d.shap_value > 0 ? "+" : ""}{d.shap_value.toFixed(3)}
              </span>
            </div>
            <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${pct}%`,
                background: isPos ? "#DC2626" : "#1D9E75",
                borderRadius: 3,
                transition: "width 0.4s",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sensor grid ───────────────────────────────────────────────────────────────
function SensorGrid({ readings }) {
  if (!readings) return null;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gap: 8,
    }}>
      {Object.entries(readings).map(([key, val]) => (
        <div key={key} style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          padding: "10px 12px",
        }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
            {SENSOR_LABELS[key] || key}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {typeof val === "number" ? val.toFixed(1) : val}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Risk trend chart ──────────────────────────────────────────────────────────
function RiskTrendChart({ locoId }) {
  const { data, loading, error } = useApi(locoId ? `${API}/api/loco/${locoId}/history` : null, [locoId]);

  if (!locoId) return null;
  if (loading) return <Spinner />;
  if (error)   return <ErrorBanner msg={error} />;
  if (!data)   return null;

  const chartData = data.history.map(h => ({
    cycle: h.cycle,
    prob: parseFloat((h.failure_prob * 100).toFixed(1)),
    risk: h.risk_category,
    ru: h.ru,
  }));

  const customDot = (props) => {
    const { cx, cy, payload } = props;
    const color = RISK_META[payload.risk]?.color || "#888";
    return <circle key={`dot-${payload.cycle}`} cx={cx} cy={cy} r={2.5} fill={color} stroke="none" />;
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Failure probability over cycles
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="cycle" tick={{ fontSize: 10, fill: "var(--muted)" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted)" }}
            tickFormatter={v => `${v}%`} />
          <Tooltip
            formatter={(v) => [`${v}%`, "Failure prob"]}
            labelFormatter={(l) => `Cycle ${l}`}
            contentStyle={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 6, fontSize: 12,
            }}
          />
          <ReferenceLine y={50} stroke="#D85A30" strokeDasharray="4 2" strokeWidth={1} />
          <ReferenceLine y={75} stroke="#DC2626" strokeDasharray="4 2" strokeWidth={1} />
          <Line
            type="monotone" dataKey="prob"
            stroke="#3B82F6" strokeWidth={1.5}
            dot={customDot} activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 10, color: "var(--muted)" }}>
        <span style={{ color: "#D85A30" }}>— 50% threshold</span>
        <span style={{ color: "#DC2626" }}>— 75% critical</span>
      </div>
    </div>
  );
}

// ── Loco detail panel ─────────────────────────────────────────────────────────
function LocoDetail({ locoId, onClose }) {
  const { data, loading, error } = useApi(locoId ? `${API}/api/loco/${locoId}` : null, [locoId]);

  if (!locoId) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", color: "var(--muted)", fontSize: 13, flexDirection: "column", gap: 8,
    }}>
      <span style={{ fontSize: 32 }}>🚂</span>
      <span>Select a locomotive to view details</span>
    </div>
  );

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, position: "sticky", top: 0,
        background: "var(--surface)", paddingBottom: 12,
        borderBottom: "1px solid var(--border)",
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{locoId}</div>
          {data && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {data.loco_type} · {data.zone} · Cycle {data.cycle}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "1px solid var(--border)",
          borderRadius: 6, padding: "4px 10px",
          color: "var(--muted)", cursor: "pointer", fontSize: 13,
        }}>✕</button>
      </div>

      {loading && <Spinner />}
      {error   && <ErrorBanner msg={error} />}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Risk score */}
          <div style={{
            background: RISK_META[data.risk_category]?.bg || "#f5f5f5",
            border: `1px solid ${RISK_META[data.risk_category]?.border || "#ddd"}`,
            borderRadius: 10, padding: "16px 18px",
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>FAILURE PROBABILITY</div>
              <div style={{
                fontSize: 32, fontWeight: 800,
                color: RISK_META[data.risk_category]?.color,
                fontVariantNumeric: "tabular-nums",
              }}>
                {(data.failure_prob * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <RiskBadge risk={data.risk_category} size="lg" />
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>
                RU: {data.ru} cycles
              </div>
            </div>
          </div>

          {/* Risk trend */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            <RiskTrendChart locoId={locoId} />
          </div>

          {/* SHAP drivers */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            <ShapDrivers drivers={data.top_drivers} />
          </div>

          {/* Sensor readings */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Current sensor readings
            </div>
            <SensorGrid readings={data.sensor_readings} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────
function SummaryBar({ summary }) {
  if (!summary) return null;
  const rd = summary.risk_distribution || {};
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
      <StatCard label="Total Locos" value={summary.total_locos} sub="in fleet" />
      <StatCard label="Critical" value={rd.Critical || 0}
        accent={RISK_META.Critical.color} sub="immediate action" />
      <StatCard label="High Risk" value={rd.High || 0}
        accent={RISK_META.High.color} sub="monitor closely" />
      <StatCard label="Medium" value={rd.Medium || 0}
        accent={RISK_META.Medium.color} sub="routine check" />
      <StatCard label="Low" value={rd.Low || 0}
        accent={RISK_META.Low.color} sub="operating normally" />
      <StatCard label="Alerts" value={summary.alert_count || 0}
        accent="#DC2626" sub="High + Critical" />
    </div>
  );
}

// ── Dataset note ──────────────────────────────────────────────────────────────
// function DatasetNote() {
//   const [open, setOpen] = useState(false);
//   return (
//     <div style={{
//       background: "#FEF9C3", border: "1px solid #FCD34D",
//       borderRadius: 8, padding: "8px 12px", marginBottom: 16,
//       fontSize: 12, color: "#92400E",
//       display: "flex", alignItems: "flex-start", gap: 8,
//     }}>
//       <span>ℹ</span>
//       <div>
//         <strong>Dataset note:</strong> All locos show Critical risk because the dataset records each
//         loco's full lifecycle ending at the failure point (RU=0).
//         {open && (
//           <span> The model is working correctly — use the history chart to see how risk
//           evolved over the loco's lifetime. In a live deployment, this would show real-time
//           sensor readings mid-lifecycle.</span>
//         )}
//         {" "}
//         <span onClick={() => setOpen(o => !o)} style={{ cursor: "pointer", textDecoration: "underline" }}>
//           {open ? "Show less" : "Learn more"}
//         </span>
//       </div>
//     </div>
//   );
// }

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const darkMode=true;
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const { data: fleet,   loading: fleetLoading,   error: fleetError,   refetch: refetchFleet }
    = useApi(`${API}/api/fleet`);
  const { data: summary, loading: summaryLoading, error: summaryError }
    = useApi(`${API}/api/summary`);

  // Auto-poll every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      refetchFleet();
      setLastUpdated(new Date());
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refetchFleet]);

  const locos = fleet?.locos || [];

  // ── CSS vars via style tag ─────────────────────────────────────────────────
  const cssVars = darkMode ? `
    :root {
      --bg: #0F172A; --surface: #1E293B; --border: #334155;
      --border-subtle: #1E293B; --text: #F1F5F9; --muted: #94A3B8;
      --selected: #1E3A5F;
    }
  ` : `
    :root {
      --bg: #F8FAFC; --surface: #FFFFFF; --border: #E2E8F0;
      --border-subtle: #F1F5F9; --text: #0F172A; --muted: #64748B;
      --selected: #EFF6FF;
    }
  `;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{cssVars}{`
       @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        input::placeholder { color: var(--muted); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: "#1D4ED8", color: "#fff",
            borderRadius: 8, padding: "5px 10px",
            fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em",
          }}>LS</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>LocoSense</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Predictive Maintenance · RITES Fleet</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            Updated {lastUpdated.toLocaleTimeString()}
          </div>
          <button onClick={refetchFleet} style={{
            padding: "5px 12px", borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--text)",
            fontSize: 12, cursor: "pointer",
          }}>↻ Refresh</button>
          {/* <button onClick={() => setDarkMode(d => !d)} style={{
            padding: "5px 10px", borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--text)",
            fontSize: 12, cursor: "pointer",
          }}>{darkMode ? "☀" : "🌙"}</button> */}
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* Summary stats */}
        {summaryError && <ErrorBanner msg={`Summary: ${summaryError}`} />}
        {!summaryLoading && summary && <LiveFleetSummaryBar summary={summary} />}

        {/* <DatasetNote /> */}

        {/* Two-column layout */}
        <div style={{
          display: "grid",
          gridTemplateColumns: selectedId ? "1fr 380px" : "1fr",
          gap: 16,
          alignItems: "start",
        }}>
          {/* Fleet table */}
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12, padding: "16px 18px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Fleet Monitor</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {locos.length} locomotives · Click a row to inspect
                </div>
              </div>
              {fleetLoading && (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
              )}
            </div>
            {fleetError  && <ErrorBanner msg={fleetError} />}
            {!fleetLoading && locos.length > 0 && (
              <FleetTable
                locos={locos}
                onSelect={id => setSelectedId(prev => prev === id ? null : id)}
                selectedId={selectedId}
              />
            )}
            {!fleetLoading && locos.length === 0 && !fleetError && (
              <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontSize: 13 }}>
                No data — make sure the Flask API is running on port 5001.
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedId && (
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12, padding: "16px 18px",
              position: "sticky", top: 72,
              maxHeight: "calc(100vh - 90px)",
              overflowY: "auto",
            }}>
              <LocoDetail
                locoId={selectedId}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
