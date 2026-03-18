# VidAlert 🫀

> Real-time cardiac emergency response system that coordinates bystanders, certified responders, 144 operators and ambulances.

In a cardiac arrest, every minute without CPR reduces survival chances by 7–10%. Ambulances take an average of 8–12 minutes to arrive, while a nearby certified responder can get there in under 4. VidAlert bridges that critical gap.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Emergency Flow](#emergency-flow)
- [AI Dispatcher](#ai-dispatcher)
- [Roles](#roles)
- [Firestore Collections](#firestore-collections)
- [Features](#features)
- [Pending / Roadmap](#pending--roadmap)

---

## Architecture

```
Mobile App (React Native + Expo)   ←→  Responders & Citizens
              |
Backend (FastAPI / Python)         ←→  REST API + AI Dispatcher
              |
Firebase Firestore                 ←→  Real-time database
              |
144 Web Panel (React + Vite)       ←→  Coordination centre dashboard
```

Firebase Auth handles identity directly from the frontend. The 144 web panel is a standalone React app with access restricted to verified operators.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Mobile frontend | React Native + Expo | iOS & Android app for responders and citizens |
| Backend | FastAPI (Python) | REST API, business logic, validations |
| Database | Firebase Firestore | Real-time storage with live sync |
| Auth | Firebase Auth | Login and registration with JWT tokens |
| Push notifications | Expo Notifications + FCM V1 | Alerts to responders via Firebase Cloud Messaging |
| Messaging | Twilio WhatsApp | Emergency channel for bystanders without the app |
| CPR guide AI | Claude API (Anthropic) | Real-time CPR guidance via WhatsApp |
| Dispatcher AI | Claude API (Anthropic) | Intelligent responder ranking per emergency |
| Maps & routing | Google Maps + Directions API | Location, real-time routing and navigation |
| GPS | expo-location | Real-time location every 15 seconds |
| 144 Panel | React + Vite | Web dashboard for 144 operators |
| Build | EAS (Expo) | Compiling the app for Android and iOS |
| Public tunnel | ngrok | Expose local backend to Twilio in development |

---

## Project Structure

```
vidalert/
├── firstvoice/                  # Mobile app (React Native + Expo)
│   ├── app/
│   │   ├── _layout.tsx          # Root layout: setNotificationHandler + AuthProvider
│   │   └── (tabs)/
│   │       ├── _layout.tsx      # Tab bar with SVG icons by role
│   │       ├── index.tsx        # Login / registration with role check + SVG logo
│   │       ├── dashboard.tsx    # Responder dashboard + logout
│   │       ├── perfil.tsx       # Medical profile + emergency button + logout
│   │       ├── mapa.tsx         # Differentiated map: responder navigation / citizen tracking
│   │       ├── alerta.tsx       # Alert screen: accept/reject via backend
│   │       └── incentivos.tsx   # Points, levels and stats for responders
│   ├── AuthContext.tsx           # Global context: user, role, name
│   ├── authService.ts            # Firebase login/register/logout functions
│   ├── firebaseConfig.ts         # Firebase config (exports auth and db)
│   ├── Notificaciones.ts         # Android channel + push token + listener hook
│   ├── useUbicacion.ts           # GPS hook + send to Firestore every 15s
│   └── .env                      # Frontend environment variables
│
├── VidaAlert/                   # Backend (FastAPI / Python)
│   ├── main.py                  # Main server, registers routers
│   ├── Usuarios.py              # register/login/role endpoints (responder/citizen/operator_144)
│   ├── emergencias.py           # activate/accept/reject/close/scale-radius endpoints
│   ├── notificaciones.py        # Individual and bulk push + FCM ticket reading
│   ├── expansion_ia.py          # AI dispatcher: Claude ranking + Directions API times
│   ├── twilio_wa.py             # WhatsApp webhook + AI CPR guide
│   ├── ia_generativa_testigo.py # Medical AI to guide emergencies via WhatsApp
│   ├── nfc.py                   # NFC token generation and medical history access
│   ├── firebase-adminsdk.json   # Firebase Admin credentials (SECRET — never commit)
│   ├── seed.py                  # Script to load test data
│   └── .env                     # Backend environment variables
│
├── panel-144/                   # 144 Coordination Centre web panel (React + Vite)
│   ├── src/
│   │   └── Panel144.jsx         # Full panel: login, map, emergency list, AI detail
│   └── .env                     # Panel environment variables
│
└── VidAlertWatch/               # Wear OS module (Kotlin)
    ├── AlertaEscaladaManager.kt # 3-phase alert logic (vibration, sound, countdown)
    ├── AlertaEscaladaActivity.kt# Main wearable activity: evaluates and activates
    └── MainActivity.kt          # Main watch screen with TEST ALERT button
```

---

## Getting Started

### Prerequisites

- Python 3.11+ with conda
- Node.js 18+
- Expo CLI + EAS CLI
- Firebase project with Firestore and Auth enabled
- Anthropic API key
- Google Maps API key (Directions API enabled)
- Twilio account with WhatsApp Sandbox (optional, for WhatsApp flow)
- ngrok (optional, for Twilio webhook in development)

### 1. Backend

```bash
cd VidaAlert
conda activate your-env
pip install -r requirements.txt

# Place your firebase-adminsdk.json in this folder (never commit it)
# Fill in .env (see Environment Variables section)

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> **Windows firewall:** open port 8000 so the mobile app can reach the backend on the local network:
> ```
> netsh advfirewall firewall add rule name="Port 8000" dir=in action=allow protocol=TCP localport=8000
> ```

### 2. Mobile App

```bash
cd firstvoice
npm install

# Fill in .env (see Environment Variables section)
# Use your machine's local IP, not localhost

npx expo start --dev-client
```

### 3. 144 Web Panel

```bash
cd panel-144
npm install

# Fill in .env (see Environment Variables section)

npm run dev
# Access at http://localhost:5173 with an operator_144 account
```

### 4. Twilio WhatsApp tunnel (optional)

```bash
ngrok http 8000
# Copy the HTTPS URL into:
# Twilio Console > WhatsApp Sandbox > Webhook URL → <url>/whatsapp/webhook
```

---

## Environment Variables

### Backend (`VidaAlert/.env`)

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_MAPS_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXX
NFC_SECRET=your-nfc-jwt-secret
```

### Mobile App (`firstvoice/.env`)

```env
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.XXX:8000
EXPO_PUBLIC_GOOGLE_MAPS_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXX
```

> Use your machine's **local IP address**, not `localhost`. The mobile device cannot reach `localhost` on the computer.

### 144 Web Panel (`panel-144/.env`)

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_BACKEND_URL=http://192.168.1.XXX:8000
VITE_GOOGLE_MAPS_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXX
```

> ⚠️ **Never commit** `.env` files or `firebase-adminsdk.json` to Git. They are already included in `.gitignore`.

---

## Emergency Flow

### Via app (citizen)

1. Citizen taps **ACTIVATE EMERGENCY** → app gets GPS coords and sends to backend
2. FastAPI creates the emergency in Firestore with status `activa`
3. `expansion_ia.py` fetches active responder locations within 300m radius
4. Calls Google Directions API (2s timeout) for real walking/driving times per candidate
5. Passes full context to Claude API: candidates, specialties, historical reliability, simultaneous emergencies
6. Claude returns `ranking_uids`, personalised push messages, reasoning and contingency plan
7. If `radio_suficiente=false`, retries immediately with a larger radius
8. Backend sends individual push notifications with real distance and time to each ranked responder
9. Automatic escalation is scheduled based on Claude's `umbral_tiempo`
10. Responder receives notification → taps → alert screen opens
11. Responder taps **I'm on my way** → `POST /emergencias/aceptar`
12. FastAPI checks for double assignment (409 if already has a responder), assigns and sets status to `en_camino`
13. Rest of responders are notified the emergency is covered
14. Responder map shows red route via Directions API
15. Citizen map shows the responder's dot moving in real time
16. Responder taps **Emergency resolved** → `POST /emergencias/cerrar`
17. Real vs estimated time deviation is calculated and responder's `tiempo_medio_desviacion` is updated

### Via WhatsApp (bystander without the app)

1. Bystander sends a WhatsApp to the Twilio number
2. Twilio calls the webhook `POST /whatsapp/webhook` via ngrok
3. FastAPI passes the message to Claude API for CPR guidance
4. Claude guides the bystander and asks them to share their Google Maps location
5. Bystander shares location → Twilio sends Latitude/Longitude
6. FastAPI detects coordinates, creates the emergency and activates the AI dispatcher
7. Same flow from step 3 of the app flow

### Automatic radius escalation

- If nobody accepts within Claude's threshold (normally 90s), radius expands: 300m → 400m → 600m
- Escalation also triggers if all responders in `ranking_ia` reject
- Claude re-evaluates with new candidates at each escalation
- If max radius is reached with no response, `escalar_144: true` is set

### Wearable flow (Wear OS)

1. Watch detects a vital sign anomaly (BPM, SpO2, steps, movement, fall)
2. Watch calls `POST /emergencias/evaluar-wearable` with sensor data and GPS
3. Backend applies hard rules (fall, critical BPM/SpO2) or consults Claude in grey zone with the citizen's medical profile
4. If backend responds `ACTIVATE`, watch launches the 90-second escalating alert sequence:
   - 0–30s: soft vibration + yellow screen
   - 30–60s: strong vibration + orange screen
   - 60–90s: alarm sound + red screen (user can cancel at any time)
5. If user does not cancel in 90s, watch calls `POST /emergencias/activar-wearable` → same dispatch flow as the app

---

## AI Dispatcher

`expansion_ia.py` is the brain of the system. Claude acts as an intelligent dispatcher instead of a fixed algorithm.

### What Claude receives

- List of candidates with uid, name, specialty, real arrival time (walking vs driving), historical acceptance rate, average time deviation, emergencies attended, and verification status
- Number of simultaneous active emergencies (to avoid assigning the best responder to multiple at once)
- Medical profile of the reporter if available (may or may not be the patient)

### Decisions Claude makes

| Decision | Description |
|---|---|
| `ranking_uids` | UIDs to notify (max 3), prioritising cardiac specialty, reliability and arrival time |
| `mensajes` | Personalised push message per responder (max 120 chars) |
| `razonamiento` | Explanatory reasoning saved to Firestore for auditability |
| `radio_suficiente` | If false, system retries immediately with a larger radius |
| `contingencia` | Action, time threshold and reason — used to schedule automatic escalation |

### Fallback

If the Claude API fails or times out, the system falls back to ranking by arrival time without interrupting the emergency flow.

---

## Roles

| Role | Screens | Main function |
|---|---|---|
| `sanitario` | Home + Map (navigation) + Alert + Incentives | Receives personalised AI alerts, accepts emergencies, sees real-time route |
| `ciudadano` | Map (tracking) + Medical Profile | Activates emergencies, sees responder moving in real time |
| `operador_144` | 144 Web Panel | Global view of emergencies, AI reasoning, escalation to 112 |

Role verification on login prevents a responder from signing in as a citizen and vice versa.

---

## Firestore Collections

### `ciudadanos`
```json
{
  "uid": "...",
  "nombre": "...",
  "email": "...",
  "grupo_sanguineo": "A+",
  "alergias": "Penicillin",
  "medicacion": "Enalapril",
  "contacto_emergencia": "+34 600...",
  "edad": 65,
  "patologias": "Hypertension",
  "vinculo_reloj": false,
  "rol": "ciudadano"
}
```

### `sanitarios`
```json
{
  "uid": "...",
  "nombre": "...",
  "email": "...",
  "colegiado": "28/123456",
  "especialidad": "Cardiology",
  "rol": "sanitario",
  "verificado": false,
  "activo": true,
  "tasa_aceptacion": 0.8,
  "tiempo_medio_desviacion": 0,
  "emergencias_atendidas": 0
}
```

> `tasa_aceptacion` and `tiempo_medio_desviacion` are updated with exponential moving average (alpha=0.2) after each emergency.

### `emergencias`
```json
{
  "uid_ciudadano": "...",
  "nombre": "...",
  "lat": 40.416,
  "lon": -3.703,
  "estado": "activa | en_camino | atendida | escalada",
  "respondedor_asignado": null,
  "rechazos": [],
  "radio_actual": 300,
  "ranking_ia": ["uid1", "uid2"],
  "razonamiento_ia": "...",
  "contingencia_ia": { "accion": "escalar_112", "umbral_tiempo": "90s", "razon": "..." },
  "tiempos_estimados": { "uid1": 180 },
  "candidatos_evaluados": 3,
  "timestamp": "...",
  "timestamp_aceptacion": "...",
  "timestamp_cierre": "...",
  "tiempo_respuesta_real_segundos": 210,
  "origen": "app | whatsapp | wearable"
}
```

### `ubicaciones`
```json
{ "uid": "...", "lat": 40.416, "lon": -3.703, "activo": true, "timestamp": "..." }
```

### `push_tokens`
```json
{ "uid": "...", "token": "ExponentPushToken[...]", "timestamp": "..." }
```

### `nfc_tokens`
```json
{
  "jti": "...",
  "uid_ciudadano": "...",
  "uid_sanitario": null,
  "estado": "pendiente | usado",
  "timestamp_emision": "...",
  "timestamp_uso": null,
  "expira_en": 600
}
```

---

## Features

- ✅ Full emergency flow via app, WhatsApp and wearable
- ✅ AI dispatcher with Claude (ranking, personalised messages, reasoning, contingency)
- ✅ Automatic radius escalation (300m → 400m → 600m)
- ✅ Real-time GPS tracking (responder dot moves on citizen's map)
- ✅ Individual push notifications with real distance and ETA
- ✅ Double-assignment protection (409 Conflict)
- ✅ Responder reliability history (acceptance rate + time deviation)
- ✅ NFC medical history access in the field (single-use token, 10 min expiry)
- ✅ Wear OS module with 3-phase escalating alert and sport detection
- ✅ Incentives system for responders (points, levels, vacation minutes)
- ✅ 144 web panel with live Leaflet map, AI reasoning and manual 112 escalation
- ✅ CPR guidance via WhatsApp for bystanders without the app (Claude)
- ✅ All UI and AI responses in English

---

## Pending / Roadmap

| Feature | Description | Priority |
|---|---|---|
| `SensorService.kt` | Background sensor service on the watch (continuous monitoring without opening the app) | High |
| UID sync watch ↔ app | Send uid from mobile to watch via Wear OS Data Layer API | High |
| Real GPS on watch | Replace simulated coordinates with FusedLocationProviderClient | Medium |
| iOS NFC emission | HCE not supported on CoreNFC — offer QR as alternative | Medium |
| Cloud deploy | Backend currently runs locally only | Low |

---

## Git Setup

```bash
# In the project root
git init
git add .
git commit -m "feat: initial commit — VidAlert v5.0"

# Connect to your remote repo
git remote add origin https://github.com/your-username/vidalert.git
git push -u origin main
```

### Recommended `.gitignore`

```gitignore
# Secrets — never commit these
.env
firebase-adminsdk.json
*.keystore
google-services.json
GoogleService-Info.plist

# Dependencies
node_modules/
__pycache__/
*.pyc
.expo/
dist/
build/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m "feat: description"`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

*VidAlert — Saving lives in real time* 🫀
