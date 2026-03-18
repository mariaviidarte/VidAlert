from fastapi import APIRouter, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

class PerfilSanitario(BaseModel):
    uid: str
    token: str
    nombre: str
    email: str
    colegiado: str
    especialidad: str

class PerfilCiudadano(BaseModel):
    uid: str
    token: str
    nombre: str
    email: str
    grupo_sanguineo: str
    alergias: Optional[str] = ""
    medicacion: Optional[str] = ""
    contacto_emergencia: str
    edad: int
    patologias: str
    vinculo_reloj: bool

def verificar_token(token: str):
    try:
        return auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

@router.post("/registro-sanitario")
async def registro_sanitario(perfil: PerfilSanitario):
    verificar_token(perfil.token)
    db = firestore.client()
    db.collection("sanitarios").document(perfil.uid).set({
        "nombre": perfil.nombre,
        "email": perfil.email,
        "colegiado": perfil.colegiado,
        "especialidad": perfil.especialidad,
        "rol": "sanitario",
        "verificado": False,
        "activo": True,
    })
    return {"status": "ok", "uid": perfil.uid}

@router.post("/registro-ciudadano")
async def registro_ciudadano(perfil: PerfilCiudadano):
    verificar_token(perfil.token)
    db = firestore.client()
    db.collection("ciudadanos").document(perfil.uid).set({
        "nombre": perfil.nombre,
        "email": perfil.email,
        "grupo_sanguineo": perfil.grupo_sanguineo,
        "alergias": perfil.alergias,
        "medicacion": perfil.medicacion,
        "contacto_emergencia": perfil.contacto_emergencia,
        "rol": "ciudadano",
        "edad": perfil.edad,
        "patologias": perfil.patologias,
        "vinculo_reloj": perfil.vinculo_reloj,
        "fecha_registro": firestore.SERVER_TIMESTAMP
    })
    return {"status": "ok", "uid": perfil.uid}

@router.get("/rol/{uid}")
async def obtener_rol(uid: str):
    db = firestore.client()
    sanitario = db.collection("sanitarios").document(uid).get()
    if sanitario.exists:
        return {"rol": "sanitario"}
    ciudadano = db.collection("ciudadanos").document(uid).get()
    if ciudadano.exists:
        return {"rol": "ciudadano"}
    operador = db.collection("operadores").document(uid).get()
    if operador.exists:
        return {"rol": "operador_144"}
    raise HTTPException(status_code=404, detail="Usuario no encontrado")