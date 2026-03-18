import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv


# Importación de tus otros archivos
from ia_generativa_testigo import router as testigo_router
from twilio_wa import router as whatsapp_router
from Usuarios import router as usuarios_router
from emergencias import router as emergencias_router
from nfc import router as nfc_router



load_dotenv()

# --- CONFIGURACIÓN DE FIREBASE ---
# Asegúrate de que el JSON esté en la misma carpeta que este main.py
cred = credentials.Certificate("firebase-adminsdk.json")
firebase_admin.initialize_app(cred)
db = firestore.client() 
# ---------------------------------

app = FastAPI(title="VidAlert API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "status": "VidAlert API funcionando 🫀",
        "database": "Firebase conectado 🔥"
    }

# Rutas existentes
app.include_router(testigo_router)
app.include_router(whatsapp_router)
app.include_router(usuarios_router)
app.include_router(emergencias_router)
app.include_router(nfc_router)
