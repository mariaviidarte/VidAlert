import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../AuthContext';
import { leerTokenNFC } from '../../nfc';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://10.0.2.2:8000';

type MedicalHistory = {
  nombre: string;
  grupo_sanguineo: string;
  alergias: string;
  medicacion: string;
  contacto_emergencia: string;
};

export default function AlertaScreen() {
  const { user } = useAuth();
  const { emergencia_id, distancia, tiempo } = useLocalSearchParams();
  const [respondiendo, setRespondiendo] = useState(false);

  // ── NFC State ──
  const [leyendoNFC, setLeyendoNFC] = useState(false);
  const [historial, setHistorial] = useState<MedicalHistory | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const aceptarEmergencia = async () => {
    setRespondiendo(true);
    try {
      const res = await fetch(`${BACKEND_URL}/emergencias/aceptar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencia_id: emergencia_id as string,
          uid_sanitario: user?.uid,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        Alert.alert('⚠️ Already covered', 'Another responder accepted this emergency before you.');
        router.replace('/(tabs)/dashboard');
        return;
      }

      if (!res.ok) throw new Error(data.detail ?? 'Error accepting emergency');

      router.replace({
        pathname: '/(tabs)/mapa',
        params: { emergencia_id: emergencia_id as string },
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRespondiendo(false);
    }
  };

  const rechazarEmergencia = async () => {
    try {
      await fetch(`${BACKEND_URL}/emergencias/rechazar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencia_id: emergencia_id as string,
          uid_sanitario: user?.uid,
        }),
      });
    } catch (e) {
      console.warn('Error registering rejection:', e);
    } finally {
      router.replace('/(tabs)/dashboard');
    }
  };

  // ── NFC: read medical history ──
  const leerHistorialNFC = async () => {
    if (!user) return;
    setLeyendoNFC(true);
    try {
      const tokenFirebase = await user.getIdToken();
      const tokenNFC = await leerTokenNFC();

      const res = await fetch(`${BACKEND_URL}/nfc/leer-historial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFirebase}`,
        },
        body: JSON.stringify({ token: tokenNFC, uid_sanitario: user.uid }),
      });

      if (res.status === 401) throw new Error('Invalid NFC token.');
      if (res.status === 410) throw new Error('The NFC token has expired. Ask the patient to generate a new one.');
      if (res.status === 409) throw new Error('This token has already been used.');
      if (res.status === 403) throw new Error('Your account is not verified to access medical records.');
      if (!res.ok) throw new Error('Error retrieving medical history.');

      const datos: MedicalHistory = await res.json();
      setHistorial(datos);
      setModalVisible(true);
    } catch (err: any) {
      Alert.alert('NFC Error', err?.message ?? 'Could not read medical history.');
    } finally {
      setLeyendoNFC(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centro}>

        {/* Alert */}
        <View style={styles.alertaCard}>
          <View style={styles.alertaIcono}>
            <Text style={styles.alertaIconoTexto}>🛡</Text>
          </View>
          <Text style={styles.alertaTitulo}>Cardiac arrest</Text>
          <Text style={styles.alertaSubtitulo}>Active emergency {distancia ?? '---'}m away</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumero}>{distancia ?? '---'}m</Text>
            <Text style={styles.statLabel}>distance</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumero}>{tiempo ?? '--:--'}</Text>
            <Text style={styles.statLabel}>estimated{'\n'}time</Text>
          </View>
        </View>

        {/* Accept / Reject buttons */}
        <TouchableOpacity
          style={[styles.botonAceptar, respondiendo && styles.botonDesactivado]}
          onPress={aceptarEmergencia}
          disabled={respondiendo}
        >
          <Text style={styles.botonAceptarTexto}>{respondiendo ? 'Accepting...' : "I'm on my way"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.botonRechazar} onPress={rechazarEmergencia}>
          <Text style={styles.botonRechazarTexto}>I can't go</Text>
        </TouchableOpacity>

        {/* NFC Button */}
        <TouchableOpacity
          style={[styles.botonNFC, leyendoNFC && styles.botonNFCDesactivado]}
          onPress={leerHistorialNFC}
          disabled={leyendoNFC}
        >
          {leyendoNFC ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.botonNFCTexto}>Bring the patient's phone closer...</Text>
            </>
          ) : (
            <>
              <Text style={styles.botonNFCIcon}>📲</Text>
              <Text style={styles.botonNFCTexto}>Read medical history via NFC</Text>
            </>
          )}
        </TouchableOpacity>

      </View>

      {/* Medical history modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>🏥 Medical History</Text>
            {historial && (
              <ScrollView style={styles.modalScroll}>
                <CampoHistorial label="Patient" value={historial.nombre} />
                <CampoHistorial label="Blood type" value={historial.grupo_sanguineo} highlighted />
                <CampoHistorial label="Allergies" value={historial.alergias || 'None known'} />
                <CampoHistorial label="Medication" value={historial.medicacion || 'None'} />
                <CampoHistorial label="Emergency contact" value={historial.contacto_emergencia} />
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.modalCerrar}
              onPress={() => { setModalVisible(false); setHistorial(null); }}
            >
              <Text style={styles.modalCerrarTexto}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type CampoProps = { label: string; value: string; highlighted?: boolean };
function CampoHistorial({ label, value, highlighted = false }: CampoProps) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoEtiqueta}>{label}</Text>
      <Text style={[styles.campoValor, highlighted && styles.campoValorDestacado]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF5FC' },
  centro: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },

  alertaCard: { backgroundColor: '#FEE8E8', borderRadius: 20, padding: 24, alignItems: 'center' },
  alertaIcono: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#C0504D', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  alertaIconoTexto: { fontSize: 28 },
  alertaTitulo: { fontSize: 22, fontWeight: '700', color: '#C0504D', marginBottom: 4 },
  alertaSubtitulo: { fontSize: 14, color: '#C0504D' },

  statsRow: { flexDirection: 'row', gap: 16 },
  statCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#D6E8F7' },
  statNumero: { fontSize: 28, fontWeight: '700', color: '#0C447C' },
  statLabel: { fontSize: 13, color: '#378ADD', marginTop: 4, textAlign: 'center' },

  botonAceptar: { backgroundColor: '#185FA5', borderRadius: 14, padding: 18, alignItems: 'center' },
  botonDesactivado: { backgroundColor: '#B5D4F4' },
  botonAceptarTexto: { fontSize: 17, fontWeight: '700', color: 'white' },
  botonRechazar: { borderRadius: 14, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: '#D6E8F7' },
  botonRechazarTexto: { fontSize: 17, fontWeight: '600', color: '#378ADD' },

  botonNFC: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a5fa8', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, gap: 10 },
  botonNFCDesactivado: { backgroundColor: '#5a8fc8' },
  botonNFCIcon: { fontSize: 20 },
  botonNFCTexto: { color: '#fff', fontSize: 15, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: '#1a5fa8', marginBottom: 16, textAlign: 'center' },
  modalScroll: { marginBottom: 16 },
  campo: { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  campoEtiqueta: { fontSize: 12, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  campoValor: { fontSize: 16, color: '#222' },
  campoValorDestacado: { fontSize: 22, fontWeight: '700', color: '#c0392b' },
  modalCerrar: { backgroundColor: '#f0f0f0', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  modalCerrarTexto: { fontSize: 16, fontWeight: '600', color: '#333' },
});