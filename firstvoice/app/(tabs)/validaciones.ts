export const validarEmail = (email: string): string | null => {
  if (!email.trim()) return 'El email es obligatorio';
  if (!email.includes('@')) return 'El email no es válido';
  if (!email.includes('.')) return 'El email no es válido';
  return null;
};

export const validarContrasena = (contrasena: string): string | null => {
  if (!contrasena.trim()) return 'La contraseña es obligatoria';
  if (contrasena.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  return null;
};

export const validarNombre = (nombre: string): string | null => {
  if (!nombre.trim()) return 'El nombre es obligatorio';
  if (nombre.trim().length < 3) return 'El nombre debe tener al menos 3 caracteres';
  return null;
};

export const validarColegiado = (colegiado: string): string | null => {
  if (!colegiado.trim()) return 'El número de colegiado es obligatorio';
  if (colegiado.trim().length < 5) return 'El número de colegiado no es válido';
  return null;
};

export const validarEspecialidad = (especialidad: string): string | null => {
  if (!especialidad.trim()) return 'La especialidad es obligatoria';
  return null;
};

export const validarGrupoSanguineo = (grupo: string): string | null => {
  const validos = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (!grupo.trim()) return 'El grupo sanguíneo es obligatorio';
  if (!validos.includes(grupo.trim().toUpperCase())) return 'Grupo sanguíneo no válido. Opciones: A+, A-, B+, B-, AB+, AB-, O+, O-';
  return null;
};

export const validarTelefono = (telefono: string): string | null => {
  if (!telefono.trim()) return 'El teléfono de emergencia es obligatorio';
  const soloNumeros = telefono.replace(/[\s\-\+]/g, '');
  if (soloNumeros.length < 9) return 'El teléfono no es válido';
  return null;
};

export const validarLoginSanitario = (datos: {
  email: string;
  contrasena: string;
}): string | null => {
  return (
    validarEmail(datos.email) ||
    validarContrasena(datos.contrasena)
  );
};

export const validarLoginCiudadano = (datos: {
  email: string;
  contrasena: string;
}): string | null => {
  return (
    validarEmail(datos.email) ||
    validarContrasena(datos.contrasena)
  );
};

export const validarRegistroSanitario = (datos: {
  nombre: string;
  email: string;
  colegiado: string;
  especialidad: string;
  contrasena: string;
}): string | null => {
  return (
    validarNombre(datos.nombre) ||
    validarEmail(datos.email) ||
    validarColegiado(datos.colegiado) ||
    validarEspecialidad(datos.especialidad) ||
    validarContrasena(datos.contrasena)
  );
};

export const validarRegistroCiudadano = (datos: {
  nombre: string;
  email: string;
  contrasena: string;
  grupoSanguineo: string;
  contactoEmergencia: string;
}): string | null => {
  return (
    validarNombre(datos.nombre) ||
    validarEmail(datos.email) ||
    validarContrasena(datos.contrasena) ||
    validarGrupoSanguineo(datos.grupoSanguineo) ||
    validarTelefono(datos.contactoEmergencia)
  );
};