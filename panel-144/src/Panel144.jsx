import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

function timeElapsed(timestamp) {
  if (!timestamp) return "—";
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}:${(diff % 60).toString().padStart(2, "0")}`;
}

function isAlert(timestamp, threshold = 120) {
  if (!timestamp) return false;
  return (Date.now() - new Date(timestamp).getTime()) / 1000 > threshold;
}

// ─── AI TEXT TRANSLATOR ───────────────────────────────────────────────────────
// Detects Spanish and translates to English via the Anthropic API
const translationCache = {};

async function translateToEnglish(text) {
  if (!text) return text;
  if (translationCache[text]) return translationCache[text];

  // Skip if it looks already English (no Spanish diacritics or common words)
  const spanishPattern = /[áéíóúüñÁÉÍÓÚÜÑ]|(?:\b(?:no|hay|sin|los|las|del|disponibles|sanitarios|radio|actual|camino|ninguno|asignado|emergencia|tiempo|activa|cerca|respondedor)\b)/i;
  if (!spanishPattern.test(text)) {
    translationCache[text] = text;
    return text;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Translate this emergency dispatch text from Spanish to English. Return ONLY the translated text, no explanation:\n\n${text}`
        }]
      })
    });
    const data = await response.json();
    const translated = data.content?.[0]?.text?.trim() ?? text;
    translationCache[text] = translated;
    return translated;
  } catch {
    return text;
  }
}

// Hook: auto-translates a text field, returns translated version
function useTranslated(text) {
  const [translated, setTranslated] = useState(text ?? "");
  useEffect(() => {
    if (!text) { setTranslated(""); return; }
    setTranslated(text); // show original while translating
    translateToEnglish(text).then(setTranslated);
  }, [text]);
  return translated;
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const token = await cred.user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/usuarios/rol/${cred.user.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.rol !== "operador_144") {
        await signOut(auth);
        setError("Access restricted to 144 operators.");
        return;
      }
      onLogin(cred.user);
    } catch {
      setError("Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#0C447C" }}>
      <div style={{ background:"white", borderRadius:16, padding:"48px 40px", width:420, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:700, color:"#0C447C", marginBottom:4 }}>VidAlert</div>
          <div style={{ fontSize:14, color:"#378ADD" }}>144 Coordination Centre</div>
        </div>
        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:20 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <label style={{ fontSize:12, fontWeight:600, color:"#378ADD", textTransform:"uppercase", letterSpacing:"0.5px" }}>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="operator@144.com" required
              style={{ padding:"12px 16px", borderRadius:8, border:"1.5px solid #B5D4F4", fontSize:15, color:"#0C447C", outline:"none" }} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <label style={{ fontSize:12, fontWeight:600, color:"#378ADD", textTransform:"uppercase", letterSpacing:"0.5px" }}>Password</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required
              style={{ padding:"12px 16px", borderRadius:8, border:"1.5px solid #B5D4F4", fontSize:15, color:"#0C447C", outline:"none" }} />
          </div>
          {error && <div style={{ background:"#FCEBEB", color:"#A32D2D", padding:"10px 14px", borderRadius:8, fontSize:13 }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ background:"#185FA5", color:"white", border:"none", borderRadius:10, padding:"14px", fontSize:15, fontWeight:700, cursor:"pointer", marginTop:4 }}>
            {loading ? "Signing in..." : "Access panel"}
          </button>
        </form>
        <p style={{ fontSize:12, color:"#B5D4F4", textAlign:"center", marginTop:24 }}>Access restricted to authorised 144 personnel</p>
      </div>
    </div>
  );
}

// ─── DYNAMIC MAP (Leaflet via CDN — no API key required) ──────────────────────
function Mapa({ emergencias, sanitarios, selectedId }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // Load Leaflet CSS + JS once
  useEffect(() => {
    const cssId = "leaflet-css";
    const jsId = "leaflet-js";

    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (mapRef.current || !containerRef.current || !window.L) return;
      const L = window.L;
      const map = L.map(containerRef.current, { zoomControl: true }).setView([40.416, -3.703], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    };

    if (window.L) {
      initMap();
    } else if (!document.getElementById(jsId)) {
      const script = document.createElement("script");
      script.id = jsId;
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      // Script tag exists but may still be loading
      const interval = setInterval(() => {
        if (window.L) { clearInterval(interval); initMap(); }
      }, 100);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers on data change
  useEffect(() => {
    const waitForMap = setInterval(() => {
      if (!mapRef.current || !window.L) return;
      clearInterval(waitForMap);

      const L = window.L;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      const bounds = [];

      emergencias.forEach(e => {
        if (e.lat == null || e.lon == null) return;
        const isSelected = e.id === selectedId;
        const hasResponder = !!e.respondedor_asignado;
        const color = hasResponder ? "#1D9E75" : "#E24B4A";
        const size = isSelected ? 20 : 14;

        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${color};border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.35);
            ${isSelected ? "outline:3px solid #185FA5;outline-offset:2px;" : ""}
          "></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker([e.lat, e.lon], { icon })
          .addTo(mapRef.current)
          .bindPopup(`
            <b style="color:#0C447C">Emergency ${e.id.slice(0,8).toUpperCase()}</b><br/>
            <span style="color:#378ADD">${hasResponder ? "Responder on the way ✅" : "Unassigned ⚠️"}</span>
          `);

        if (isSelected) marker.openPopup();
        markersRef.current.push(marker);
        bounds.push([e.lat, e.lon]);
      });

      sanitarios.forEach(s => {
        if (s.lat == null || s.lon == null || !s.activo) return;
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width:12px;height:12px;border-radius:50%;
            background:#185FA5;border:2px solid white;
            box-shadow:0 1px 5px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const marker = L.marker([s.lat, s.lon], { icon })
          .addTo(mapRef.current)
          .bindPopup(`<b style="color:#0C447C">Responder</b><br/><span style="color:#378ADD">Available</span>`);
        markersRef.current.push(marker);
        bounds.push([s.lat, s.lon]);
      });

      if (bounds.length > 0) {
        try { mapRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 }); } catch {}
      }
    }, 100);

    return () => clearInterval(waitForMap);
  }, [emergencias, sanitarios, selectedId]);

  return (
    <div style={{ width:"100%", height:"100%", position:"relative", minHeight:0 }}>
      <div ref={containerRef} style={{ width:"100%", height:"100%" }} />
      {/* Legend */}
      <div style={{
        position:"absolute", bottom:12, left:12, zIndex:1000,
        background:"white", borderRadius:8, padding:"6px 14px",
        display:"flex", gap:16, border:"1px solid #B5D4F4",
        boxShadow:"0 2px 8px rgba(0,0,0,0.1)",
      }}>
        {[["#E24B4A","Active emergency"],["#1D9E75","On the way"],["#185FA5","Available responder"]].map(([color, label]) => (
          <span key={label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#378ADD" }}>
            <span style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── EMERGENCY CARD ──────────────────────────────────────────────────────────
function EmCard({ em, seleccionada, onClick }) {
  const alerta = !em.respondedor_asignado && isAlert(em.timestamp);
  return (
    <div onClick={onClick} style={{
      padding:"14px 16px",
      borderBottom:"1px solid #EEF5FC",
      cursor:"pointer",
      borderLeft: seleccionada ? "4px solid #185FA5" : alerta ? "4px solid #E24B4A" : "4px solid transparent",
      background: seleccionada ? "#EEF5FC" : "white",
      animation: alerta && !seleccionada ? "pulse 1.5s infinite" : "none",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:14, fontWeight:700, color:"#0C447C", fontFamily:"monospace" }}>
          {em.id.slice(0,8).toUpperCase()}
        </span>
        <span style={{
          fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:20,
          background: em.respondedor_asignado ? "#E1F5EE" : "#FCEBEB",
          color: em.respondedor_asignado ? "#0F6E56" : "#A32D2D",
        }}>
          {em.respondedor_asignado ? "On the way" : "Unassigned"}
        </span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:13, color:"#B5D4F4" }}>Ago</span>
        <span style={{ fontSize:13, fontWeight:600, color:"#378ADD" }}>{timeElapsed(em.timestamp)}</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom: alerta ? 8 : 0 }}>
        <span style={{ fontSize:13, color:"#B5D4F4" }}>Radius</span>
        <span style={{ fontSize:13, fontWeight:600, color:"#378ADD" }}>{em.radio_actual ?? 300}m</span>
      </div>
      {em.razonamiento_ia && (
        <div style={{ fontSize:12, color:"#378ADD", marginTop:6, fontStyle:"italic",
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          AI: {em.razonamiento_ia}
        </div>
      )}
      {alerta && (
        <div style={{ fontSize:12, color:"#E24B4A", fontWeight:600, marginTop:6 }}>
          ⚠ No response — consider escalating
        </div>
      )}
    </div>
  );
}

// ─── DETAIL (AI text auto-translated to English) ─────────────────────────────
function Detalle({ em, onEscalar }) {
  // Translate AI-generated Spanish text on the fly
  const translatedReasoning = useTranslated(em?.razonamiento_ia ?? "");
  const translatedContingencyRazon = useTranslated(em?.contingencia_ia?.razon ?? "");

  if (!em) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <span style={{ fontSize:14, color:"#B5D4F4", textAlign:"center" }}>
        Select an emergency to view details
      </span>
    </div>
  );

  const radios = [300, 400, 600];
  const radioIdx = radios.indexOf(em.radio_actual ?? 300);

  return (
    <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14, flex:1, overflowY:"auto" }}>
      <div style={{ fontSize:16, fontWeight:700, color:"#0C447C", fontFamily:"monospace" }}>
        Emergency {em.id.slice(0,8).toUpperCase()}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {[
          ["Status", em.estado ?? "active"],
          ["Source", em.origen ?? "app"],
          ["Candidates evaluated", em.candidatos_evaluados ?? 0],
          ["Time elapsed", timeElapsed(em.timestamp)],
        ].map(([label, val]) => (
          <div key={label} style={{ background:"#F0F6FD", borderRadius:8, padding:"10px 12px" }}>
            <div style={{ fontSize:12, color:"#378ADD", marginBottom:3 }}>{label}</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#0C447C" }}>{val}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize:13, color:"#378ADD", marginBottom:8 }}>Search radius</div>
        <div style={{ display:"flex", alignItems:"center" }}>
          {radios.map((r, i) => (
            <div key={r} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ width:32, height:8, borderRadius:4, background: i <= radioIdx ? "#185FA5" : "#E6F1FB" }} />
              <span style={{ fontSize:12, color:"#378ADD", margin:"0 6px" }}>{r}m</span>
              {i < radios.length - 1 && <div style={{ width:8, height:2, background:"#E6F1FB" }} />}
            </div>
          ))}
        </div>
      </div>

      {em.razonamiento_ia && (
        <div style={{ background:"#E6F1FB", borderLeft:"4px solid #185FA5", borderRadius:"0 8px 8px 0", padding:"12px 14px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#185FA5", marginBottom:6 }}>🧠 AI Reasoning</div>
          <div style={{ fontSize:13, color:"#0C447C", lineHeight:1.6 }}>
            {translatedReasoning || em.razonamiento_ia}
          </div>
        </div>
      )}

      {em.contingencia_ia && (
        <div style={{ background:"#FCEBEB", borderLeft:"4px solid #E24B4A", borderRadius:"0 8px 8px 0", padding:"12px 14px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#A32D2D", marginBottom:6 }}>⚡ Contingency</div>
          <div style={{ fontSize:13, color:"#A32D2D", lineHeight:1.6 }}>
            Escalate in {em.contingencia_ia.umbral_tiempo} if no response.{" "}
            {translatedContingencyRazon || em.contingencia_ia.razon}
          </div>
        </div>
      )}

      <button onClick={() => onEscalar(em.id)}
        style={{ background:"#E24B4A", color:"white", border:"none", borderRadius:10, padding:"13px", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:"auto" }}>
        Escalate to 112 manually
      </button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function Panel144() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [emergencias, setEmergencias] = useState([]);
  const [sanitarios, setSanitarios] = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const token = await u.getIdToken();
          const res = await fetch(`${BACKEND_URL}/usuarios/rol/${u.uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (data.rol === "operador_144") setUser(u);
          else { await signOut(auth); setUser(null); }
        } catch { setUser(null); }
      } else setUser(null);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "emergencias"), where("estado", "in", ["activa", "en_camino"]));
    return onSnapshot(q, snap => setEmergencias(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "ubicaciones"), where("activo", "==", true));
    return onSnapshot(q, snap => setSanitarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  const escalar112 = async (id) => {
    if (!window.confirm("Confirm escalating this emergency to 112?")) return;
    await updateDoc(doc(db, "emergencias", id), { escalar_112: true, estado: "escalada" });
    alert("Emergency escalated to 112. Recorded in the system.");
  };

  if (!authChecked) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"#378ADD", fontSize:16 }}>
      Loading...
    </div>
  );
  if (!user) return <Login onLogin={setUser} />;

  const emActivas = emergencias.filter(e => !e.respondedor_asignado).length;
  const emEnCamino = emergencias.filter(e => e.respondedor_asignado).length;
  const emAlerta = emergencias.filter(e => !e.respondedor_asignado && isAlert(e.timestamp)).length;
  const emSeleccionada = emergencias.find(e => e.id === seleccionada) ?? null;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", fontFamily:"'DM Sans','Segoe UI',sans-serif", background:"#EEF5FC" }}>
      <style>{`
        @keyframes pulse { 0%,100%{border-left-color:#E24B4A} 50%{border-left-color:#F09595} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #B5D4F4; border-radius: 2px; }
        .leaflet-container { font-family: 'DM Sans','Segoe UI',sans-serif !important; }
      `}</style>

      {/* TOPBAR */}
      <div style={{ background:"#0C447C", padding:"0 24px", height:52, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:17, fontWeight:700, color:"white" }}>VidAlert</span>
          <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>144 Coordination Centre</span>
          <span style={{ background:"#E24B4A", color:"white", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>LIVE</span>
          {emAlerta > 0 && (
            <span style={{ background:"rgba(226,75,74,0.2)", color:"#F09595", fontSize:12, fontWeight:600, padding:"3px 12px", borderRadius:20, border:"1px solid rgba(226,75,74,0.3)" }}>
              ⚠ {emAlerta} without response
            </span>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:13, color:"rgba(255,255,255,0.6)" }}>{user.email}</span>
          <button onClick={() => signOut(auth)}
            style={{ background:"transparent", color:"rgba(255,255,255,0.7)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:8, padding:"6px 16px", fontSize:13, cursor:"pointer" }}>
            Sign out
          </button>
        </div>
      </div>

      {/* METRICS */}
      <div style={{ background:"#0C447C", padding:"10px 24px 16px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, flexShrink:0 }}>
        {[
          [emActivas, "Unassigned", "#E24B4A"],
          [emEnCamino, "On the way", "#1D9E75"],
          [sanitarios.length, "Active responders", "#85B7EB"],
          [emergencias.length, "Total emergencies", "#B5D4F4"],
        ].map(([val, label, color]) => (
          <div key={label} style={{ background:"rgba(255,255,255,0.08)", borderRadius:10, padding:"12px 18px" }}>
            <div style={{ fontSize:32, fontWeight:700, color, lineHeight:1, marginBottom:4 }}>{val}</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px 340px", gap:12, padding:12, flex:1, minHeight:0, overflow:"hidden" }}>

        {/* MAP */}
        <div style={{ background:"white", borderRadius:12, border:"1px solid #B5D4F4", overflow:"hidden", minWidth:0, display:"flex" }}>
          <Mapa emergencias={emergencias} sanitarios={sanitarios} selectedId={seleccionada} />
        </div>

        {/* LIST */}
        <div style={{ background:"white", borderRadius:12, border:"1px solid #B5D4F4", display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
          <div style={{ padding:"14px 16px 12px", borderBottom:"1px solid #EEF5FC", flexShrink:0 }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#378ADD", textTransform:"uppercase", letterSpacing:"0.5px" }}>
              Active emergencies
            </span>
          </div>
          <div style={{ flex:1, overflowY:"auto" }}>
            {emergencias.length === 0 ? (
              <div style={{ padding:32, fontSize:14, color:"#B5D4F4", textAlign:"center" }}>
                No active emergencies
              </div>
            ) : (
              [...emergencias]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .map(em => (
                  <EmCard
                    key={em.id}
                    em={em}
                    seleccionada={seleccionada === em.id}
                    onClick={() => setSeleccionada(em.id === seleccionada ? null : em.id)}
                  />
                ))
            )}
          </div>
        </div>

        {/* DETAIL */}
        <div style={{ background:"white", borderRadius:12, border:"1px solid #B5D4F4", display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
          <div style={{ padding:"14px 16px 12px", borderBottom:"1px solid #EEF5FC", flexShrink:0 }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#378ADD", textTransform:"uppercase", letterSpacing:"0.5px" }}>
              Detail
            </span>
          </div>
          <Detalle em={emSeleccionada} onEscalar={escalar112} />
        </div>
      </div>
    </div>
  );
}