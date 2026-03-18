// firstvoice/nfc.ts
// Hook NFC para VidAlert - emitir (ciudadano) y leer (sanitario)
// Requiere: npm install react-native-nfc-manager
// Luego rebuild: eas build --profile development --platform android

import { Platform } from 'react-native';
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

// ─── Inicialización ────────────────────────────────────────────────────────────
// Llama esto una vez al arrancar la app (p.ej. en app/_layout.tsx)
export async function inicializarNFC(): Promise<boolean> {
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return false;
    await NfcManager.start();
    return true;
  } catch {
    return false;
  }
}

// ─── CIUDADANO: emitir token por NFC ──────────────────────────────────────────
// Mantiene el NFC activo hasta que el sanitario lo lee o se cancela.
// Devuelve una función cancelar() para limpiar cuando el componente se desmonte.
export function emitirTokenNFC(
  token: string,
  onLeido: () => void,
  onError: (msg: string) => void
): () => void {
  let cancelado = false;

  const iniciar = async () => {
    try {
      // Android: HCE (Host Card Emulation) — escribe el token como registro NDEF
      if (Platform.OS === 'android') {
        await NfcManager.requestTechnology(NfcTech.Ndef);
        const bytes = Ndef.encodeMessage([Ndef.textRecord(token)]);
        if (bytes) {
          await NfcManager.ndefHandler.writeNdefMessage(bytes);
        }
        if (!cancelado) onLeido();
      } else {
        // iOS: CoreNFC solo permite LECTURA activa, no emisión HCE.
        // En iOS el ciudadano comparte el token mostrando un QR como alternativa.
        onError('NFC de emisión no soportado en iOS. Usa la opción QR.');
      }
    } catch (err: any) {
      if (!cancelado) onError(err?.message ?? 'Error NFC');
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  iniciar();

  return () => {
    cancelado = true;
    NfcManager.cancelTechnologyRequest().catch(() => {});
  };
}

// ─── SANITARIO: leer token NFC ────────────────────────────────────────────────
// Activa el lector NFC, espera que el ciudadano acerque su móvil,
// y devuelve el token JWT como string.
export async function leerTokenNFC(): Promise<string> {
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();

    if (!tag?.ndefMessage?.[0]) {
      throw new Error('No se encontró mensaje NDEF en el tag');
    }

    const payload = tag.ndefMessage[0].payload;
    // El payload de un textRecord NDEF incluye cabecera de idioma — la saltamos
    // Formato: [statusByte, ...langBytes, ...textBytes]
    const statusByte = payload[0];
    const langLength = statusByte & 0x3f;
    const textBytes = payload.slice(1 + langLength);
    const token = String.fromCharCode(...textBytes);

    return token;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}