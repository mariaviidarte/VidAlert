// firstvoice/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../AuthContext';

const AZUL_ACTIVO = '#5BA4E5';
const TAB_HEIGHT = 64;

function IconoMapa({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: color, marginBottom: 2 }} />
      <View style={{ width: 2.5, height: 7, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function IconoPerfil({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, borderColor: color }} />
      <View style={{ width: 16, height: 7, borderRadius: 4, borderWidth: 2.5, borderColor: color }} />
    </View>
  );
}

function IconoDashboard({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color, opacity: 0.5 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color, opacity: 0.5 }} />
        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      </View>
    </View>
  );
}

function IconoIncentivos({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 1, alignItems: 'flex-end' }}>
        <View style={{ width: 5, height: 10, borderRadius: 2, backgroundColor: color, opacity: 0.5 }} />
        <View style={{ width: 5, height: 16, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 5, height: 12, borderRadius: 2, backgroundColor: color, opacity: 0.7 }} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { rol } = useAuth();
  const esCiudadano = rol === 'ciudadano';
  const esSanitario = rol === 'sanitario';
  const tieneRol = esCiudadano || esSanitario;

  const [barraVisible, setBarraVisible] = useState(true);

  const tabBarStyle = tieneRol && barraVisible ? {
    backgroundColor: Platform.OS === 'ios'
      ? 'rgba(12, 45, 90, 0.82)'
      : 'rgba(12, 45, 90, 0.96)',
    borderTopWidth: 0,
    position: 'absolute' as const,
    elevation: 0,
    height: TAB_HEIGHT,
  } : { display: 'none' as const };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle,
          tabBarActiveTintColor: AZUL_ACTIVO,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
          tabBarItemStyle: { paddingTop: 8 },
        }}
      >
        <Tabs.Screen name="index" options={{ href: null }} />

        {/* SANITARIO: Home → Map → Incentives */}
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconoDashboard color={color} />,
            href: esSanitario ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="mapa"
          options={{
            title: 'Map',
            tabBarIcon: ({ color }) => <IconoMapa color={color} />,
            href: tieneRol ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="incentivos"
          options={{
            title: 'Incentives',
            tabBarIcon: ({ color }) => <IconoIncentivos color={color} />,
            href: esSanitario ? undefined : null,
          }}
        />

        {/* CIUDADANO only: My Profile */}
        <Tabs.Screen
          name="perfil"
          options={{
            title: 'My Profile',
            tabBarIcon: ({ color }) => <IconoPerfil color={color} />,
            href: esCiudadano ? undefined : null,
          }}
        />

        <Tabs.Screen name="alerta" options={{ href: null }} />
      </Tabs>

      {/* Floating button to hide/show the tab bar — only when a role is set */}
      {tieneRol && (
        <TouchableOpacity
          onPress={() => setBarraVisible(v => !v)}
          style={{
            position: 'absolute',
            bottom: barraVisible ? TAB_HEIGHT + 12 : 12,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(12, 45, 90, 0.75)',
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: 'white', fontSize: 14 }}>
            {barraVisible ? '⌄' : '⌃'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}