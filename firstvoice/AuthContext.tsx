import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebaseConfig';

type AuthContextType = {
  user: User | null;
  rol: 'sanitario' | 'ciudadano' | null;
  nombre: string | null;
  cargando: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  rol: null,
  nombre: null,
  cargando: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [rol, setRol] = useState<'sanitario' | 'ciudadano' | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsuscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          const res = await fetch(`http://192.168.1.141:8000/usuarios/rol/${firebaseUser.uid}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          setRol(data.rol);

          // Obtener nombre de Firestore
          const coleccion = data.rol === 'sanitario' ? 'sanitarios' : 'ciudadanos';
          const snap = await getDoc(doc(db, coleccion, firebaseUser.uid));
          if (snap.exists()) setNombre(snap.data().nombre ?? null);

        } catch {
          setRol(null);
          setNombre(null);
        }
      } else {
        setRol(null);
        setNombre(null);
      }
      setCargando(false);
    });
    return unsuscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, rol, nombre, cargando }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);