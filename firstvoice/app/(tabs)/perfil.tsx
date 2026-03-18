import * as Location from 'expo-location';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';
import { useAuth } from '../../AuthContext';
import { auth, db } from '../../firebaseConfig';

type CitizenProfile = {
  nombre: string;
  email: string;
  grupo_sanguineo: string;
  alergias: string;
  medicacion: string;
  contacto_emergencia: string;
  edad: number;
  patologias: string;
  vinculo_reloj: boolean;
};

type NFCStatus = 'starting' | 'ready' | 'broadcasting' | 'not_supported' | 'error';

export default function PerfilScreen() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<CitizenProfile | null>(null);
  const [cargando, setCargando] = useState(true);
  const [activandoEmergencia, setActivandoEmergencia] = useState(false);
  const [estadoNFC, setEstadoNFC] = useState<NFCStatus>('starting');
  const nfcTokenRef = useRef<string | null>(null);
  const renovandoRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      await Location.requestForegroundPermissionsAsync();
      await cargarPerfil();
      await iniciarNFC();
    };
    init();
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, [user]);

  const cargarPerfil = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'ciudadanos', user.uid));
      if (snap.exists()) setPerfil(snap.data() as CitizenProfile);
    } catch {
      Alert.alert('Error', 'Could not load profile');
    } finally {
      setCargando(false);
    }
  };

  // ── NFC always active ──────────────────────────────────────────────────────
  // On mount: gets a token from the backend and broadcasts it continuously.
  // Renews automatically when it expires (10 min).
  const iniciarNFC = async () => {
    if (!user) return;
    try {
      const soportado = await NfcManager.isSupported();
      if (!soportado) { setEstadoNFC('not_supported'); return; }
      await NfcManager.start();
      await renovarYEmitir();
    } catch {
      setEstadoNFC('error');
    }
  };

  const renovarYEmitir = async () => {
    if (!user || renovandoRef.current) return;
    renovandoRef.current = true;
    try {
      const tokenFirebase = await user.getIdToken();
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/nfc/generar-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFirebase}` },
        body: JSON.stringify({ uid_ciudadano: user.uid }),
      });
      if (!res.ok) { setEstadoNFC('error'); return; }
      const { token, expira_en } = await res.json();
      nfcTokenRef.current = token;
      setEstadoNFC('ready');

      // Renew automatically 30s before expiry
      setTimeout(() => {
        renovandoRef.current = false;
        renovarYEmitir();
      }, (expira_en - 30) * 1000);

      // Broadcast loop: each time a responder brings their phone closer
      emitirBucle(token);
    } catch {
      setEstadoNFC('error');
      renovandoRef.current = false;
    }
  };

  const emitirBucle = async (token: string) => {
    // On Android (HCE): writes the token and waits for a read, then repeats
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      setEstadoNFC('broadcasting');
      const bytes = Ndef.encodeMessage([Ndef.textRecord(token)]);
      if (bytes) await NfcManager.ndefHandler.writeNdefMessage(bytes);
      // After being read, broadcast again with the current token (may have been renewed)
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setEstadoNFC('ready');
      // Restart loop with the most recent token
      if (nfcTokenRef.current) emitirBucle(nfcTokenRef.current);
    } catch {
      // Normal cancellation or error — retry
      setEstadoNFC('ready');
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  // ── Emergency ──────────────────────────────────────────────────────────────
  const activarEmergencia = async () => {
    setActivandoEmergencia(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'We need access to your location to activate the emergency.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const token = await user?.getIdToken();
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/emergencias/activar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: user?.uid, lat: loc.coords.latitude, lon: loc.coords.longitude }),
      });
      if (res.ok) Alert.alert('🚨 Emergency activated', 'The nearest responders have been notified.');
      else Alert.alert('Error', 'Could not activate the emergency.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActivandoEmergencia(false);
    }
  };

  const cerrarSesion = async () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(auth); router.replace('/'); } },
    ]);
  };

  const iniciales = perfil?.nombre
    ? perfil.nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  if (cargando) {
    return <View style={styles.centro}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <SafeAreaView style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTexto}>{iniciales}</Text>
              </View>
              <View>
                <Text style={styles.headerNombre}>{perfil?.nombre ?? 'User'}</Text>
                <Text style={styles.headerSubtitulo}>
                  {perfil?.edad ? `${perfil.edad} years old` : 'Citizen'} · Blood type {perfil?.grupo_sanguineo ?? '—'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.botonSalir} onPress={cerrarSesion}>
              <Text style={styles.botonSalirTexto}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <View style={styles.cuerpo}></View>

        {/* BODY */}
        <View style={styles.cuerpo}>

          {/* Emergency */}
          <TouchableOpacity
            style={[styles.cardEmergencia, activandoEmergencia && styles.cardEmergenciaActiva]}
            onPress={activarEmergencia}
            activeOpacity={0.85}
          >
            <View style={styles.emergenciaIconoWrap}>
              <Text style={styles.emergenciaIcono}>🫀</Text>
            </View>
            <View style={styles.emergenciaTextos}>
              <Text style={styles.emergenciaTitulo}>
                {activandoEmergencia ? 'Activating...' : 'ACTIVATE EMERGENCY'}
              </Text>
              <Text style={styles.emergenciaSubtitulo}>
                Alerts the nearest responders
              </Text>
            </View>
          </TouchableOpacity>

          {/* Smartwatch indicator */}
          {perfil?.vinculo_reloj && (
            <View style={styles.watchIndicador}>
              <Text style={{ fontSize: 20 }}>⌚</Text>
              <View>
                <Text style={styles.watchTitulo}>Watch linked</Text>
                <Text style={styles.watchSub}>Active cardiac monitoring</Text>
              </View>
            </View>
          )}

          {/* NFC indicator — always active, no button */}
          {estadoNFC !== 'not_supported' && (
            <View style={styles.nfcIndicador}>
              <View style={[
                styles.nfcDot,
                estadoNFC === 'ready' || estadoNFC === 'broadcasting' ? styles.nfcDotActivo : styles.nfcDotEspera,
              ]} />
              <Text style={styles.nfcTexto}>
                {estadoNFC === 'starting' && 'Starting NFC...'}
                {estadoNFC === 'ready' && 'Medical history ready to share via NFC'}
                {estadoNFC === 'broadcasting' && "Bring the responder's phone closer..."}
                {estadoNFC === 'error' && 'NFC not available'}
              </Text>
            </View>
          )}

          {/* Medical profile header */}
          <View style={styles.seccionHeader}>
            <Text style={styles.seccionTitulo}>Medical profile</Text>
            <Text style={styles.seccionBadge}>Verified responders only</Text>
          </View>

          {/* Blood type + allergies grid */}
          <View style={styles.grid}>
            <View style={[styles.card, styles.cardMitad]}>
              <Text style={styles.cardLabel}>Blood type</Text>
              <Text style={styles.cardGrupo}>{perfil?.grupo_sanguineo ?? '—'}</Text>
            </View>
            <View style={[styles.card, styles.cardMitad]}>
              <Text style={styles.cardLabel}>Allergies</Text>
              {perfil?.alergias
                ? perfil.alergias.split(',').map((a, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagTexto}>{a.trim()}</Text>
                    </View>
                  ))
                : <Text style={styles.cardValor}>None</Text>}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Pre-existing conditions</Text>
            <Text style={styles.cardValor}>{perfil?.patologias || 'No conditions on record'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Current medication</Text>
            <Text style={styles.cardValor}>{perfil?.medicacion || 'None'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Emergency contact</Text>
            <Text style={styles.cardValorDestacado}>{perfil?.contacto_emergencia ?? '—'}</Text>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const AZUL_OSCURO = '#0C2D5A';
const AZUL_MED = '#185FA5';
const AZUL_CLARO = '#378ADD';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F6FD' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AZUL_OSCURO },
  scroll: { paddingBottom: 80 },

  header: { backgroundColor: AZUL_OSCURO },
  headerContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#C0504D', alignItems: 'center', justifyContent: 'center',
  },
  avatarTexto: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerNombre: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSubtitulo: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  botonSalir: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 16,
  },
  botonSalirTexto: { fontSize: 14, fontWeight: '600', color: '#fff' },

  cuerpo: { padding: 16, gap: 12 },

  cardEmergencia: {
    backgroundColor: '#B03A2E', borderRadius: 16,
    padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16,
    shadowColor: '#B03A2E', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  cardEmergenciaActiva: { backgroundColor: '#7B241C' },
  emergenciaIconoWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  emergenciaIcono: { fontSize: 26 },
  emergenciaTextos: { flex: 1 },
  emergenciaTitulo: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  emergenciaSubtitulo: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 },

  watchIndicador: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EBF4FF', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: AZUL_CLARO },
  watchTitulo: { fontSize: 14, fontWeight: '700', color: AZUL_OSCURO },
  watchSub: { fontSize: 11, color: AZUL_MED },

  nfcIndicador: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E0EDFA',
    paddingVertical: 12, paddingHorizontal: 16,
  },
  nfcDot: { width: 8, height: 8, borderRadius: 4 },
  nfcDotActivo: { backgroundColor: '#3B6D11' },
  nfcDotEspera: { backgroundColor: '#B4B2A9' },
  nfcTexto: { fontSize: 13, color: AZUL_MED, fontWeight: '500', flex: 1 },

  seccionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 8, marginBottom: 4,
  },
  seccionTitulo: { fontSize: 17, fontWeight: '700', color: AZUL_OSCURO },
  seccionBadge: {
    fontSize: 11, fontWeight: '600', color: AZUL_MED,
    backgroundColor: '#EBF4FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
  },

  grid: { flexDirection: 'row', gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E8F1FA' },
  cardMitad: { flex: 1 },
  cardLabel: {
    fontSize: 11, color: AZUL_CLARO, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
  },
  cardValor: { fontSize: 15, fontWeight: '600', color: AZUL_OSCURO },
  cardValorDestacado: { fontSize: 16, fontWeight: '700', color: AZUL_MED },
  cardGrupo: { fontSize: 32, fontWeight: '800', color: '#C0504D' },
  tag: {
    backgroundColor: '#EBF4FF', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4,
  },
  tagTexto: { fontSize: 13, color: AZUL_MED, fontWeight: '500' },
});