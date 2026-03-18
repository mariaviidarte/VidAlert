import firebase_admin
from firebase_admin import credentials, firestore

def inicializar():
    cred = credentials.Certificate("firebase-adminsdk.json")
    firebase_admin.initialize_app(cred)
    return firestore.client()

def crear_respondedor_demo(db):
    respondedores = [
        {
            "nombre": "Dr. Carlos García",
            "telefono": "whatsapp:+34600000001",
            "certificacion": "medico",
            "lat": 40.4168,
            "lon": -3.7038,
            "activo": True,
            "emergencias_atendidas": 12
        },
        {
            "nombre": "Enfermera Ana López",
            "telefono": "whatsapp:+34600000002",
            "certificacion": "enfermera",
            "lat": 40.4185,
            "lon": -3.7025,
            "activo": True,
            "emergencias_atendidas": 8
        },
        {
            "nombre": "Paramédico Luis Martín",
            "telefono": "whatsapp:+34600000003",
            "certificacion": "paramedico",
            "lat": 40.4150,
            "lon": -3.7050,
            "activo": True,
            "emergencias_atendidas": 25
        }
    ]
    for r in respondedores:
        db.collection("respondedores").add(r)
        print(f"✅ Respondedor creado: {r['nombre']}")

def crear_victima_demo(db):
    victima = {
        "nombre": "María Pérez",
        "edad": 65,
        "grupo_sanguineo": "A+",
        "alergias": ["penicilina", "aspirina"],
        "medicacion": ["enalapril 10mg", "metformina 500mg"],
        "condiciones": ["hipertensión", "diabetes tipo 2"],
        "contacto_emergencia": {
            "nombre": "Juan Pérez",
            "telefono": "+34600000099"
        },
        "token_nfc": "TOKEN_CIFRADO_DEMO_001"
    }
    db.collection("victimas").document("demo001").set(victima)
    print(f"✅ Víctima creada: {victima['nombre']}")

if __name__ == "__main__":
    db = inicializar()
    crear_respondedor_demo(db)
    crear_victima_demo(db)
    print("✅ Datos de demo cargados en Firebase")