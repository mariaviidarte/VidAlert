import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../../AuthContext';
import { auth, db } from '../../firebaseConfig';
import { registrarTokenPush, useNotificaciones } from '../../Notificaciones';
import { useUbicacion } from '../../useUbicacion';

type Emergency = { id: string; lat: number; lon: number; nombre: string };

export default function DashboardScreen() {
  const { user, nombre } = useAuth();
  const [disponible, setDisponible] = useState(true);
  const { ubicacion, permiso } = useUbicacion(user?.uid, disponible);
  const [emergencias, setEmergencias] = useState<Emergency[]>([]);

  useNotificaciones();

  useEffect(() => {
    if (user?.uid) registrarTokenPush(user.uid);
  }, [user]);

  useEffect(() => {
    const q = query(
      collection(db, 'emergencias'),
      where('estado', '==', 'activa'),
      where('respondedor_asignado', '==', null)
    );
    const unsub = onSnapshot(q, (snap) => {
      setEmergencias(snap.docs.map(d => ({
        id: d.id,
        lat: d.data().lat,
        lon: d.data().lon,
        nombre: d.data().nombre ?? 'Emergency',
      })));
    });
    return unsub;
  }, []);

  const cerrarSesion = async () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await signOut(auth);
          router.replace('/');
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.saludo}>Welcome,</Text>
            <Text style={styles.nombre}>{nombre ?? 'Responder'}</Text>
          </View>
          <View style={styles.headerDerecha}>
            <View style={[styles.badge, disponible ? styles.badgeActivo : styles.badgeInactivo]}>
              <Text style={styles.badgeTexto}>{disponible ? 'Available' : 'Inactive'}</Text>
            </View>
            <TouchableOpacity style={styles.botonLogout} onPress={cerrarSesion}>
              <Text style={styles.botonLogoutTexto}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* GPS */}
        <View style={styles.card}>
          <View style={styles.gpsRow}>
            <View style={[styles.gpsDot, !disponible && styles.gpsDotInactivo]} />
            <View>
              <Text style={styles.cardTitulo}>{permiso ? 'GPS active' : 'GPS permission required'}</Text>
              <Text style={styles.cardSubtitulo}>
                {ubicacion ? `${ubicacion.lat.toFixed(4)}, ${ubicacion.lon.toFixed(4)}` : 'Getting location...'}
              </Text>
            </View>
          </View>
        </View>

        {/* Mini map */}
        {ubicacion ? (
          <View style={styles.mapaContainer}>
            <MapView
              style={styles.mapa}
              scrollEnabled={false}
              zoomEnabled={false}
              initialRegion={{
                latitude: ubicacion.lat,
                longitude: ubicacion.lon,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}>
              <Marker
                coordinate={{ latitude: ubicacion.lat, longitude: ubicacion.lon }}
                title="Your location"
                pinColor="#0C447C"
              />
              {emergencias.map(e => (
                <Marker
                  key={e.id}
                  coordinate={{ latitude: e.lat, longitude: e.lon }}
                  title="🚨 Emergency"
                  description={e.nombre}
                  pinColor="#C0504D"
                />
              ))}
            </MapView>
          </View>
        ) : (
          <View style={styles.mapaPlaceholder}>
            <Text style={styles.mapaTexto}>Getting location...</Text>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumero}>{emergencias.length}</Text>
            <Text style={styles.statLabel}>active emergencies</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumero}>2:34</Text>
            <Text style={styles.statLabel}>average time</Text>
          </View>
        </View>

        {/* Availability toggle */}
        <View style={styles.toggleCard}>
          <Text style={styles.toggleTexto}>
            {disponible ? 'Available' : 'Not available right now'}
          </Text>
          <Switch
            value={disponible}
            onValueChange={setDisponible}
            trackColor={{ false: '#B5D4F4', true: '#185FA5' }}
            thumbColor="white"
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F6FD' },
  scroll: { padding: 24, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerDerecha: { alignItems: 'flex-end', gap: 6 },
  saludo: { fontSize: 14, color: '#378ADD' },
  nombre: { fontSize: 22, fontWeight: '700', color: '#0C447C' },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeActivo: { backgroundColor: '#E6F1FB' },
  badgeInactivo: { backgroundColor: '#FFE5E5' },
  badgeTexto: { fontSize: 13, fontWeight: '600', color: '#185FA5' },
  botonLogout: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#B5D4F4' },
  botonLogoutTexto: { fontSize: 12, color: '#378ADD', fontWeight: '600' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#B5D4F4' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gpsDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#185FA5' },
  gpsDotInactivo: { backgroundColor: '#B5D4F4' },
  cardTitulo: { fontSize: 15, fontWeight: '600', color: '#0C447C' },
  cardSubtitulo: { fontSize: 13, color: '#378ADD' },
  mapaContainer: { borderRadius: 16, overflow: 'hidden', height: 180, borderWidth: 1, borderColor: '#B5D4F4' },
  mapa: { flex: 1 },
  mapaPlaceholder: { backgroundColor: '#E6F1FB', borderRadius: 16, height: 180, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#B5D4F4' },
  mapaTexto: { fontSize: 15, color: '#378ADD' },
  statsRow: { flexDirection: 'row', gap: 16 },
  statCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#B5D4F4' },
  statNumero: { fontSize: 28, fontWeight: '700', color: '#0C447C' },
  statLabel: { fontSize: 13, color: '#378ADD', marginTop: 4 },
  toggleCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#B5D4F4' },
  toggleTexto: { fontSize: 15, fontWeight: '600', color: '#0C447C' },
});