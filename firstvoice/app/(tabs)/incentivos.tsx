import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../AuthContext';
import { db } from '../../firebaseConfig';

type ResponderProfile = {
  emergencias_atendidas: number;
  tasa_aceptacion: number;
  tiempo_medio_desviacion: number;
};

// ── Level system ──────────────────────────────────────────────────────────────
const LEVELS = [
  { nombre: 'Starter',  emoji: '⭐', color: '#378ADD', min: 0,   max: 20  },
  { nombre: 'Bronze',   emoji: '🥉', color: '#C47B3A', min: 20,  max: 50  },
  { nombre: 'Silver',   emoji: '🥈', color: '#8E9BAE', min: 50,  max: 100 },
  { nombre: 'Gold',     emoji: '🥇', color: '#F5A623', min: 100, max: 999 },
];

function calcularNivel(emergencias: number) {
  return LEVELS.slice().reverse().find(n => emergencias >= n.min) ?? LEVELS[0];
}

function calcularProgreso(emergencias: number, nivel: typeof LEVELS[0]) {
  if (nivel.max === 999) return 1;
  return (emergencias - nivel.min) / (nivel.max - nivel.min);
}

const MESSAGES = [
  { min: 0,   texto: 'Respond to your first emergency and start saving lives!' },
  { min: 1,   texto: 'First life saved! Every emergency earns you 1 minute of vacation 🎉' },
  { min: 5,   texto: "You've saved 5 lives. The community counts on you! 💪" },
  { min: 10,  texto: '10 emergencies attended. You are the heart of VidAlert ❤️' },
  { min: 20,  texto: 'Bronze level! Your commitment makes a difference 🥉' },
  { min: 50,  texto: 'Silver level! You are a role model for other responders 🥈' },
  { min: 100, texto: 'Gold level! You are a VidAlert legend. Thank you for everything 🥇' },
];

function obtenerMensaje(emergencias: number): string {
  return [...MESSAGES].reverse().find(m => emergencias >= m.min)?.texto ?? MESSAGES[0].texto;
}

export default function IncentivoScreen() {
  const { user, nombre } = useAuth();
  const [perfil, setPerfil] = useState<ResponderProfile>({
    emergencias_atendidas: 0,
    tasa_aceptacion: 0,
    tiempo_medio_desviacion: 0,
  });

  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(doc(db, 'sanitarios', user.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setPerfil({
          emergencias_atendidas: d.emergencias_atendidas ?? 0,
          tasa_aceptacion:       d.tasa_aceptacion ?? 0,
          tiempo_medio_desviacion: d.tiempo_medio_desviacion ?? 0,
        });
      }
    });
  }, [user?.uid]);

  const nivel     = calcularNivel(perfil.emergencias_atendidas);
  const progreso  = calcularProgreso(perfil.emergencias_atendidas, nivel);
  const puntos    = perfil.emergencias_atendidas; // 1 emergency = 1 min vacation
  const mensaje   = obtenerMensaje(perfil.emergencias_atendidas);
  const tasa      = Math.round(perfil.tasa_aceptacion * 100);
  const desv      = perfil.tiempo_medio_desviacion;
  const desvTexto = desv === 0 ? '—' : desv < 0 ? `${Math.abs(desv)}s early` : `${desv}s late`;
  const desvColor = desv <= 0 ? '#5DCAA5' : '#E24B4A';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.titulo}>My incentives</Text>
          <Text style={styles.subtitulo}>{nombre ?? 'Responder'}</Text>
        </View>

        {/* ── CURRENT LEVEL CARD ──────────────────────────────────────────── */}
        <View style={[styles.nivelCard, { borderColor: nivel.color }]}>
          <View style={styles.nivelTop}>
            <Text style={styles.nivelEmoji}>{nivel.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.nivelNombre, { color: nivel.color }]}>
                {nivel.nombre} level
              </Text>
              <Text style={styles.nivelSubtitulo}>
                {nivel.max === 999
                  ? 'Maximum level reached!'
                  : `${perfil.emergencias_atendidas} / ${nivel.max} emergencies`}
              </Text>
            </View>
            <View style={[styles.puntosBox, { borderColor: nivel.color }]}>
              <Text style={[styles.puntosNumero, { color: nivel.color }]}>{puntos}</Text>
              <Text style={styles.puntosLabel}>min 🏖️</Text>
            </View>
          </View>

          {/* Progress bar */}
          {nivel.max !== 999 && (
            <View style={styles.barraFondo}>
              <View style={[
                styles.barraRelleno,
                { width: `${Math.min(progreso * 100, 100)}%` as any, backgroundColor: nivel.color }
              ]} />
            </View>
          )}

          <Text style={styles.mensajeMotivacion}>{mensaje}</Text>
        </View>

        {/* ── LEVEL JOURNEY ───────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Your journey</Text>
          <View style={styles.nivelesRow}>
            {LEVELS.map((n, i) => {
              const alcanzado = perfil.emergencias_atendidas >= n.min;
              const esCurrent = n.nombre === nivel.nombre;
              return (
                <View key={n.nombre} style={styles.nivelStep}>
                  <View style={[
                    styles.nivelCirculo,
                    alcanzado && { backgroundColor: n.color, borderColor: n.color },
                    esCurrent && styles.nivelCirculoActual,
                  ]}>
                    <Text style={styles.nivelStepEmoji}>{n.emoji}</Text>
                  </View>
                  <Text style={[styles.nivelStepNombre, esCurrent && { color: n.color, fontWeight: '700' }]}>
                    {n.nombre}
                  </Text>
                  <Text style={styles.nivelStepMin}>{n.min}+</Text>
                  {i < LEVELS.length - 1 && (
                    <View style={[styles.lineaConexion, alcanzado && { backgroundColor: LEVELS[i + 1].color }]} />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── METRICS ──────────────────────────────────────────────────────── */}
        <Text style={styles.seccionTitulo}>Your stats</Text>

        <View style={styles.metricasGrid}>

          <View style={styles.metricaCard}>
            <Text style={styles.metricaIcono}>🫀</Text>
            <Text style={styles.metricaNumero}>{perfil.emergencias_atendidas}</Text>
            <Text style={styles.metricaLabel}>lives saved</Text>
          </View>

          <View style={styles.metricaCard}>
            <Text style={styles.metricaIcono}>✅</Text>
            <Text style={styles.metricaNumero}>{tasa}%</Text>
            <Text style={styles.metricaLabel}>acceptance rate</Text>
          </View>

          <View style={styles.metricaCard}>
            <Text style={styles.metricaIcono}>⚡</Text>
            <Text style={[styles.metricaNumero, { color: desvColor }]}>{desvTexto}</Text>
            <Text style={styles.metricaLabel}>avg. deviation</Text>
          </View>

          <View style={styles.metricaCard}>
            <Text style={styles.metricaIcono}>🏖️</Text>
            <Text style={styles.metricaNumero}>{puntos} min</Text>
            <Text style={styles.metricaLabel}>vacation earned</Text>
          </View>

        </View>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>How does it work?</Text>
          <View style={styles.reglaRow}>
            <Text style={styles.reglaIcono}>🚨</Text>
            <Text style={styles.reglaTexto}>Each emergency attended = <Text style={styles.bold}>1 point = 1 minute of vacation</Text></Text>
          </View>
          <View style={styles.reglaRow}>
            <Text style={styles.reglaIcono}>⭐</Text>
            <Text style={styles.reglaTexto}>Reach <Text style={styles.bold}>20 emergencies</Text> to advance to Bronze</Text>
          </View>
          <View style={styles.reglaRow}>
            <Text style={styles.reglaIcono}>🥉</Text>
            <Text style={styles.reglaTexto}>Reach <Text style={styles.bold}>50 emergencies</Text> to advance to Silver</Text>
          </View>
          <View style={styles.reglaRow}>
            <Text style={styles.reglaIcono}>🥈</Text>
            <Text style={styles.reglaTexto}>Reach <Text style={styles.bold}>100 emergencies</Text> to reach Gold</Text>
          </View>
          <View style={styles.reglaRow}>
            <Text style={styles.reglaIcono}>🏖️</Text>
            <Text style={styles.reglaTexto}>Accumulated minutes are <Text style={styles.bold}>redeemed with your coordinator</Text></Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F6FD' },
  scroll: { padding: 24, gap: 16 },

  header: { marginBottom: 4 },
  titulo: { fontSize: 26, fontWeight: '800', color: '#0C447C' },
  subtitulo: { fontSize: 14, color: '#378ADD', marginTop: 2 },

  seccionTitulo: { fontSize: 16, fontWeight: '700', color: '#0C447C', marginTop: 4 },

  nivelCard: {
    backgroundColor: 'white', borderRadius: 20,
    padding: 20, borderWidth: 2, gap: 12,
  },
  nivelTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nivelEmoji: { fontSize: 44 },
  nivelNombre: { fontSize: 20, fontWeight: '800' },
  nivelSubtitulo: { fontSize: 12, color: '#888', marginTop: 2 },
  puntosBox: {
    alignItems: 'center', borderRadius: 14,
    borderWidth: 2, padding: 10, minWidth: 70,
    backgroundColor: '#F0F6FD',
  },
  puntosNumero: { fontSize: 24, fontWeight: '800' },
  puntosLabel: { fontSize: 11, color: '#378ADD' },
  barraFondo: { height: 10, backgroundColor: '#E6F1FB', borderRadius: 5, overflow: 'hidden' },
  barraRelleno: { height: 10, borderRadius: 5 },
  mensajeMotivacion: { fontSize: 13, color: '#555', lineHeight: 20 },

  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#B5D4F4', gap: 12 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: '#0C447C' },
  nivelesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' },
  nivelStep: { alignItems: 'center', flex: 1, position: 'relative' },
  nivelCirculo: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#E6F1FB', borderWidth: 2, borderColor: '#B5D4F4',
    alignItems: 'center', justifyContent: 'center',
  },
  nivelCirculoActual: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
    transform: [{ scale: 1.1 }],
  },
  nivelStepEmoji: { fontSize: 24 },
  nivelStepNombre: { fontSize: 12, color: '#888', marginTop: 6 },
  nivelStepMin: { fontSize: 10, color: '#aaa' },
  lineaConexion: {
    position: 'absolute', top: 25, left: '55%', right: '-45%',
    height: 2, backgroundColor: '#E6F1FB',
  },

  metricasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricaCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: 'white', borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#B5D4F4',
  },
  metricaIcono: { fontSize: 28, marginBottom: 8 },
  metricaNumero: { fontSize: 22, fontWeight: '700', color: '#0C447C' },
  metricaLabel: { fontSize: 12, color: '#378ADD', marginTop: 4, textAlign: 'center' },

  reglaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reglaIcono: { fontSize: 18, marginTop: 1 },
  reglaTexto: { fontSize: 13, color: '#555', flex: 1, lineHeight: 20 },
  bold: { fontWeight: '700', color: '#0C447C' },
});