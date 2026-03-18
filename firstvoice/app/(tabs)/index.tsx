import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { loginUser, logoutUser, registerUser } from '../../authService';
import { validarLoginCiudadano, validarLoginSanitario, validarRegistroCiudadano, validarRegistroSanitario } from './validaciones';

type Role = 'sanitario' | 'citizen' | 'ciudadano';
type Screen = 'login' | 'registro';

export default function BienvenidaScreen() {
  const [rol, setRol] = useState<any>('sanitario');
  const [pantalla, setPantalla] = useState<Screen>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [colegiado, setColegiado] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [grupoSanguineo, setGrupoSanguineo] = useState('');
  const [alergias, setAlergias] = useState('');
  const [medicacion, setMedicacion] = useState('');
  const [contactoEmergencia, setContactoEmergencia] = useState('');
  const [edad, setEdad] = useState('');
  const [patologias, setPatologias] = useState('');
  const [usaReloj, setUsaReloj] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaUbicacion, setAceptaUbicacion] = useState(false);
  const [cargando, setCargando] = useState(false);

  const resetCampos = () => {
    setNombre(''); setEmail(''); setContrasena('');
    setColegiado(''); setEspecialidad('');
    setGrupoSanguineo(''); setAlergias('');
    setMedicacion(''); setContactoEmergencia('');
    setEdad(''); setPatologias(''); setUsaReloj(false);
    setAceptaTerminos(false); setAceptaUbicacion(false);
  };

  const handleLogin = async () => {
    const error = rol === 'sanitario'
      ? validarLoginSanitario({ email, contrasena })
      : validarLoginCiudadano({ email, contrasena });
    if (error) { Alert.alert('Error', error); return; }
    setCargando(true);
    try {
      const { uid } = await loginUser(email, contrasena);
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/usuarios/rol/${uid}`);
      const data = await res.json();

      if (data.rol !== rol) {
        await logoutUser();
        Alert.alert('Incorrect access', `This account belongs to a ${data.rol === 'sanitario' ? 'responder' : 'citizen'}. Please select the correct role.`);
        return;
      }

      if (data.rol === 'sanitario') router.replace('/(tabs)/dashboard');
      else router.replace('/(tabs)/mapa');  // ciudadano → mapa first
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCargando(false);
    }
  };

  const handleRegistro = async () => {
    if (!aceptaTerminos) { Alert.alert('Notice', 'You must accept the terms and conditions.'); return; }
    if (!aceptaUbicacion) { Alert.alert('Notice', 'VidAlert needs access to your location.'); return; }

    const error = rol === 'sanitario'
      ? validarRegistroSanitario({ nombre, email, colegiado, especialidad, contrasena })
      : validarRegistroCiudadano({ nombre, email, contrasena, grupoSanguineo, contactoEmergencia });

    if (error) { Alert.alert('Error', error); return; }

    setCargando(true);
    try {
      const { uid, token } = await registerUser(email, contrasena);
      const endpoint = rol === 'sanitario' ? 'registro-sanitario' : 'registro-ciudadano';

      const body = rol === 'sanitario'
        ? { uid, token, nombre, email, colegiado, especialidad }
        : {
            uid, token, nombre, email,
            grupo_sanguineo: grupoSanguineo,
            alergias,
            medicacion,
            contacto_emergencia: contactoEmergencia,
            edad: parseInt(edad),
            patologias,
            vinculo_reloj: usaReloj
          };

      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/usuarios/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error('Error saving profile');

      Alert.alert(
        'Registration complete',
        'Your account has been created successfully. Please sign in to continue.',
        [
          {
            text: 'Go to Login',
            onPress: () => {
              resetCampos();
              setPantalla('login');
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCargando(false);
    }
  };

  if (pantalla === 'login') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centro}>
            <Svg width="120" height="120" viewBox="0 0 200 200">
              <Path d="M100 170 C100 170 35 130 35 88 C35 65 52 52 68 52 C81 52 92 59 100 70 C108 59 119 52 132 52 C148 52 165 65 165 88 C165 130 100 170 100 170 Z" fill="#C0504D" />
              <Polyline points="55,95 65,95 71,75 79,115 86,85 93,95 115,95 121,78 129,108 136,95 145,95" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.titulo}>VidAlert</Text>
            <Text style={styles.subtitulo}>Saving lives in real time</Text>

          <View style={styles.tabsContainer}>
            <TouchableOpacity style={[styles.tab, rol === 'sanitario' && styles.tabActivo]} onPress={() => { setRol('sanitario'); resetCampos(); }}>
              <Text style={[styles.tabTexto, rol === 'sanitario' && styles.tabTextoActivo]}>Responder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, rol === 'ciudadano' && styles.tabActivo]} onPress={() => { setRol('ciudadano'); resetCampos(); }}>
              <Text style={[styles.tabTexto, rol === 'ciudadano' && styles.tabTextoActivo]}>Citizen</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor="#B5D4F4" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor="#B5D4F4" value={contrasena} onChangeText={setContrasena} secureTextEntry />
          </View>

          <TouchableOpacity style={[styles.botonPrimario, cargando && styles.botonDesactivado]} onPress={handleLogin} disabled={cargando}>
            <Text style={styles.botonPrimarioTexto}>{cargando ? 'Loading...' : 'Sign in'}</Text>
          </TouchableOpacity>

          <Text style={styles.linkTexto}>
            {"Don't have an account? "}
            <Text style={styles.link} onPress={() => { resetCampos(); setPantalla('registro'); }}>Sign up</Text>
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setPantalla('login')}>
          <Text style={styles.backTexto}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.titulo}>{rol === 'sanitario' ? 'Responder registration' : 'Citizen registration'}</Text>
        <Text style={styles.subtitulo}>{rol === 'sanitario' ? 'Create your professional account' : 'Create your medical profile'}</Text>

        <View style={styles.tabsContainer}>
          <TouchableOpacity style={[styles.tab, rol === 'sanitario' && styles.tabActivo]} onPress={() => { setRol('sanitario'); resetCampos(); }}>
            <Text style={[styles.tabTexto, rol === 'sanitario' && styles.tabTextoActivo]}>Responder</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, rol === 'ciudadano' && styles.tabActivo]} onPress={() => { setRol('ciudadano'); resetCampos(); }}>
            <Text style={[styles.tabTexto, rol === 'ciudadano' && styles.tabTextoActivo]}>Citizen</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.inputLabel}>Full name</Text>
          <TextInput style={styles.input} placeholder="First Last" placeholderTextColor="#B5D4F4" value={nombre} onChangeText={setNombre} />

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor="#B5D4F4" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput style={styles.input} placeholder="Minimum 8 characters" placeholderTextColor="#B5D4F4" value={contrasena} onChangeText={setContrasena} secureTextEntry />

          {rol === 'sanitario' && (
            <>
              <Text style={styles.inputLabel}>License number</Text>
              <TextInput style={styles.input} placeholder="28/123456" placeholderTextColor="#B5D4F4" value={colegiado} onChangeText={setColegiado} />
              <Text style={styles.inputLabel}>Specialty</Text>
              <TextInput style={styles.input} placeholder="Doctor, nurse..." placeholderTextColor="#B5D4F4" value={especialidad} onChangeText={setEspecialidad} />
            </>
          )}

          {rol === 'ciudadano' && (
            <>
              <Text style={styles.inputLabel}>Age</Text>
              <TextInput style={styles.input} placeholder="e.g. 65" placeholderTextColor="#B5D4F4" value={edad} onChangeText={setEdad} keyboardType="number-pad" />
              <Text style={styles.inputLabel}>Blood type</Text>
              <TextInput style={styles.input} placeholder="A+, O-..." placeholderTextColor="#B5D4F4" value={grupoSanguineo} onChangeText={setGrupoSanguineo} autoCapitalize="characters" />
              <Text style={styles.inputLabel}>Pre-existing conditions</Text>
              <TextInput style={styles.input} placeholder="Hypertension..." placeholderTextColor="#B5D4F4" value={patologias} onChangeText={setPatologias} />
              <Text style={styles.inputLabel}>Allergies</Text>
              <TextInput style={styles.input} placeholder="Penicillin..." placeholderTextColor="#B5D4F4" value={alergias} onChangeText={setAlergias} />
              <Text style={styles.inputLabel}>Current medication</Text>
              <TextInput style={styles.input} placeholder="Enalapril..." placeholderTextColor="#B5D4F4" value={medicacion} onChangeText={setMedicacion} />
              <Text style={styles.inputLabel}>Emergency contact</Text>
              <TextInput style={styles.input} placeholder="+1 600..." placeholderTextColor="#B5D4F4" value={contactoEmergencia} onChangeText={setContactoEmergencia} keyboardType="phone-pad" />

              <TouchableOpacity
                style={[styles.checkboxRow, { marginTop: 20, backgroundColor: '#D6E8F7', padding: 12, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#185FA5' }]}
                onPress={() => setUsaReloj(!usaReloj)}
              >
                <View style={[styles.checkbox, usaReloj && styles.checkboxActivo]}>
                  {usaReloj && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.checkboxTexto, { fontWeight: '700', color: '#0C447C' }]}>Enable smartwatch monitoring</Text>
                  <Text style={[styles.checkboxTexto, { fontSize: 11 }]}>Automatic anomaly detection and physical alerts.</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.checkboxRow} onPress={() => setAceptaTerminos(!aceptaTerminos)}>
          <View style={[styles.checkbox, aceptaTerminos && styles.checkboxActivo]}>
            {aceptaTerminos && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxTexto}>I accept the <Text style={styles.link}>terms and conditions</Text></Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.checkboxRow} onPress={() => setAceptaUbicacion(!aceptaUbicacion)}>
          <View style={[styles.checkbox, aceptaUbicacion && styles.checkboxActivo]}>
            {aceptaUbicacion && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxTexto}>I agree to share my <Text style={styles.link}>real-time location</Text></Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.botonPrimario, (!aceptaTerminos || !aceptaUbicacion || cargando) && styles.botonDesactivado]}
          onPress={handleRegistro}
          disabled={!aceptaTerminos || !aceptaUbicacion || cargando}>
          <Text style={styles.botonPrimarioTexto}>{cargando ? 'Creating account...' : 'Create account'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF5FC' },
  scroll: { padding: 24, paddingTop: 48 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: '#0C447C', marginBottom: 6 },
  subtitulo: { fontSize: 14, color: '#378ADD', marginBottom: 28 },
  tabsContainer: { flexDirection: 'row', backgroundColor: '#D6E8F7', borderRadius: 12, padding: 4, marginBottom: 24, width: '100%' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActivo: { backgroundColor: 'white' },
  tabTexto: { fontSize: 15, fontWeight: '500', color: '#378ADD' },
  tabTextoActivo: { color: '#0C447C', fontWeight: '700' },
  form: { width: '100%', gap: 6, marginBottom: 16 },
  inputLabel: { fontSize: 13, color: '#378ADD', marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: 'white', borderRadius: 12, padding: 14, fontSize: 14, color: '#0C447C', borderWidth: 1, borderColor: '#D6E8F7' },
  botonPrimario: { backgroundColor: '#185FA5', borderRadius: 14, padding: 16, alignItems: 'center', width: '100%', marginTop: 8 },
  botonDesactivado: { backgroundColor: '#B5D4F4' },
  botonPrimarioTexto: { fontSize: 16, fontWeight: '700', color: 'white' },
  linkTexto: { fontSize: 13, color: '#378ADD', marginTop: 16 },
  link: { color: '#185FA5', fontWeight: '600' },
  backBtn: { marginBottom: 16 },
  backTexto: { fontSize: 15, color: '#185FA5' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#B5D4F4', backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  checkboxActivo: { backgroundColor: '#185FA5', borderColor: '#185FA5' },
  checkmark: { color: 'white', fontSize: 13, fontWeight: '600' },
  checkboxTexto: { fontSize: 13, color: '#378ADD', flex: 1, lineHeight: 20 },
});