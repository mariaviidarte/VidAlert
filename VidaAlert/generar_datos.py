import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import random

cred = credentials.Certificate("firebase-adminsdk.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

nombres = ["María López", "Carlos Ruiz", "Ana García", "Pedro Martínez", "Laura Sánchez", "José Fernández", "Isabel Torres", "Miguel Díaz"]

# Ciudades reales
ubicaciones = [
    (40.4168, -3.7038),   # Madrid
    (41.3851, 2.1734),    # Barcelona
    (37.3891, -5.9845),   # Sevilla
    (39.4699, -0.3763),   # Valencia
    (43.2630, -2.9350),   # Bilbao
    (36.7213, -4.4216),   # Málaga
    (38.3452, -0.4810),   # Alicante
    (40.9429, -4.1088),   # Segovia
]

for i, (lat, lon) in enumerate(ubicaciones[:6]):
    db.collection("emergencias").add({
        "lat": lat + random.uniform(-0.01, 0.01),
        "lon": lon + random.uniform(-0.01, 0.01),
        "estado": "activa",
        "respondedor_asignado": None,
        "nombre": nombres[i],
        "origen": random.choice(["app", "whatsapp"]),
        "timestamp": datetime.utcnow().isoformat(),
    })
    print(f"✅ Emergencia: {nombres[i]}")

for i, (lat, lon) in enumerate(ubicaciones):
    db.collection("ubicaciones").document(f"respondedor_{i+1}").set({
        "uid": f"respondedor_{i+1}",
        "lat": lat + random.uniform(-0.005, 0.005),
        "lon": lon + random.uniform(-0.005, 0.005),
        "activo": random.choice([True, True, False]),
        "timestamp": datetime.utcnow().isoformat(),
    })
    print(f"✅ Respondedor_{i+1}")

print("✅ Datos cargados")