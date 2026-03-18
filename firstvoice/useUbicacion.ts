import * as Location from 'expo-location';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { db } from './firebaseConfig';

export function useUbicacion(uid: string | undefined, activo: boolean) {
  const [ubicacion, setUbicacion] = useState<{ lat: number; lon: number } | null>(null);
  const [permiso, setPermiso] = useState<boolean>(false);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    solicitarPermiso();
  }, []);

  const solicitarPermiso = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermiso(status === 'granted');
  };

  useEffect(() => {
    if (!uid || !permiso) return;

    if (activo) {
      // Enviar ubicación cada 15 segundos
      const enviarUbicacion = async () => {
        const loc = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = loc.coords;
        setUbicacion({ lat: latitude, lon: longitude });
        await setDoc(doc(db, 'ubicaciones', uid), {
          uid,
          lat: latitude,
          lon: longitude,
          timestamp: new Date().toISOString(),
          activo: true,
        });
      };

      enviarUbicacion();
      intervaloRef.current = setInterval(enviarUbicacion, 15000);
    } else {
      // Parar envío y marcar como inactivo
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      if (uid) {
        setDoc(doc(db, 'ubicaciones', uid), {
          uid,
          activo: false,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [activo, permiso, uid]);

  return { ubicacion, permiso };
}