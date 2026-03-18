from fastapi import APIRouter, Request
from fastapi.responses import Response
from twilio.rest import Client
from firebase_admin import firestore
from dotenv import load_dotenv
from datetime import datetime
import anthropic
import os
import re

load_dotenv()

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Testigo"])

twilio_client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
claude_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

conversaciones = {}

def extraer_coordenadas_texto(texto: str):
    patron = r'[-+]?\d{1,2}\.\d+,\s*[-+]?\d{1,3}\.\d+'
    match = re.search(patron, texto)
    if match:
        partes = match.group().split(',')
        return float(partes[0].strip()), float(partes[1].strip())
    return None, None

async def crear_emergencia_firestore(numero: str, lat: float, lon: float):
    from notificaciones import enviar_notificacion_sanitarios
    db = firestore.client()
    ref = db.collection("emergencias").add({
        "origen": "whatsapp",
        "telefono": numero,
        "lat": lat,
        "lon": lon,
        "estado": "activa",
        "timestamp": datetime.utcnow().isoformat(),
        "respondedor_asignado": None,
    })
    emergencia_id = ref[1].id
    print(f"✅ Emergencia creada desde WhatsApp: {numero} → {lat}, {lon}")
    await enviar_notificacion_sanitarios(lat, lon, emergencia_id)

@router.post("/webhook")
async def webhook_whatsapp(request: Request):
    form = await request.form()
    mensaje_testigo = form.get("Body", "").strip()
    numero_testigo = form.get("From", "")

    lat_twilio = form.get("Latitude")
    lon_twilio = form.get("Longitude")

    if not mensaje_testigo and not lat_twilio:
        return Response(content="<?xml version='1.0' encoding='UTF-8'?><Response></Response>", media_type="application/xml")

    es_nueva = numero_testigo not in conversaciones
    if es_nueva:
        conversaciones[numero_testigo] = {
            "historial": [],
            "ubicacion_recibida": False
        }

    sesion = conversaciones[numero_testigo]
    historial = sesion["historial"]

    if not sesion["ubicacion_recibida"]:
        if lat_twilio and lon_twilio:
            sesion["ubicacion_recibida"] = True
            await crear_emergencia_firestore(numero_testigo, float(lat_twilio), float(lon_twilio))
            mensaje_testigo = mensaje_testigo or "He compartido mi ubicación"
        else:
            lat, lon = extraer_coordenadas_texto(mensaje_testigo)
            if lat and lon:
                sesion["ubicacion_recibida"] = True
                await crear_emergencia_firestore(numero_testigo, lat, lon)

    if not mensaje_testigo:
        return Response(content="<?xml version='1.0' encoding='UTF-8'?><Response></Response>", media_type="application/xml")

    mensaje_para_ia = f"EMERGENCIA NUEVA: {mensaje_testigo}" if es_nueva else mensaje_testigo
    historial.append({"role": "user", "content": mensaje_para_ia})

    ubicacion_info = "Ya tienes la ubicación del testigo. " if sesion["ubicacion_recibida"] else ""

    system_prompt = """"You are VidAlert, a WhatsApp emergency physician.

ABSOLUTE RULES:

Maximum of 2 VERY short sentences.

NEVER give instructions without evaluating first.

First message: only ask "Is the person breathing?"

If not breathing: immediate CPR.

If breathing: evaluate what else is happening.

Ask for Google Maps location only if you don't have it yet and it is a serious emergency.

{ubicacion_info}

ACTIONS ACCORDING TO STATUS:

Not breathing → "Place hands in center of chest. Push hard 30 times now."

Unconscious but breathing → "Turn them on their side. Do not move them."

Choking → "Lean them forward. Give 5 sharp blows between shoulder blades."

Bleeding → "Apply firm pressure to the wound. Do not let go."

Burns → "Run cool water over it for 20 minutes."

Seizure → "Don't restrain them. Clear objects away. Time the seizure."

If you lack location and it's a serious emergency: end with "Share your WhatsApp location to send help."
If you already have the location: "Help is on the way." and continue guiding."""

    respuesta = claude_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=100,
        system=system_prompt,
        messages=historial
    )

    respuesta_ia = respuesta.content[0].text
    historial.append({"role": "assistant", "content": respuesta_ia})

    twilio_client.messages.create(
        from_="whatsapp:+14155238886",
        to=numero_testigo,
        body=respuesta_ia
    )

    return Response(content="<?xml version='1.0' encoding='UTF-8'?><Response></Response>", media_type="application/xml")
