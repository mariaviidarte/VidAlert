from fastapi import APIRouter
from dotenv import load_dotenv
import anthropic
import os

load_dotenv()

router = APIRouter(prefix="/testigo", tags=["AI Witness"])

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Store conversation history per emergency
conversaciones = {}

@router.post("/guia-rcp")
def guia_rcp(datos: dict):
    """
    AI that guides a bystander step by step during a cardiac arrest.
    Receives: { "emergencia_id": "123", "mensaje": "the person is not breathing" }
    Returns:  { "respuesta": "clear instruction", "paso": 1 }
    """

    emergencia_id = datos.get("emergencia_id", "default")
    mensaje_testigo = datos.get("mensaje", "")

    # Retrieve history for this emergency
    if emergencia_id not in conversaciones:
        conversaciones[emergencia_id] = []

    historial = conversaciones[emergencia_id]
    historial.append({"role": "user", "content": mensaje_testigo})

    respuesta = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=150,
        system="""You are VidAlert, an emergency doctor via WhatsApp.

ABSOLUTE RULES:
- Maximum 2 short sentences
- NEVER give instructions without assessing the situation first
- Ask first, then act based on the response
- Do not ask for location in the first message
- Ask for location once you confirm it is a serious emergency

MANDATORY FLOW:
1st message → Assess only: ask what is happening and the person's condition
2nd message → Based on the response, give a specific instruction
3rd message → If it is a serious emergency, give the next step + ask for location

EMERGENCIES AND RESPONSES:
- Not breathing + unconscious → CPR: 30 compressions on the centre of the chest, hard
- Breathing but unconscious → Recovery position, do not move
- Choking → Back blows between shoulder blades, Heimlich manoeuvre
- Bleeding → Direct and constant pressure
- Burn → Cold water for 20 minutes
- Seizure → Do not restrain, move objects away, time it
- Stroke → Do not move them, speak calmly
- Severe allergy → Lay them down, raise legs

CORRECT EXAMPLES:
Message 1: "Are they breathing? Are they conscious?"
Message 2 (not breathing): "Place your hands on the centre of the chest and press down hard 30 times. Can you do that?"
Message 3: "Keep going without stopping. Send your Google Maps location so we can dispatch help."

NEVER more than 2 sentences. NEVER give an instruction without knowing the person's condition.""",
        messages=historial
    )

    respuesta_ia = respuesta.content[0].text

    # Save response to history
    historial.append({"role": "assistant", "content": respuesta_ia})

    return {
        "respuesta": respuesta_ia,
        "emergencia_id": emergencia_id,
        "turnos": len(historial) // 2
    }


@router.delete("/guia-rcp/{emergencia_id}")
def cerrar_conversacion(emergencia_id: str):
    """Closes the conversation when the emergency ends."""
    if emergencia_id in conversaciones:
        del conversaciones[emergencia_id]
    return {"status": "conversation closed"}