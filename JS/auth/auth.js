// JS/auth/auth.js
import { sql } from '../config/neon-config.js';
import { puedeTrabajar, mensajeFueraDeTurno } from './turnos.js';

export async function registrarUsuario(nombre, correo, contrasena) {
  await sql`INSERT INTO usuarios (nombre, correo, contrasena) VALUES (${nombre}, ${correo}, ${contrasena})`;
}

// Devuelve el usuario si las credenciales son correctas, o null si no lo son.
// Si es un empleado fuera de su turno lanza un Error con codigo = 'FUERA_DE_TURNO'
// (y NO se crea la sesión).
export async function iniciarSesion(correo, contrasena) {
  const filas = await sql`
    SELECT id, nombre, rol, turno FROM usuarios
    WHERE correo = ${correo} AND contrasena = ${contrasena};
  `;
  if (filas.length === 0) return null;
  const usuario = filas[0];

  if (usuario.rol === 'empleado' && !puedeTrabajar(usuario.turno)) {
    const error = new Error(mensajeFueraDeTurno(usuario.turno));
    error.codigo = 'FUERA_DE_TURNO';
    throw error;
  }

  sessionStorage.setItem('usuario', JSON.stringify(usuario));
  return usuario;
}

export function cerrarSesion() {
  sessionStorage.removeItem('usuario');
  window.location.href = 'login.html';
}

let vigilandoTurno = false;

// Si el turno del empleado termina mientras trabaja, se cierra su sesión
function vigilarTurno(usuario) {
  if (vigilandoTurno) return;
  vigilandoTurno = true;
  setInterval(() => {
    if (!puedeTrabajar(usuario.turno)) {
      alert('Tu turno ha terminado. Se cerrará tu sesión.');
      cerrarSesion();
    }
  }, 30000);
}

// Devuelve el usuario en sesión o redirige a login.html.
// Los empleados solo pueden entrar dentro de su turno (día / noche).
export function exigirSesion() {
  const usuarioStr = sessionStorage.getItem('usuario');
  if (!usuarioStr) {
    window.location.href = 'login.html';
    return null;
  }
  const usuario = JSON.parse(usuarioStr);

  if (usuario.rol === 'empleado') {
    if (!puedeTrabajar(usuario.turno)) {
      alert(mensajeFueraDeTurno(usuario.turno));
      sessionStorage.removeItem('usuario');
      window.location.href = 'login.html';
      return null;
    }
    vigilarTurno(usuario);
  }
  return usuario;
}

export function exigirRol(...rolesPermitidos) {
  const usuario = exigirSesion();
  if (!usuario) return null;
  if (!rolesPermitidos.includes(usuario.rol)) {
    alert('Tu perfil no tiene acceso a esta página.');
    window.location.href = '../index.html';
    return null;
  }
  return usuario;
}

export function rutaInicioSegunRol(rol) {
  const rutas = {
    cliente: 'formulario.html',
    administrador: 'panel.html',
    empleado: 'panel.html',
    cajero: 'caja.html'
  };
  return rutas[rol] ?? '../index.html';
}
