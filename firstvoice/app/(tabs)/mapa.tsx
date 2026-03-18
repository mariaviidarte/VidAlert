import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useAuth } from '../../AuthContext';
import { db } from '../../firebaseConfig';
import { useUbicacion } from '../../useUbicacion';

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://10.0.2.2:8000';

type Emergencia = { id: string; lat: number; lon: number; nombre: string; respondedor_asignado: string | null };
type Respondedor = { id: string; lat: number; lon: number; activo: boolean };
type Coordenada = { latitude: number; longitude: number };

function decodificarPolyline(encoded: string): Coordenada[] {
  const puntos: Coordenada[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    puntos.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return puntos;
}

async function obtenerRutaYTiempo(origen: Coordenada, destino: Coordenada) {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origen.latitude},${origen.longitude}&destination=${destino.latitude},${destino.longitude}&mode=driving&key=${GOOGLE_MAPS_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.length > 0) {
      const leg = data.routes[0].legs[0];
      return {
        puntos: decodificarPolyline(data.routes[0].overview_polyline.points),
        distancia: leg.distance.text,
        tiempo: leg.duration.text,
      };
    }
  } catch (e) {
    console.warn('Error fetching route:', e);
  }
  return { puntos: [], distancia: null, tiempo: null };
}

export default function MapaScreen() {
  const { user, rol } = useAuth();
  const esSanitario = rol === 'sanitario';
  const [disponible] = useState(true);
  const { ubicacion, permiso } = useUbicacion(user?.uid, disponible);
  const [emergencias, setEmergencias] = useState<Emergencia[]>([]);
  const [respondedores, setRespondedores] = useState<Respondedor[]>([]);

  const [emergenciaAsignada, setEmergenciaAsignada] = useState<Emergencia | null>(null);
  const [rutaPuntos, setRutaPuntos] = useState<Coordenada[]>([]);
  const [distanciaRuta, setDistanciaRuta] = useState<string | null>(null);
  const [tiempoRuta, setTiempoRuta] = useState<string | null>(null);

  const [sanitarioEnCamino, setSanitarioEnCamino] = useState<Respondedor | null>(null);
  const [tiempoLlegada, setTiempoLlegada] = useState<string | null>(null);

  const mapRef = useRef<MapView>(null);
  const [bannerExpandido, setBannerExpandido] = useState(true);

  // Habilitar animaciones en Android
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const toggleBanner = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBannerExpandido(prev => !prev);
  };

  const hayBanner = (esSanitario && !!emergenciaAsignada) || (!esSanitario && !!sanitarioEnCamino);

  // ─── VISTA SANITARIO ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!esSanitario || !user?.uid) return;
    const q = query(
      collection(db, 'emergencias'),
      where('respondedor_asignado', '==', user.uid),
      where('estado', '==', 'en_camino')
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setEmergenciaAsignada({
          id: d.id,
          lat: d.data().lat,
          lon: d.data().lon,
          nombre: d.data().nombre ?? 'Emergency',
          respondedor_asignado: d.data().respondedor_asignado,
        });
      } else {
        setEmergenciaAsignada(null);
        setRutaPuntos([]);
        setDistanciaRuta(null);
        setTiempoRuta(null);
      }
    });
  }, [esSanitario, user?.uid]);

  // ─── VISTA CIUDADANO ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (esSanitario || !user?.uid) return;
    const q = query(
      collection(db, 'emergencias'),
      where('uid_ciudadano', '==', user.uid),
      where('estado', '==', 'en_camino')
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        const uidRespondedor = d.data().respondedor_asignado;
        setEmergenciaAsignada({
          id: d.id,
          lat: d.data().lat,
          lon: d.data().lon,
          nombre: d.data().nombre ?? '',
          respondedor_asignado: uidRespondedor,
        });
        if (uidRespondedor) {
          const unsubSanitario = onSnapshot(
            collection(db, 'ubicaciones'),
            (ubicSnap) => {
              const docSanitario = ubicSnap.docs.find(doc => doc.id === uidRespondedor);
              if (docSanitario) {
                setSanitarioEnCamino({
                  id: docSanitario.id,
                  lat: docSanitario.data().lat,
                  lon: docSanitario.data().lon,
                  activo: docSanitario.data().activo,
                });
              }
            }
          );
          return () => unsubSanitario();
        }
      } else {
        setEmergenciaAsignada(null);
        setSanitarioEnCamino(null);
        setTiempoLlegada(null);
      }
    });
  }, [esSanitario, user?.uid]);

  // ─── Ruta sanitario ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ubicacion || !emergenciaAsignada || !esSanitario) return;
    const origen = { latitude: ubicacion.lat, longitude: ubicacion.lon };
    const destino = { latitude: emergenciaAsignada.lat, longitude: emergenciaAsignada.lon };
    obtenerRutaYTiempo(origen, destino).then(({ puntos, distancia, tiempo }) => {
      setRutaPuntos(puntos);
      setDistanciaRuta(distancia);
      setTiempoRuta(tiempo);
    });
  }, [ubicacion, emergenciaAsignada, esSanitario]);

  // ─── Tiempo llegada ciudadano ─────────────────────────────────────────────────
  useEffect(() => {
    if (esSanitario || !sanitarioEnCamino || !emergenciaAsignada) return;
    const origen = { latitude: sanitarioEnCamino.lat, longitude: sanitarioEnCamino.lon };
    const destino = { latitude: emergenciaAsignada.lat, longitude: emergenciaAsignada.lon };
    obtenerRutaYTiempo(origen, destino).then(({ tiempo }) => setTiempoLlegada(tiempo));
  }, [sanitarioEnCamino, emergenciaAsignada, esSanitario]);

  // ─── Centrar mapa ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (rutaPuntos.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(rutaPuntos, {
        edgePadding: { top: 80, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [rutaPuntos]);

  useEffect(() => {
    if (!esSanitario && ubicacion && sanitarioEnCamino && mapRef.current) {
      mapRef.current.fitToCoordinates([
        { latitude: ubicacion.lat, longitude: ubicacion.lon },
        { latitude: sanitarioEnCamino.lat, longitude: sanitarioEnCamino.lon },
      ], {
        edgePadding: { top: 80, right: 60, bottom: 40, left: 60 },
        animated: true,
      });
    }
  }, [sanitarioEnCamino]);

  // ─── Emergencias y respondedores modo normal ──────────────────────────────────
  useEffect(() => {
    const qEmergencias = query(
      collection(db, 'emergencias'),
      where('estado', '==', 'activa'),
      where('respondedor_asignado', '==', null)
    );
    const unsubEmergencias = onSnapshot(qEmergencias, (snap) => {
      setEmergencias(snap.docs.map(d => ({
        id: d.id, lat: d.data().lat, lon: d.data().lon,
        nombre: d.data().nombre ?? 'Emergency', respondedor_asignado: null,
      })));
    });
    const qRespondedores = query(collection(db, 'ubicaciones'), where('activo', '==', true));
    const unsubRespondedores = onSnapshot(qRespondedores, (snap) => {
      setRespondedores(snap.docs.map(d => ({
        id: d.id, lat: d.data().lat, lon: d.data().lon, activo: d.data().activo,
      })));
    });
    return () => { unsubEmergencias(); unsubRespondedores(); };
  }, []);

  const cerrarEmergencia = async () => {
    if (!emergenciaAsignada) return;
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`${BACKEND_URL}/emergencias/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ emergencia_id: emergenciaAsignada.id, uid_sanitario: user?.uid }),
      });
      if (response.ok) {
        setEmergenciaAsignada(null);
        setRutaPuntos([]);
        setDistanciaRuta(null);
        setTiempoRuta(null);
        if (ubicacion && mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: ubicacion.lat, longitude: ubicacion.lon,
            latitudeDelta: 0.02, longitudeDelta: 0.02,
          }, 1000);
        }
      }
    } catch (e) {
      console.warn('Error closing emergency:', e);
    }
  };

  if (!permiso) {
    return <View style={styles.centro}><Text style={styles.texto}>Enable location permission to view the map</Text></View>;
  }
  if (!ubicacion) {
    return <View style={styles.centro}><Text style={styles.texto}>Getting location...</Text></View>;
  }

  return (
    // ── Column layout: map on top, banner below — no overlap ──────
    <View style={styles.container}>

      {/* MAPA — ocupa todo el espacio disponible arriba */}
      <View style={styles.mapaWrapper}>
        <MapView
          ref={mapRef}
          style={styles.mapa}
          initialRegion={{
            latitude: ubicacion.lat,
            longitude: ubicacion.lon,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}>

          <Marker
            coordinate={{ latitude: ubicacion.lat, longitude: ubicacion.lon }}
            title={esSanitario ? 'Your location' : 'You are here'}
            pinColor="#0C447C"
          />

          {esSanitario && emergenciaAsignada && (
            <Marker
              coordinate={{ latitude: emergenciaAsignada.lat, longitude: emergenciaAsignada.lon }}
              title="🚨 Emergency"
              pinColor="#C0504D"
            />
          )}
          {esSanitario && rutaPuntos.length > 0 && (
            <Polyline coordinates={rutaPuntos} strokeColor="#C0504D" strokeWidth={4} />
          )}

          {!esSanitario && sanitarioEnCamino && (
            <Marker
              coordinate={{ latitude: sanitarioEnCamino.lat, longitude: sanitarioEnCamino.lon }}
              title="🧑‍⚕️ Responder on the way"
              pinColor="#185FA5"
            />
          )}

          {!emergenciaAsignada && emergencias.map(e => (
            <Marker key={e.id} coordinate={{ latitude: e.lat, longitude: e.lon }}
              title="🚨 Emergency" description={e.nombre} pinColor="#C0504D" />
          ))}

          {esSanitario && !emergenciaAsignada && respondedores.filter(r => r.id !== user?.uid).map(r => (
            <Marker key={r.id} coordinate={{ latitude: r.lat, longitude: r.lon }}
              title="🧑‍⚕️ Responder" pinColor="#378ADD" />
          ))}
        </MapView>
      </View>

      {/* BANNER SANITARIO — colapsable */}
      {esSanitario && emergenciaAsignada && (
        <View style={styles.banner}>
          {/* Cabecera siempre visible — toca para expandir */}
          <TouchableOpacity style={styles.bannerHeader} onPress={toggleBanner} activeOpacity={0.8}>
            <View style={styles.puntorojo} />
            <Text style={styles.bannerTitulo}>En route to emergency</Text>
            <View style={styles.badgeActiva}><Text style={styles.badgeTexto}>Activa</Text></View>
            <Text style={styles.chevron}>{bannerExpandido ? '▼' : '▲'}</Text>
          </TouchableOpacity>

          {/* Contenido expandido */}
          {bannerExpandido && (
            <>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Distancia</Text>
                  <Text style={styles.statValor}>{distanciaRuta ?? '...'}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Tiempo est.</Text>
                  <Text style={styles.statValor}>{tiempoRuta ?? '...'}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.botonAtendida} onPress={cerrarEmergencia}>
                <Text style={styles.botonAtendidaTexto}>Emergency resolved</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* BANNER CIUDADANO — debajo del mapa, no encima */}
      {!esSanitario && sanitarioEnCamino && (
        <View style={[styles.banner, styles.bannerCiudadano]}>
          <View style={styles.bannerHeader}>
            <View style={styles.puntoverde} />
            <Text style={styles.bannerTitulo}>Responder on the way</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { flex: 1 }]}>
              <Text style={styles.statLabel}>Llega en aproximadamente</Text>
              <Text style={[styles.statValor, { fontSize: 26 }]}>{tiempoLlegada ?? '...'}</Text>
            </View>
          </View>
          <Text style={styles.bannerSubtexto}>The blue dot on the map shows their real-time position</Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  // ── Layout principal en columna ──────────────────────────────────────────────
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#F0F6FD',
  },
  mapaWrapper: {
    flex: 1,  // ocupa todo el espacio que no usa el banner
  },
  mapa: { flex: 1 },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F6FD', padding: 24 },
  texto: { fontSize: 16, color: '#378ADD', textAlign: 'center' },

  // ── Banner — no longer position:absolute, in the normal flow ─────────────
  banner: {
    backgroundColor: '#0C447C',
    padding: 16,
    paddingBottom: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  bannerCiudadano: { backgroundColor: '#185FA5' },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  chevron: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 4 },
  puntorojo: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E24B4A' },
  puntoverde: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5DCAA5' },
  bannerTitulo: { fontSize: 14, fontWeight: '600', color: 'white', flex: 1 },
  badgeActiva: { backgroundColor: 'rgba(226,75,74,0.25)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeTexto: { fontSize: 11, color: '#F09595', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  statValor: { fontSize: 20, fontWeight: '600', color: 'white' },
  bannerSubtexto: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 10, textAlign: 'center' },
  botonAtendida: {
    backgroundColor: '#5DCAA5',
    borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 12,
  },
  botonAtendidaTexto: { fontSize: 15, fontWeight: '700', color: '#0C3D2A' },
});
