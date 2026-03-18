import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { db } from './firebaseConfig';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registrarTokenPush(uid: string) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.warn('Permiso de notificaciones denegado');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('emergencias', {
      name: 'Emergencias VidAlert',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF0000',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: '063aa3f5-437a-438b-9fb3-aaa058890af5',
  });

  console.log('Token push registrado:', token.data);

  await setDoc(doc(db, 'push_tokens', uid), {
    token: token.data,
    uid,
    timestamp: new Date().toISOString(),
  });

  return token.data;
}

export function useNotificaciones() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;

      // Ignorar notificaciones de emergencia ya cubierta
      if (data?.estado === 'cubierta') return;

      if (data?.emergencia_id) {
        router.push({
          pathname: '/(tabs)/alerta' as any,
          params: {
            emergencia_id: String(data.emergencia_id),
            distancia: String(data.distancia ?? '---'),
            tiempo: String(data.tiempo ?? '--:--'),
          }
        });
      }
    });

    return () => sub.remove();
  }, []);
}