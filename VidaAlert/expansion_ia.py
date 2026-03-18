import httpx
import json
import os
from firebase_admin import firestore
from math import radians, sin, cos, sqrt, atan2

# ─── Haversine: distance in metres between two coordinates ───────────────────
def distancia_metros(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    a = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlambda/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))

# ─── Query Google Directions for real-time travel with traffic ───────────────
async def obtener_tiempo_llegada(lat_origen, lon_origen, lat_destino, lon_destino, google_key):
    """
    Returns (time_seconds, distance_metres, mode) choosing the fastest option.
    Timeout: 2.0s — if Google doesn't respond, uses speed-based fallback.
    """
    key = google_key or os.environ.get("GOOGLE_MAPS_KEY")

    # Immediate fallback if no key
    if not key:
        return _fallback_tiempo(lat_origen, lon_origen, lat_destino, lon_destino)

    resultados = {}
    # Timeout reduced to 2.0s — in emergencies 5s is too long
    async with httpx.AsyncClient(timeout=2.0) as client:
        for modo in ["walking", "driving"]:
            try:
                url = (
                    f"https://maps.googleapis.com/maps/api/directions/json"
                    f"?origin={lat_origen},{lon_origen}"
                    f"&destination={lat_destino},{lon_destino}"
                    f"&mode={modo}"
                    f"&departure_time=now"
                    f"&key={key}"
                )
                res = await client.get(url)
                data = res.json()
                if data.get("routes"):
                    leg = data["routes"][0]["legs"][0]
                    duracion = leg.get("duration_in_traffic", leg["duration"])
                    resultados[modo] = {
                        "segundos": duracion["value"],
                        "distancia": leg["distance"]["value"],
                    }
            except Exception as e:
                print(f"⚠️ Directions API mode {modo}: {e} — using fallback")

    if not resultados:
        return _fallback_tiempo(lat_origen, lon_origen, lat_destino, lon_destino)

    mejor_modo = min(resultados, key=lambda m: resultados[m]["segundos"])
    r = resultados[mejor_modo]
    modo_texto = "on foot" if mejor_modo == "walking" else "by car"
    return r["segundos"], r["distancia"], modo_texto

def _fallback_tiempo(lat1, lon1, lat2, lon2):
    """Speed-based estimate if the Directions API does not respond."""
    dist = distancia_metros(lat1, lon1, lat2, lon2)
    tiempo_pie = dist / 1.4    # 1.4 m/s walking
    tiempo_coche = dist / 8.3  # 8.3 m/s car in city
    if tiempo_pie <= tiempo_coche:
        return int(tiempo_pie), int(dist), "on foot"
    return int(tiempo_coche), int(dist), "by car"

# ─── Get candidate responders with real travel times ─────────────────────────
async def obtener_candidatos(lat_emergencia, lon_emergencia, radio_metros, google_key):
    """Returns a list of active responders within the radius with their arrival times."""
    db = firestore.client()
    ubicaciones_snap = db.collection("ubicaciones").where("activo", "==", True).get()
    candidatos = []

    for ubicacion_doc in ubicaciones_snap:
        datos_ubicacion = ubicacion_doc.to_dict()
        uid = ubicacion_doc.id
        lat = datos_ubicacion.get("lat")
        lon = datos_ubicacion.get("lon")

        if not lat or not lon:
            continue

        # Quick radius filter (haversine before calling Directions)
        dist_aprox = distancia_metros(lat_emergencia, lon_emergencia, lat, lon)
        if dist_aprox > radio_metros * 1.5:
            continue

        sanitario_doc = db.collection("sanitarios").document(uid).get()
        if not sanitario_doc.exists:
            continue

        sanitario = sanitario_doc.to_dict()
        if not sanitario.get("activo", True):
            continue

        tiempo_s, distancia_m, modo = await obtener_tiempo_llegada(
            lat, lon, lat_emergencia, lon_emergencia, google_key
        )

        tiempo_limite = radio_metros / 1.4
        if tiempo_s > tiempo_limite * 1.5:
            continue

        candidatos.append({
            "uid": uid,
            "nombre": sanitario.get("nombre", "Responder"),
            "especialidad": sanitario.get("especialidad", "not specified"),
            "verificado": sanitario.get("verificado", False),
            "emergencias_atendidas": sanitario.get("emergencias_atendidas", 0),
            "tasa_aceptacion": sanitario.get("tasa_aceptacion", 0.8),
            "tiempo_medio_desviacion": sanitario.get("tiempo_medio_desviacion", 0),
            "tiempo_llegada_segundos": tiempo_s,
            "distancia_metros": distancia_m,
            "modo_transporte": modo,
            "tiempo_llegada_texto": f"{tiempo_s // 60} min {tiempo_s % 60} s",
        })

    candidatos.sort(key=lambda x: x["tiempo_llegada_segundos"])
    return candidatos

# ─── Get simultaneous active emergencies ────────────────────────────────────
def obtener_emergencias_activas(emergencia_id_actual):
    db = firestore.client()
    snap = db.collection("emergencias").where("estado", "==", "en_camino").get()
    return [d.id for d in snap if d.id != emergencia_id_actual]

# ─── Claude as dispatcher ─────────────────────────────────────────────────────
async def consultar_despachador_ia(candidatos, emergencia_id, emergencias_simultaneas, perfil_reportador=None):
    """Calls Claude with full context and returns the dispatch decision."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("⚠️ No ANTHROPIC_API_KEY found, using default ranking")
        return _ranking_por_defecto(candidatos)

    if not candidatos:
        return {
            "ranking_uids": [],
            "mensajes": {},
            "razonamiento": "No responders available within the current radius.",
            "escalar_144": True,
            "radio_suficiente": False,
            "contingencia": {
                "accion": "escalar_112",
                "umbral_tiempo": "0s",
                "razon": "No responders available within the current radius."
            }
        }

    contexto_sanitarios = "\n".join([
        f"- uid:{c['uid']} name:{c['nombre']} | {c['especialidad']} | "
        f"{c['tiempo_llegada_texto']} {c['modo_transporte']} | "
        f"acceptance_rate:{int(c['tasa_aceptacion']*100)}% | "
        f"deviation:{'+' if c['tiempo_medio_desviacion'] >= 0 else ''}{c['tiempo_medio_desviacion']}s | "
        f"emergencies_attended:{c['emergencias_atendidas']} | "
        f"verified:{'yes' if c['verificado'] else 'no'}"
        for c in candidatos
    ])

    contexto_perfil = ""
    if perfil_reportador:
        contexto_perfil = f"""
MEDICAL PROFILE OF THE REPORTER (may or may not be the patient):
- Blood type: {perfil_reportador.get('grupo_sanguineo', 'unknown')}
- Allergies: {perfil_reportador.get('alergias', 'none known')}
- Medication: {perfil_reportador.get('medicacion', 'none known')}
"""

    prompt = f"""You are the VidAlert dispatch system for real-time cardiac emergencies.

ACTIVE CARDIAC EMERGENCY
ID: {emergencia_id}
Simultaneous emergencies in progress: {len(emergencias_simultaneas)}
{contexto_perfil}
AVAILABLE RESPONDERS (sorted by arrival time):
{contexto_sanitarios}

Your task is to decide who to notify and in what order, considering:
1. Real arrival time with current traffic
2. Medical specialty (cardiology and emergency medicine take priority in cardiac arrests)
3. Historical reliability (acceptance rate and time deviation — negative means arrives early)
4. Professional licence verification
5. If there are simultaneous emergencies, do not assign the best responder to both

Respond ONLY with valid JSON, no additional text or markdown:
{{
  "ranking_uids": ["uid1", "uid2"],
  "mensajes": {{
    "uid1": "push message max 120 characters",
    "uid2": "push message max 120 characters"
  }},
  "razonamiento": "brief explanation in 2-3 sentences",
  "escalar_144": false,
  "radio_suficiente": true,
  "contingencia": {{
    "accion": "escalar_112",
    "umbral_tiempo": "90s",
    "razon": "explanation of when to escalate if nobody accepts"
  }}
}}

Rules for push messages:
- Maximum 120 characters
- Include estimated time and transport mode
- If there is relevant patient information, mention it briefly
- Urgent and clear tone
- First responder in the ranking: indicate they are the nearest qualified responder
- Second responder: indicate they are backup
"""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 1000,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )

            data = res.json()
            texto = data["content"][0]["text"].strip()

            # Strip possible markdown backticks
            if "```" in texto:
                partes = texto.split("```")
                for parte in partes:
                    parte = parte.strip()
                    if parte.startswith("json"):
                        parte = parte[4:].strip()
                    if parte.startswith("{"):
                        texto = parte
                        break

            decision = json.loads(texto)
            print(f"🧠 AI Dispatcher: {decision.get('razonamiento')}")
            print(f"🚨 Contingency: {decision.get('contingencia', {}).get('accion')} in {decision.get('contingencia', {}).get('umbral_tiempo')}")
            return decision

    except Exception as e:
        print(f"❌ AI dispatcher error: {e}")
        return _ranking_por_defecto(candidatos)

# ─── Fallback if Claude fails ─────────────────────────────────────────────────
def _ranking_por_defecto(candidatos):
    """Simple time-based ranking if Claude is unavailable."""
    ranking_uids = [c["uid"] for c in candidatos[:3]]
    mensajes = {}
    for i, c in enumerate(candidatos[:3]):
        prefijo = "You are the nearest qualified responder." if i == 0 else f"Backup #{i+1}."
        mensajes[c["uid"]] = f"Cardiac emergency. {prefijo} {c['tiempo_llegada_texto']} {c['modo_transporte']}."
    return {
        "ranking_uids": ranking_uids,
        "mensajes": mensajes,
        "razonamiento": "Ranked by arrival time (fallback mode, no AI).",
        "escalar_144": False,
        "radio_suficiente": True,
        "contingencia": {
            "accion": "escalar_112",
            "umbral_tiempo": "90s",
            "razon": "Nobody accepts within the time limit."
        }
    }

# ─── Update responder history ─────────────────────────────────────────────────
def actualizar_historial_sanitario(uid, acepto, tiempo_estimado_s=None, tiempo_real_s=None):
    """Updates acceptance rate and time deviation using exponential moving average."""
    db = firestore.client()
    ref = db.collection("sanitarios").document(uid)
    sanitario = ref.get()
    if not sanitario.exists:
        return

    datos = sanitario.to_dict()
    alpha = 0.2  # Smoothing factor — lower = more stable, higher = more reactive

    tasa_actual = datos.get("tasa_aceptacion", 0.8)
    nueva_tasa = round(alpha * (1.0 if acepto else 0.0) + (1 - alpha) * tasa_actual, 3)
    update = {"tasa_aceptacion": nueva_tasa}

    if acepto and tiempo_estimado_s and tiempo_real_s:
        desviacion_actual = datos.get("tiempo_medio_desviacion", 0)
        nueva_desviacion = int(alpha * (tiempo_real_s - tiempo_estimado_s) + (1 - alpha) * desviacion_actual)
        update["tiempo_medio_desviacion"] = nueva_desviacion
        update["emergencias_atendidas"] = datos.get("emergencias_atendidas", 0) + 1

    ref.update(update)
    print(f"📊 Responder history updated for {uid}: rate={nueva_tasa}")

# ─── Main function: dispatch emergency ───────────────────────────────────────
async def despachar_emergencia(emergencia_id, lat, lon, uid_reportador, google_key=None, radio=300):
    """Main dispatcher function. Returns Claude's decision."""
    google_key = google_key or os.environ.get("GOOGLE_MAPS_KEY")

    print(f"🚨 Dispatching emergency {emergencia_id} | radius={radio}m")

    db = firestore.client()

    # Reporter profile (optional)
    perfil_reportador = None
    ciudadano_doc = db.collection("ciudadanos").document(uid_reportador).get()
    if ciudadano_doc.exists:
        perfil_reportador = ciudadano_doc.to_dict()

    # Candidates with real travel times
    candidatos = await obtener_candidatos(lat, lon, radio, google_key)
    print(f"👥 Candidates within {radio}m: {len(candidatos)}")

    # Simultaneous emergencies
    emergencias_simultaneas = obtener_emergencias_activas(emergencia_id)

    # Query Claude
    decision = await consultar_despachador_ia(
        candidatos, emergencia_id, emergencias_simultaneas, perfil_reportador
    )

    # If radius is insufficient, escalate immediately without waiting
    if not decision.get("radio_suficiente", True) and radio < 600:
        radios = [300, 400, 600]
        try:
            nuevo_radio = radios[radios.index(radio) + 1]
        except (ValueError, IndexError):
            nuevo_radio = 600
        print(f"📡 AI indicates insufficient radius — retrying with {nuevo_radio}m")
        candidatos_ampliados = await obtener_candidatos(lat, lon, nuevo_radio, google_key)
        if candidatos_ampliados:
            decision = await consultar_despachador_ia(
                candidatos_ampliados, emergencia_id, emergencias_simultaneas, perfil_reportador
            )
            candidatos = candidatos_ampliados
            radio = nuevo_radio

    # Save reasoning to Firestore for auditability
    db.collection("emergencias").document(emergencia_id).update({
        "razonamiento_ia": decision.get("razonamiento"),
        "contingencia_ia": decision.get("contingencia"),
        "radio_actual": radio,
        "candidatos_evaluados": len(candidatos),
        "ranking_ia": decision.get("ranking_uids", []),
    })

    # Attach candidates to result
    decision["candidatos"] = candidatos
    return decision