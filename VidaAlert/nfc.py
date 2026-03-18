# VidaAlert/nfc.py
# Router FastAPI para NFC - generar y validar tokens de historial médico
# Añadir en main.py: from nfc import router as nfc_router
#                    app.include_router(nfc_router)

import jwt
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

import firebase_admin
from firebase_admin import firestore, auth

router = APIRouter(prefix="/nfc", tags=["NFC"])

def get_db():
    return firestore.client()

# Clave secreta para firmar los tokens NFC (añadir al .env)
# NFC_SECRET=una_clave_larga_y_aleatoria_aqui
NFC_SECRET = os.getenv("NFC_SECRET", "cambia_esto_en_produccion")
EXPIRACION_SEGUNDOS = 600  # 10 minutos


# ── Modelos ────────────────────────────────────────────────────────────────────

class GenerarTokenBody(BaseModel):
    uid_ciudadano: str


class LeerHistorialBody(BaseModel):
    token: str
    uid_sanitario: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def verificar_firebase_token(authorization: str) -> str:
    """Verifica el token Firebase del header y devuelve el uid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autenticación requerido")
    id_token = authorization.split(" ")[1]
    try:
        decoded = auth.verify_id_token(id_token)
        return decoded["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="Token Firebase inválido o caducado")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/generar-token")
async def generar_token(body: GenerarTokenBody, authorization: str = Header(None)):
    """
    El ciudadano solicita un token NFC de un solo uso para compartir su historial.
    Solo el propio ciudadano puede generarlo.
    """
    uid_solicitante = verificar_firebase_token(authorization)

    if uid_solicitante != body.uid_ciudadano:
        raise HTTPException(status_code=403, detail="Solo puedes generar tu propio token")

    db = get_db()

    # Verificar que el uid corresponde a un ciudadano
    doc = db.collection("ciudadanos").document(body.uid_ciudadano).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Ciudadano no encontrado")

    ahora = datetime.now(timezone.utc)
    expira = ahora + timedelta(seconds=EXPIRACION_SEGUNDOS)
    jti = str(uuid.uuid4())  # ID único del token

    payload = {
        "jti": jti,
        "uid_ciudadano": body.uid_ciudadano,
        "iat": ahora.timestamp(),
        "exp": expira.timestamp(),
    }

    token = jwt.encode(payload, NFC_SECRET, algorithm="HS256")

    # Guardar en Firestore para control de uso único
    db.collection("nfc_tokens").document(jti).set({
        "jti": jti,
        "uid_ciudadano": body.uid_ciudadano,
        "uid_sanitario": None,
        "estado": "pendiente",
        "timestamp_emision": ahora,
        "timestamp_uso": None,
        "expira_en": expira,  # Configura TTL en Firestore sobre este campo
    })

    return {"token": token, "expira_en": EXPIRACION_SEGUNDOS}


@router.post("/leer-historial")
async def leer_historial(body: LeerHistorialBody, authorization: str = Header(None)):
    """
    El sanitario envía el token leído por NFC para obtener el historial médico.
    """
    # Verificar que quien llama es el sanitario que dice ser
    uid_llamante = verificar_firebase_token(authorization)
    if uid_llamante != body.uid_sanitario:
        raise HTTPException(status_code=403, detail="UID no coincide con el token Firebase")

    # 1. Verificar firma y expiración del JWT
    try:
        payload = jwt.decode(body.token, NFC_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=410, detail="El token NFC ha caducado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token NFC inválido")

    jti = payload["jti"]
    uid_ciudadano = payload["uid_ciudadano"]

    db = get_db()

    # 2. Verificar uso único en Firestore
    token_ref = db.collection("nfc_tokens").document(jti)
    token_doc = token_ref.get()

    if not token_doc.exists:
        raise HTTPException(status_code=401, detail="Token NFC no registrado")

    token_data = token_doc.to_dict()
    if token_data.get("estado") == "usado":
        raise HTTPException(status_code=409, detail="Este token ya fue usado")

    # 3. Verificar que el sanitario está verificado
    sanitario_doc = db.collection("sanitarios").document(body.uid_sanitario).get()
    if not sanitario_doc.exists:
        raise HTTPException(status_code=403, detail="Sanitario no encontrado")

    sanitario = sanitario_doc.to_dict()
    if not sanitario.get("verificado", False):
        raise HTTPException(status_code=403, detail="Cuenta de sanitario no verificada")

    # 4. Marcar token como usado (atómico)
    token_ref.update({
        "estado": "usado",
        "uid_sanitario": body.uid_sanitario,
        "timestamp_uso": datetime.now(timezone.utc),
    })

    # 5. Obtener historial del ciudadano
    ciudadano_doc = db.collection("ciudadanos").document(uid_ciudadano).get()
    if not ciudadano_doc.exists:
        raise HTTPException(status_code=404, detail="Historial del ciudadano no encontrado")

    c = ciudadano_doc.to_dict()

    return {
        "nombre": c.get("nombre", "—"),
        "grupo_sanguineo": c.get("grupo_sanguineo", "—"),
        "alergias": c.get("alergias", "Ninguna conocida"),
        "medicacion": c.get("medicacion", "Ninguna"),
        "contacto_emergencia": c.get("contacto_emergencia", "—"),
    }