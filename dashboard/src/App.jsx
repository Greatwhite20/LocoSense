import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "https://locosense-3sx8.onrender.com";
const POLL_MS = 120000;

const RISK_META = {
  Critical: { color: "#EF4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.4)"  },
  High:     { color: "#F97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.4)" },
  Medium:   { color: "#EAB308", bg: "rgba(234,179,8,0.08)",   border: "rgba(234,179,8,0.4)"  },
  Low:      { color: "#22C55E", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.4)"  },
};

const TRACTION = {
  electric: { color: "#2F80ED", label: "ELECTRIC" },
  diesel:   { color: "#F97316", label: "DIESEL"   },
};

function useApi(url, deps = []) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const fetch_ = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { fetch_(); }, [fetch_, ...deps]);
  return { data, loading, error, refetch: fetch_ };
}

function RiskBadge({ risk }) {
  const m = RISK_META[risk] || RISK_META.Low;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", border: `1px solid ${m.border}`, color: m.color, fontSize: 10, letterSpacing: "0.08em", borderRadius: 2, fontFamily: "inherit" }}>
      {risk?.toUpperCase()}
    </span>
  );
}

function TractionTag({ t }) {
  const m = TRACTION[t] || TRACTION.diesel;
  return (
    <span style={{ display: "inline-block", padding: "1px 7px", border: `1px solid ${m.color}44`, color: m.color, fontSize: 9, letterSpacing: "0.1em", borderRadius: 2, marginLeft: 6, fontFamily: "inherit" }}>
      {m.label}
    </span>
  );
}

function ProbBar({ prob, risk }) {
  const color = RISK_META[risk]?.color || "#888";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 70, height: 3, background: "#1E2A45", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(prob * 100).toFixed(1)}%`, background: color }} />
      </div>
      <span style={{ color, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{(prob * 100).toFixed(1)}%</span>
    </div>
  );
}

function LiveFleetSummaryBar({ summary, locos }) {
  if (!locos || locos.length === 0) return null;
  const rd = {
    Low:      locos.filter(l => l.risk_category === "Low").length,
    Medium:   locos.filter(l => l.risk_category === "Medium").length,
    High:     locos.filter(l => l.risk_category === "High").length,
    Critical: locos.filter(l => l.risk_category === "Critical").length,};
  const alerts = (rd.High || 0) + (rd.Critical || 0);
  const elec   = locos.filter(l => l.traction_type === "electric").length;
  const dies   = locos.filter(l => l.traction_type === "diesel").length;

  return (
    <div style={{ marginBottom: 0, borderBottom: "1px solid #1E2A45" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #1A2035" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#2F80ED", fontSize: 14 }}></span>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", color: "#C9D1D9" }}>LIVE FLEET OPERATIONS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Montserrat', sans-serif", fontSize: 10, color: "#8B949E", background: "#0D1117", border: "1px solid #30363D", padding: "4px 12px" }}>

          ACTIVE MONITORED UNITS: {summary.total_locos}/{summary.total_locos}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 1, background: "#1E2A45" }}>
        {[
          ["TOTAL FLEET", summary.total_locos, "#C9D1D9", "#0D1117",                  "1px solid #30363D"],
          ["LOW RISK",    rd.Low      || 0,    "#22C55E", "rgba(34,197,94,0.05)",   "1px solid rgba(34,197,94,0.25)"],
          ["MEDIUM RISK", rd.Medium   || 0,    "#EAB308", "rgba(234,179,8,0.05)",   "1px solid rgba(234,179,8,0.25)"],
          ["HIGH RISK",   rd.High     || 0,    "#F97316", "rgba(249,115,22,0.05)",  "1px solid rgba(249,115,22,0.25)"],
          ["CRITICAL",    rd.Critical || 0,    "#EF4444", "rgba(239,68,68,0.05)",   "1px solid rgba(239,68,68,0.25)"],
          ["ALERTS",      alerts,              alerts > 0 ? "#EF4444" : "#8B949E", alerts > 0 ? "rgba(239,68,68,0.12)" : "#0D1117", alerts > 0 ? "1px solid #EF4444" : "1px solid #30363D"],
          ["ELECTRIC", elec,                "#2F80ED", "rgba(47,128,237,0.05)",  "1px solid rgba(47,128,237,0.25)"],
          ["DIESEL",   dies,                "#F97316", "rgba(249,115,22,0.05)",  "1px solid rgba(249,115,22,0.25)"],
        ].map(([lbl, val, col, bg, bdr]) => (
          <div key={lbl} style={{ background: bg, border: bdr, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 9, color: col, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>{lbl}</div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 24, fontWeight: 700, color: col, marginTop: 4 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FleetTable({ locos, onSelect, selectedId }) {
  const [risk,   setRisk]   = useState("ALL");
  const [tract,  setTract]  = useState("ALL");
  const [search, setSearch] = useState("");
  const [sort,   setSort]   = useState("failure_prob");

  const risks     = ["ALL","CRITICAL","HIGH","MEDIUM","LOW"];
  const tractions = ["ALL","ELECTRIC","DIESEL"];

  const filtered = locos
    .filter(l => risk   === "ALL" || l.risk_category?.toUpperCase()  === risk)
    .filter(l => tract  === "ALL" || l.traction_type?.toUpperCase()  === tract)
    .filter(l => !search || [l.loco_id, l.loco_type, l.zone].some(v => v?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => typeof b[sort] === "number" ? b[sort] - a[sort] : 0);

  const th = (key, label) => (
    <th onClick={() => setSort(key)} style={{ padding: "8px 12px", color: sort === key ? "#2F80ED" : "#4A5568", fontFamily: "'Montserrat', sans-serif", fontWeight: 400, letterSpacing: "0.08em", fontSize: 10, textAlign: "left", borderBottom: "1px solid #1E2A45", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
      {label}{sort === key ? " ↓" : ""}
    </th>
  );

  return (
    <div>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #1E2A45", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#0A0E1A" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH..." style={{ background: "#0D1117", border: "1px solid #1E2A45", color: "#C9D1D9", padding: "4px 10px", fontSize: 10, fontFamily: "'Montserrat', sans-serif", borderRadius: 0, outline: "none", width: 160 }} />
        {risks.map(r => (
          <button key={r} onClick={() => setRisk(r)} style={{ padding: "3px 10px", border: `1px solid ${risk === r ? (RISK_META[r.charAt(0) + r.slice(1).toLowerCase()]?.color || "#2F80ED") : "#1E2A45"}`, background: risk === r ? "rgba(47,128,237,0.1)" : "transparent", color: risk === r ? (RISK_META[r.charAt(0) + r.slice(1).toLowerCase()]?.color || "#2F80ED") : "#4A5568", fontSize: 10, cursor: "pointer", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.06em", borderRadius: 0 }}>{r}</button>
        ))}
        <div style={{ width: 1, height: 14, background: "#1E2A45" }} />
        {tractions.map(t => (
          <button key={t} onClick={() => setTract(t)} style={{ padding: "3px 10px", border: `1px solid ${tract === t ? (t === "ELECTRIC" ? "#2F80ED" : t === "DIESEL" ? "#F97316" : "#2F80ED") : "#1E2A45"}`, background: "transparent", color: tract === t ? (t === "ELECTRIC" ? "#2F80ED" : t === "DIESEL" ? "#F97316" : "#2F80ED") : "#4A5568", fontSize: 10, cursor: "pointer", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.06em", borderRadius: 0 }}>
            {t === "ELECTRIC" ? "" : t === "DIESEL" ? "" : ""}{t}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {th("loco_id","LOCO ID")}
              {th("loco_type","TYPE")}
              {th("zone","ZONE")}
              {th("risk_category","RISK BADGE")}
              {th("failure_prob","FAILURE PROB %")}
              {th("ru","RU CYCLES")}
              {th("days_since_svc","DAYS SINCE SVC")}
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.loco_id} onClick={() => onSelect(l.loco_id === selectedId ? null : l.loco_id)} style={{ background: l.loco_id === selectedId ? "#1A2A40" : "transparent", cursor: "pointer", borderLeft: l.loco_id === selectedId ? `2px solid ${RISK_META[l.risk_category]?.color || "#2F80ED"}` : "2px solid transparent" }}>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid #131B2E", color: "#C9D1D9", fontWeight: 600, fontFamily: "'Montserrat', sans-serif", fontSize: 12 }}>{l.loco_id}<TractionTag t={l.traction_type} /></td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid #131B2E", color: "#8B949E", fontFamily: "'Montserrat', sans-serif", fontSize: 12 }}>{l.loco_type}</td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid #131B2E", color: "#8B949E", fontFamily: "'Montserrat', sans-serif", fontSize: 12 }}>{l.zone}</td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid #131B2E" }}><RiskBadge risk={l.risk_category} /></td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid #131B2E" }}><ProbBar prob={l.failure_prob} risk={l.risk_category} /></td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid #131B2E", color: "#8B949E", fontFamily: "'Montserrat', sans-serif", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{l.ru}</td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid #131B2E", color: "#8B949E", fontFamily: "'Montserrat', sans-serif", fontSize: 12 }}>{l.days_since_svc} d</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: 32, color: "#2A3A5C", fontFamily: "'Montserrat', sans-serif", fontSize: 10, letterSpacing: "0.1em" }}>NO UNITS MATCH FILTER</div>}
      </div>
      <div style={{ padding: "8px 16px", color: "#2A3A5C", fontFamily: "'Montserrat', sans-serif", fontSize: 10, borderTop: "1px solid #131B2E" }}>SHOWING {filtered.length} / {locos.length} UNITS</div>
    </div>
  );
}

function ShapDrivers({ drivers, traction }) {
  if (!drivers?.length) return null;
  const maxAbs     = Math.max(...drivers.map(d => Math.abs(d.shap_value)));
  const tractColor = TRACTION[traction]?.color || "#F97316";
  return (
    <div style={{ padding: "8px 18px 16px" }}>
      {drivers.map((d, i) => {
        const pct   = (Math.abs(d.shap_value) / maxAbs * 100).toFixed(1);
        const isPos = d.shap_value > 0;
        const col   = isPos ? "#EF4444" : "#22C55E";
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "#8B949E", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.04em" }}>{(d.feature_display || d.feature).toUpperCase().slice(0,30)}</span>
              <span style={{ fontSize: 10, color: col, fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "tabular-nums" }}>{isPos?"+":""}{d.shap_value.toFixed(3)}</span>
            </div>
            <div style={{ height: 3, background: "#1E2A45", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: col }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SensorGrid({ readings, traction }) {
  if (!readings) return null;
  const tractColor = TRACTION[traction]?.color || "#F97316";
  const entries    = Object.entries(readings).filter(([k]) => k !== "days_since_service");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "#1E2A45" }}>
      {entries.map(([key, info]) => {
        const val   = typeof info === "object" ? info.value : info;
        const label = typeof info === "object" ? info.label : key.replace(/_/g," ").toUpperCase();
        const unit  = typeof info === "object" ? info.unit  : "";
        return (
          <div key={key} style={{ padding: "10px 14px", background: "#0D1117", borderLeft: `2px solid ${tractColor}22` }}>
            <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: "0.1em", fontFamily: "'Montserrat', sans-serif", marginBottom: 3, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{label.toUpperCase().slice(0,18)}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: tractColor, fontVariantNumeric: "tabular-nums", fontFamily: "'Montserrat', sans-serif" }}>
              {typeof val === "number" ? val.toFixed(1) : val}
              <span style={{ fontSize: 9, color: "#4A5568", marginLeft: 3 }}>{unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskTrendChart({ locoId, traction }) {
  const { data } = useApi(locoId ? `${API}/api/loco/${locoId}/history` : null, [locoId]);
  if (!data) return <div style={{ padding: "20px 18px", color: "#2A3A5C", fontFamily: "'Montserrat', sans-serif", fontSize: 10, letterSpacing: "0.1em" }}>LOADING HISTORY...</div>;
  const tractColor = TRACTION[traction]?.color || "#F97316";
  const lastN      = (data.history || []).slice(-20).map(h => ({ cycle: h.cycle, prob: parseFloat((h.failure_prob*100).toFixed(1)), risk: h.risk_category }));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={lastN} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#1E2A45" />
        <XAxis dataKey="cycle" tick={{ fontSize: 9, fill: "#2A3A5C", fontFamily: "'Montserrat', sans-serif" }} />
        <YAxis domain={[0,100]} tick={{ fontSize: 9, fill: "#2A3A5C", fontFamily: "'Montserrat', sans-serif" }} tickFormatter={v=>`${v}%`} />
        <Tooltip contentStyle={{ background: "#0D1117", border: "1px solid #1E2A45", fontSize: 10, fontFamily: "'Montserrat', sans-serif" }} formatter={v=>[`${v}%`,"PROB"]} labelFormatter={l=>`CYCLE ${l}`} />
        <ReferenceLine y={50} stroke="#2A3A5C" strokeDasharray="3 3" />
        <ReferenceLine y={75} stroke="#EF444444" strokeDasharray="3 3" />
        <Line type="linear" dataKey="prob" stroke={tractColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: tractColor }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function LocoDetail({ locoId, onClose }) {
  const { data, loading, error } = useApi(locoId ? `${API}/api/loco/${locoId}` : null, [locoId]);

  if (!locoId) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#2A3A5C", gap: 12, padding: 40 }}>
      <div style={{ fontSize: 32 }}></div>
      <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, letterSpacing: "0.15em" }}>SELECT A UNIT TO INSPECT</div>
    </div>
  );
  if (loading) return <div style={{ padding: 24, color: "#2A3A5C", fontFamily: "'Montserrat', sans-serif", fontSize: 10, letterSpacing: "0.1em" }}>LOADING...</div>;
  if (error)   return <div style={{ padding: 24, color: "#EF4444", fontFamily: "'Montserrat', sans-serif", fontSize: 11 }}>ERROR: {error}</div>;
  if (!data)   return null;

  const traction   = data.traction_type || "diesel";
  const tractColor = TRACTION[traction]?.color || "#F97316";
  const riskMeta   = RISK_META[data.risk_category] || RISK_META.Low;

  return (
    <div>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E2A45", borderLeft: `3px solid ${tractColor}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#C9D1D9", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.05em" }}>{data.loco_id}</div>
          <div style={{ fontSize: 10, color: "#4A5568", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.08em", marginTop: 4 }}>
            CLASS {data.loco_type} · ZONE {data.zone}<TractionTag t={traction} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ padding: "4px 10px", border: `1px solid ${riskMeta.border}`, color: riskMeta.color, fontSize: 10, fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.08em", borderRadius: 2 }}>{data.risk_category?.toUpperCase()} STATE</span>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #1E2A45", color: "#4A5568", padding: "4px 8px", cursor: "pointer", fontFamily: "'Montserrat', sans-serif", fontSize: 11 }}>✕</button>
        </div>
      </div>

      <div style={{ padding: "12px 18px", borderBottom: "1px solid #1E2A45", background: riskMeta.bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: "#4A5568", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.1em", marginBottom: 4 }}>FAIL PROB</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: riskMeta.color, fontFamily: "'Montserrat', sans-serif" }}>{(data.failure_prob*100).toFixed(2)}%</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#4A5568", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.1em", marginBottom: 4 }}>RU CYCLES</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#C9D1D9", fontFamily: "'Montserrat', sans-serif" }}>{data.ru}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "#1E2A45", marginBottom: 1 }}>
        {[["CYCLE", data.cycle], ["SERVICE AGE", `${data.days_since_svc ?? "—"} d`], ["ZONE", data.zone]].map(([lbl,val]) => (
          <div key={lbl} style={{ padding: "10px 12px", background: "#0D1117" }}>
            <div style={{ fontSize: 9, color: "#4A5568", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.1em", marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#C9D1D9", fontFamily: "'Montserrat', sans-serif" }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: "0.12em", padding: "8px 18px 6px", borderBottom: "1px solid #131B2E", fontFamily: "'Montserrat', sans-serif" }}>REAL-TIME SENSOR READINGS</div>
      <SensorGrid readings={data.sensor_readings} traction={traction} />

      <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: "0.12em", padding: "8px 18px 4px", borderBottom: "1px solid #131B2E", fontFamily: "'Montserrat', sans-serif", marginTop: 1 }}>FAILURE PROBABILITY TREND (LAST 20 CYCLES)</div>
      <div style={{ padding: "8px 18px 14px" }}><RiskTrendChart locoId={locoId} traction={traction} /></div>

      <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: "0.12em", padding: "8px 18px 4px", borderBottom: "1px solid #131B2E", fontFamily: "'Montserrat', sans-serif" }}>LOCAL SHAP DRIVER CONTRIBUTION</div>
      <ShapDrivers drivers={data.top_drivers} traction={traction} />
    </div>
  );
}

export default function App() {
  const [selectedId,  setSelectedId]  = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [elapsed,     setElapsed]     = useState(0);
  const startRef = useRef(new Date());

  const { data: fleet,   loading: fl, error: fe, refetch } = useApi(`${API}/api/fleet`);
  const { data: summary }                                   = useApi(`${API}/api/summary`);

  useEffect(() => {
    const iv = setInterval(() => { refetch(); setLastUpdated(new Date()); startRef.current = new Date(); setElapsed(0); }, POLL_MS);
    return () => clearInterval(iv);
  }, [refetch]);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((new Date() - startRef.current)/1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const locos     = fleet?.locos || [];
  const connected = !fe && locos.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0A0E1A", color: "#C9D1D9", fontFamily: "'Montserrat', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&family=Special+Gothic+Expanded+One&display=swap" rel="stylesheet"/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} body{margin:0}`}</style>

      {/* Header */}
      <div style={{ background: "#0D1117", borderBottom: "1px solid #1E2A45", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src="/logo3.png" alt="LocoSense" style={{ width: 30, height: 30, borderRadius: "50%" }} />
          <span style={{ color: "#2F80ED", fontWeight: 700, fontSize: 13, letterSpacing: "0.15em" }}>LOCOSENSE PREDICTOR</span>
          {/* <span style={{ fontSize: 10, color: "#4A5568" }}>⚡ WAP5 · WAP7 · WAG9 &nbsp;|&nbsp; 🛢 WDG4 · WDP4B</span> */}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 10, color: "#4A5568" }}>


          <span>LAST UPDATED: {lastUpdated.toTimeString().slice(0,8)} ({elapsed}s AGO)</span>
          <button onClick={() => { refetch(); startRef.current = new Date(); setLastUpdated(new Date()); }}
            style={{ background: "transparent", border: "1px solid #1E2A45", color: "#4A5568", padding: "3px 10px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.08em" }}>
            ↺ RESET
          </button>
        </div>
      </div>

      {/* Live Fleet Summary Bar */}
      <LiveFleetSummaryBar summary={summary} locos={locos} />

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", height: "calc(100vh - 120px)", overflow: "hidden" }}>
        {/* Left — Fleet table */}
        <div style={{ overflowY: "auto", borderRight: "1px solid #1E2A45" }}>
          {fl && <div style={{ padding: 24, color: "#2A3A5C", fontSize: 10, letterSpacing: "0.1em" }}>LOADING TELEMETRY...</div>}
          {!fl && locos.length > 0 && <FleetTable locos={locos} onSelect={setSelectedId} selectedId={selectedId} />}
          {!fl && locos.length === 0 && !fe && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#2A3A5C", fontSize: 10, letterSpacing: "0.1em" }}>NO DATA — START FLASK API ON PORT 5001</div>}
        </div>

        {/* Right — Detail panel */}
        <div style={{ overflowY: "auto", background: "#0D1117" }}>
          <LocoDetail locoId={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      </div>
    </div>
  );
}
