import httpx
from firebase_admin import firestore

async def enviar_notificacion_individual(
    uid: str,
    emergencia_id: str,
    titulo: str,
    cuerpo: str,
    distancia_m: int | None = None,
    tiempo_s: int | None = None,
):
    """Sends a push notification to a specific responder by their uid."""
    db = firestore.client()

    token_doc = db.collection("push_tokens").document(uid).get()
    if not token_doc.exists:
        print(f"⚠️ No token found for uid {uid}")
        return

    token = token_doc.to_dict().get("token")
    if not token:
        return

    # Format distance and time to display in alerta.tsx
    distancia_texto = str(distancia_m) if distancia_m else "---"
    if tiempo_s:
        minutos = tiempo_s // 60
        segundos = tiempo_s % 60
        tiempo_texto = f"{minutos} min {segundos} s" if segundos > 0 else f"{minutos} min"
    else:
        tiempo_texto = "--:--"

    mensaje = {
        "to": token,
        "title": titulo,
        "body": cuerpo,
        "data": {
            "emergencia_id": emergencia_id,
            "distancia": distancia_texto,
            "tiempo": tiempo_texto,
        },
        "sound": "default",
        "priority": "high",
        "channelId": "emergencias",
    }

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://exp.host/--/api/v2/push/send",
            json=[mensaje],
            headers={"Content-Type": "application/json"},
        )
        try:
            response_data = res.json()
            ticket = response_data.get("data", [{}])[0]
            if ticket.get("status") == "ok":
                print(f"✅ Notification sent to {uid} — {distancia_texto}m / {tiempo_texto}")
            else:
                print(f"❌ Notification error for {uid}: {ticket.get('message')} | {ticket.get('details')}")
        except Exception as e:
            print(f"❌ Error reading ticket: {e}")


async def enviar_notificacion_sanitarios(lat: float, lon: float, emergencia_id: str):
    """Sends a generic notification to ALL responders. Use only as fallback."""
    db = firestore.client()

    tokens_snap = db.collection("push_tokens").get()
    tokens = [doc.to_dict().get("token") for doc in tokens_snap if doc.to_dict().get("token")]

    if not tokens:
        print("⚠️ No responders with a registered token")
        return

    mensajes = [{
        "to": token,
        "title": "🚨 Nearby emergency",
        "body": "There is an active emergency near you. Tap to view details.",
        "data": {
            "emergencia_id": emergencia_id,
            "distancia": "---",
            "tiempo": "--:--",
        },
        "sound": "default",
        "priority": "high",
        "channelId": "emergencias",
    } for token in tokens]

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://exp.host/--/api/v2/push/send",
            json=mensajes,
            headers={"Content-Type": "application/json"},
        )
        try:
            response_data = res.json()
            tickets = response_data.get("data", [])
            for i, ticket in enumerate(tickets):
                if ticket.get("status") == "ok":
                    print(f"✅ Token {tokens[i][:20]}... → delivered (id: {ticket.get('id')})")
                else:
                    error = ticket.get("details", {})
                    print(f"❌ Token {tokens[i][:20]}... → ERROR: {ticket.get('message')} | {error}")
                    if error.get("error") == "DeviceNotRegistered":
                        print(f"   🗑️ Invalid token: {tokens[i]}")
        except Exception as e:
            print(f"❌ Error reading Expo response: {e}")