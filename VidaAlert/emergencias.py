import os
import json
import asyncio
import anthropic
from fastapi import APIRouter, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from datetime import datetime
from notificaciones import enviar_notificacion_individual
from expansion_ia import despachar_emergencia, actualizar_historial_sanitario

router = APIRouter(prefix="/emergencias", tags=["emergencies"])

RADIO_INICIAL = 300
RADIOS_ESCALADO = [300, 400, 600]


# ─────────────────────────────────────────────────────────────────────────────
# MODELS
# ─────────────────────────────────────────────────────────────────────────────

class EmergenciaRequest(BaseModel):
    uid: str
    lat: float
    lon: float

class AceptarRequest(BaseModel):
    emergencia_id: str
    uid_sanitario: str

class RechazarRequest(BaseModel):
    emergencia_id: str
    uid_sanitario: str

class CerrarRequest(BaseModel):
    emergencia_id: str
    uid_sanitario: str

class DatosWearable(BaseModel):
    uid_ciudadano: str
    bpm: int
    spo2: int
    pasos: int = 0                  # steps in the last interval
    movimiento: str                 # "active" | "inactive" | "sleeping" | "fall"
    tiempo_sin_movimiento: int = 0  # minutes without significant movement
    caida_detectada: bool = False
    lat: float                      # watch location at time of event
    lon: float                      # watch location at time of event


# ─────────────────────────────────────────────────────────────────────────────
# ACTIVATE EMERGENCY (from the citizen app)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/activar")
async def activar_emergencia(emergencia: EmergenciaRequest, authorization: str = None):
    db = firestore.client()

    ciudadano = db.collection("ciudadanos").document(emergencia.uid).get()
    if not ciudadano.exists:
        raise HTTPException(status_code=404, detail="Citizen not found")

    datos = ciudadano.to_dict()

    ref = db.collection("emergencias").add({
        "uid_ciudadano": emergencia.uid,
        "nombre": datos.get("nombre", ""),
        "lat": emergencia.lat,
        "lon": emergencia.lon,
        "estado": "activa",
        "timestamp": datetime.utcnow().isoformat(),
        "respondedor_asignado": None,
        "rechazos": [],
        "radio_actual": RADIO_INICIAL,
        "razonamiento_ia": None,
        "contingencia_ia": None,
        "ranking_ia": [],
        "candidatos_evaluados": 0,
        "tiempos_estimados": {},
        "origen": "app",
    })

    emergencia_id = ref[1].id
    print(f"✅ Emergency created: {emergencia_id}")

    google_key = os.environ.get("GOOGLE_MAPS_KEY")
    decision = await despachar_emergencia(
        emergencia_id=emergencia_id,
        lat=emergencia.lat,
        lon=emergencia.lon,
        uid_reportador=emergencia.uid,
        google_key=google_key,
        radio=RADIO_INICIAL,
    )

    candidatos   = decision.get("candidatos", [])
    mensajes_ia  = decision.get("mensajes", {})
    ranking_uids = decision.get("ranking_uids", [])
    contingencia = decision.get("contingencia", {})

    tiempos_estimados = {
        c["uid"]: c["tiempo_llegada_segundos"]
        for c in candidatos
        if c["uid"] in ranking_uids
    }
    db.collection("emergencias").document(emergencia_id).update({
        "tiempos_estimados": tiempos_estimados,
    })

    notificados = 0
    for uid in ranking_uids[:3]:
        candidato = next((c for c in candidatos if c["uid"] == uid), None)
        if candidato:
            mensaje = mensajes_ia.get(uid, f"Cardiac emergency. {candidato['tiempo_llegada_texto']} {candidato['modo_transporte']}.")
            await enviar_notificacion_individual(
                uid=uid,
                emergencia_id=emergencia_id,
                titulo="🚨 Cardiac emergency",
                cuerpo=mensaje,
                distancia_m=candidato["distancia_metros"],
                tiempo_s=candidato["tiempo_llegada_segundos"],
            )
            notificados += 1

    print(f"📲 Notified {notificados} responders according to AI ranking")

    umbral = contingencia.get("umbral_tiempo", "90s")
    try:
        segundos_espera = int(umbral.replace("s", "").replace(" ", ""))
    except Exception:
        segundos_espera = 90

    if segundos_espera > 0 and not decision.get("escalar_144"):
        asyncio.create_task(_programar_escalado(emergencia_id, segundos_espera))
        print(f"⏱️ Automatic escalation scheduled in {segundos_espera}s if nobody accepts")

    return {
        "status": "ok",
        "emergencia_id": emergencia_id,
        "candidatos_notificados": notificados,
        "razonamiento": decision.get("razonamiento"),
        "contingencia": contingencia,
        "radio_usado": RADIO_INICIAL,
    }


# ─────────────────────────────────────────────────────────────────────────────
# WEARABLE — STEP 1: EVALUATE
# The watch sends data, the backend decides whether to alert the user
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/evaluar-wearable")
async def evaluar_wearable(datos: DatosWearable):
    """
    The watch calls this endpoint as soon as it detects an anomaly.
    Responds ACTIVATE (→ the watch starts the 90s alert countdown) or OK (→ silent).
    Does NOT create an emergency yet.
    """
    db = firestore.client()

    # Exercise: high BPM + many steps + no idle time = exercise, not emergency
    es_deporte = (
        datos.bpm > 100
        and datos.pasos > 200
        and datos.tiempo_sin_movimiento == 0
        and datos.movimiento == "active"
    )

    # ── LAYER 1: HARD RULES → alert without consulting AI ────────────────────
    if datos.caida_detectada or datos.movimiento == "fall":
        return {"accion": "ACTIVATE", "motivo": "Fall detected", "via_ia": False}

    if datos.bpm < 40 and datos.movimiento != "sleeping":
        return {"accion": "ACTIVATE", "motivo": f"Critical BPM: {datos.bpm} bpm", "via_ia": False}

    if datos.bpm > 180 and not es_deporte:
        return {"accion": "ACTIVATE", "motivo": f"Very high BPM: {datos.bpm} bpm", "via_ia": False}

    if datos.spo2 < 90 and not es_deporte:
        return {"accion": "ACTIVATE", "motivo": f"Critical SpO2: {datos.spo2}%", "via_ia": False}

    if datos.pasos == 0 and datos.tiempo_sin_movimiento > 30 and datos.movimiento == "inactive":
        return {"accion": "ACTIVATE", "motivo": f"No movement for {datos.tiempo_sin_movimiento} minutes", "via_ia": False}

    # ── LAYER 2: GREY ZONE → Claude evaluates ────────────────────────────────
    zona_gris = not es_deporte and (
        (100 <= datos.bpm <= 180 and 90 <= datos.spo2 <= 94)
        or (datos.bpm > 100 and datos.movimiento == "inactive" and datos.tiempo_sin_movimiento > 10)
        or (datos.spo2 < 95 and datos.pasos < 5 and datos.tiempo_sin_movimiento > 15)
        or (datos.bpm < 50 and datos.movimiento == "sleeping")
    )

    if not zona_gris:
        return {"accion": "OK", "motivo": "Values within normal range"}

    # Retrieve the citizen's clinical profile from Firestore
    doc       = db.collection("ciudadanos").document(datos.uid_ciudadano).get()
    ciudadano = doc.to_dict() or {}

    perfil = {
        "bpm":                    datos.bpm,
        "spo2":                   f"{datos.spo2}%",
        "steps_last_interval":    datos.pasos,
        "movement":               datos.movimiento,
        "time_without_movement":  f"{datos.tiempo_sin_movimiento} minutes",
        "fall_detected":          datos.caida_detectada,
        "age":                    ciudadano.get("edad", "unknown"),
        "conditions":             ciudadano.get("patologias_previas", "none"),
        "medication":             ciudadano.get("medicacion", "none"),
        "allergies":              ciudadano.get("alergias", "none"),
        "blood_type":             ciudadano.get("grupo_sanguineo", "unknown"),
    }

    try:
        client    = anthropic.Anthropic()
        respuesta = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": (
                    "You are an emergency medical assistant. "
                    "Analyse the wearable data and respond ONLY with valid JSON, no extra text:\n"
                    '{"activate": true/false, "reason": "brief reason in English"}\n\n'
                    f"Patient data: {json.dumps(perfil, ensure_ascii=False)}"
                )
            }]
        )
        texto = respuesta.content[0].text.strip()
        if texto.startswith("```"):
            texto = texto.split("```")[1]
            if texto.startswith("json"):
                texto = texto[4:]
            texto = texto.strip()
        print(f"🤖 Claude responded: {texto}")
        resultado = json.loads(texto)

        if resultado.get("activate"):
            return {"accion": "ACTIVATE", "motivo": resultado["reason"], "via_ia": True}
        else:
            return {"accion": "OK", "motivo": resultado.get("reason", "Values not critical"), "via_ia": True}

    except Exception as e:
        # If Claude fails → activate as a precaution (this is an emergency app)
        print(f"⚠️ Claude unavailable: {e} — activating as precaution")
        return {"accion": "ACTIVATE", "motivo": "AI error — activated as precaution", "via_ia": False}


# ─────────────────────────────────────────────────────────────────────────────
# WEARABLE — STEP 2: ACTIVATE
# User did not cancel within 90s → create real emergency and dispatch responders
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/activar-wearable")
async def activar_wearable(datos: DatosWearable):
    db = firestore.client()
    return await _lanzar_emergencia_wearable(
        uid    = datos.uid_ciudadano,
        lat    = datos.lat,
        lon    = datos.lon,
        motivo = "User did not respond to wearable alert",
        db     = db,
        via_ia = False
    )


# Helper: create emergency + dispatch

async def _lanzar_emergencia_wearable(uid: str, lat: float, lon: float, motivo: str, db, via_ia: bool):
    if not lat or not lon:
        raise HTTPException(
            status_code=422,
            detail="The watch did not send a location"
        )

    ciudadano_doc = db.collection("ciudadanos").document(uid).get()
    ciudadano     = ciudadano_doc.to_dict() or {}
    nombre        = ciudadano.get("nombre", "VidAlert User")

    ref = db.collection("emergencias").add({
        "uid_ciudadano":        uid,
        "nombre":               nombre,
        "lat":                  lat,
        "lon":                  lon,
        "estado":               "activa",
        "timestamp":            datetime.utcnow().isoformat(),
        "respondedor_asignado": None,
        "rechazos":             [],
        "radio_actual":         RADIO_INICIAL,
        "razonamiento_ia":      None,
        "contingencia_ia":      None,
        "ranking_ia":           [],
        "candidatos_evaluados": 0,
        "tiempos_estimados":    {},
        "origen":               "wearable",
        "motivo_wearable":      motivo,
        "via_ia_wearable":      via_ia,
    })

    emergencia_id = ref[1].id
    print(f"⌚ Wearable emergency created: {emergencia_id} | reason: {motivo}")

    google_key = os.environ.get("GOOGLE_MAPS_KEY")
    decision   = await despachar_emergencia(
        emergencia_id=emergencia_id,
        lat=lat,
        lon=lon,
        uid_reportador=uid,
        google_key=google_key,
        radio=RADIO_INICIAL,
    )

    candidatos   = decision.get("candidatos", [])
    mensajes_ia  = decision.get("mensajes", {})
    ranking_uids = decision.get("ranking_uids", [])
    contingencia = decision.get("contingencia", {})

    tiempos_estimados = {
        c["uid"]: c["tiempo_llegada_segundos"]
        for c in candidatos
        if c["uid"] in ranking_uids
    }
    db.collection("emergencias").document(emergencia_id).update({
        "tiempos_estimados": tiempos_estimados,
    })

    notificados = 0
    for uid_san in ranking_uids[:3]:
        candidato = next((c for c in candidatos if c["uid"] == uid_san), None)
        if candidato:
            mensaje = mensajes_ia.get(
                uid_san,
                f"Wearable emergency. {candidato['tiempo_llegada_texto']} {candidato['modo_transporte']}."
            )
            await enviar_notificacion_individual(
                uid=uid_san,
                emergencia_id=emergencia_id,
                titulo="⌚ Wearable alert — cardiac emergency",
                cuerpo=mensaje,
                distancia_m=candidato["distancia_metros"],
                tiempo_s=candidato["tiempo_llegada_segundos"],
            )
            notificados += 1

    umbral = contingencia.get("umbral_tiempo", "90s")
    try:
        segundos_espera = int(umbral.replace("s", "").replace(" ", ""))
    except Exception:
        segundos_espera = 90

    if segundos_espera > 0 and not decision.get("escalar_144"):
        asyncio.create_task(_programar_escalado(emergencia_id, segundos_espera))
        print(f"⏱️ Wearable escalation scheduled in {segundos_espera}s")

    return {
        "accion":                 "ACTIVATE",
        "emergencia_id":          emergencia_id,
        "motivo":                 motivo,
        "via_ia":                 via_ia,
        "candidatos_notificados": notificados,
    }


# ─────────────────────────────────────────────────────────────────────────────
# RADIUS ESCALATION
# ─────────────────────────────────────────────────────────────────────────────

async def _programar_escalado(emergencia_id: str, segundos: int):
    await asyncio.sleep(segundos)
    db = firestore.client()
    emergencia = db.collection("emergencias").document(emergencia_id).get()
    if not emergencia.exists:
        return
    datos = emergencia.to_dict()
    if datos.get("respondedor_asignado") is None and datos.get("estado") == "activa":
        print(f"⏰ Timeout — escalating radius for {emergencia_id}")
        await escalar_radio(emergencia_id)


@router.post("/escalar-radio")
async def escalar_radio(emergencia_id: str):
    db  = firestore.client()
    ref = db.collection("emergencias").document(emergencia_id)
    emergencia = ref.get()

    if not emergencia.exists:
        raise HTTPException(status_code=404, detail="Emergency not found")

    datos = emergencia.to_dict()

    if datos.get("respondedor_asignado"):
        return {"status": "already_covered"}

    if datos.get("estado") != "activa":
        return {"status": "not_active"}

    radio_actual = datos.get("radio_actual", RADIO_INICIAL)
    try:
        idx_actual = RADIOS_ESCALADO.index(radio_actual)
        if idx_actual >= len(RADIOS_ESCALADO) - 1:
            print(f"⚠️ Maximum radius reached ({radio_actual}m) for {emergencia_id}")
            ref.update({"escalar_144": True})
            return {"status": "max_radius_reached", "radio": radio_actual}
        nuevo_radio = RADIOS_ESCALADO[idx_actual + 1]
    except ValueError:
        nuevo_radio = RADIOS_ESCALADO[0]

    print(f"📡 Escalating radius: {radio_actual}m → {nuevo_radio}m")

    rechazos   = datos.get("rechazos", [])
    google_key = os.environ.get("GOOGLE_MAPS_KEY")
    decision   = await despachar_emergencia(
        emergencia_id=emergencia_id,
        lat=datos["lat"],
        lon=datos["lon"],
        uid_reportador=datos["uid_ciudadano"],
        google_key=google_key,
        radio=nuevo_radio,
    )

    candidatos   = decision.get("candidatos", [])
    mensajes_ia  = decision.get("mensajes", {})
    ranking_uids = decision.get("ranking_uids", [])
    contingencia = decision.get("contingencia", {})

    tiempos_estimados_actuales = datos.get("tiempos_estimados", {})
    nuevos_tiempos = {
        c["uid"]: c["tiempo_llegada_segundos"]
        for c in candidatos
        if c["uid"] in ranking_uids
    }
    tiempos_estimados_actuales.update(nuevos_tiempos)
    ref.update({"tiempos_estimados": tiempos_estimados_actuales})

    notificados = 0
    for uid in ranking_uids[:3]:
        if uid in rechazos:
            continue
        candidato = next((c for c in candidatos if c["uid"] == uid), None)
        if candidato:
            mensaje = mensajes_ia.get(uid, f"Cardiac emergency. {candidato['tiempo_llegada_texto']} {candidato['modo_transporte']}.")
            await enviar_notificacion_individual(
                uid=uid,
                emergencia_id=emergencia_id,
                titulo="🚨 Emergency — expanded radius",
                cuerpo=mensaje,
                distancia_m=candidato["distancia_metros"],
                tiempo_s=candidato["tiempo_llegada_segundos"],
            )
            notificados += 1

    umbral = contingencia.get("umbral_tiempo", "90s")
    try:
        segundos_espera = int(umbral.replace("s", "").replace(" ", ""))
    except Exception:
        segundos_espera = 90

    if segundos_espera > 0 and nuevo_radio < max(RADIOS_ESCALADO):
        asyncio.create_task(_programar_escalado(emergencia_id, segundos_espera))

    return {
        "status": "ok",
        "nuevo_radio": nuevo_radio,
        "candidatos_notificados": notificados,
        "razonamiento": decision.get("razonamiento"),
        "contingencia": contingencia,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ACCEPT / REJECT / CLOSE
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/aceptar")
async def aceptar_emergencia(req: AceptarRequest):
    db  = firestore.client()
    ref = db.collection("emergencias").document(req.emergencia_id)
    emergencia = ref.get()

    if not emergencia.exists:
        raise HTTPException(status_code=404, detail="Emergency not found")

    datos = emergencia.to_dict()

    if datos.get("respondedor_asignado") is not None:
        raise HTTPException(status_code=409, detail="This emergency already has an assigned responder")

    if datos.get("estado") != "activa":
        raise HTTPException(status_code=409, detail="This emergency is no longer active")

    ref.update({
        "respondedor_asignado": req.uid_sanitario,
        "estado":               "en_camino",
        "timestamp_aceptacion": datetime.utcnow().isoformat(),
    })

    print(f"✅ Emergency {req.emergencia_id} accepted by {req.uid_sanitario}")

    actualizar_historial_sanitario(uid=req.uid_sanitario, acepto=True)
    await notificar_emergencia_cubierta(db, req.emergencia_id, req.uid_sanitario)
    return {"status": "ok", "mensaje": "Emergency accepted"}


@router.post("/rechazar")
async def rechazar_emergencia(req: RechazarRequest):
    db  = firestore.client()
    ref = db.collection("emergencias").document(req.emergencia_id)
    emergencia = ref.get()

    if not emergencia.exists:
        raise HTTPException(status_code=404, detail="Emergency not found")

    datos = emergencia.to_dict()

    if datos.get("respondedor_asignado") is not None:
        return {"status": "ok", "mensaje": "Already has a responder"}

    rechazos = datos.get("rechazos", [])
    if req.uid_sanitario not in rechazos:
        rechazos.append(req.uid_sanitario)
        ref.update({"rechazos": rechazos})

    actualizar_historial_sanitario(uid=req.uid_sanitario, acepto=False)
    print(f"❌ Emergency {req.emergencia_id} rejected by {req.uid_sanitario}")

    ranking_ia = datos.get("ranking_ia", [])
    if ranking_ia and all(uid in rechazos for uid in ranking_ia):
        print(f"📡 All ranked responders rejected — escalating radius for {req.emergencia_id}")
        asyncio.create_task(escalar_radio(req.emergencia_id))

    return {"status": "ok", "mensaje": "Rejection recorded"}


@router.post("/cerrar")
async def cerrar_emergencia(req: CerrarRequest):
    db  = firestore.client()
    ref = db.collection("emergencias").document(req.emergencia_id)
    emergencia = ref.get()

    if not emergencia.exists:
        raise HTTPException(status_code=404, detail="Emergency not found")

    datos = emergencia.to_dict()

    if datos.get("respondedor_asignado") != req.uid_sanitario:
        raise HTTPException(status_code=403, detail="Only the assigned responder can close the emergency")

    timestamp_aceptacion = datos.get("timestamp_aceptacion")
    tiempo_real = None
    if timestamp_aceptacion:
        ahora  = datetime.utcnow()
        inicio = datetime.fromisoformat(timestamp_aceptacion)
        tiempo_real = int((ahora - inicio).total_seconds())

    ref.update({
        "estado":                         "atendida",
        "timestamp_cierre":               datetime.utcnow().isoformat(),
        "tiempo_respuesta_real_segundos":  tiempo_real,
    })

    tiempos_estimados = datos.get("tiempos_estimados", {})
    tiempo_estimado   = tiempos_estimados.get(req.uid_sanitario)

    if tiempo_real:
        actualizar_historial_sanitario(
            uid=req.uid_sanitario,
            acepto=True,
            tiempo_estimado_s=tiempo_estimado,
            tiempo_real_s=tiempo_real,
        )

    print(f"✅ Emergency {req.emergencia_id} closed | estimated: {tiempo_estimado}s | actual: {tiempo_real}s")
    return {
        "status": "ok",
        "tiempo_estimado_segundos":  tiempo_estimado,
        "tiempo_respuesta_segundos": tiempo_real,
        "desviacion_segundos": (tiempo_real - tiempo_estimado) if tiempo_real and tiempo_estimado else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

async def notificar_emergencia_cubierta(db, emergencia_id: str, uid_sanitario_asignado: str):
    import httpx
    tokens_snap = db.collection("push_tokens").get()
    tokens = [
        doc.to_dict().get("token")
        for doc in tokens_snap
        if doc.to_dict().get("token") and doc.id != uid_sanitario_asignado
    ]
    if not tokens:
        return
    mensajes = [{
        "to": token,
        "title": "✅ Emergency covered",
        "body": "Another responder is already attending the emergency. Thank you.",
        "data": {"emergencia_id": emergencia_id, "estado": "cubierta"},
        "sound": "default",
        "priority": "normal",
        "channelId": "emergencias",
    } for token in tokens]
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://exp.host/--/api/v2/push/send",
            json=mensajes,
            headers={"Content-Type": "application/json"},
        )
        print(f"📢 'Covered' notification sent to {len(tokens)} responders")