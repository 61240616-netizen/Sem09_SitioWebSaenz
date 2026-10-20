// JS/auth/login.js
import { iniciarSesion, registrarUsuario, rutaInicioSegunRol } from './auth.js';
import { crearCarro } from '../utils/carro.js';

const TIEMPO_MINIMO_CARGA_MS = 1800;   // para que la pantalla de carga alcance a verse
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

document.addEventListener('DOMContentLoaded', () => {
  const tabLogin = document.getElementById('tab-login');
  const tabRegistro = document.getElementById('tab-registro');
  const formLogin = document.getElementById('form-login');
  const formRegistro = document.getElementById('form-registro');
  const mensajeAuth = document.getElementById('mensaje-auth');
  const pantallaCarga = document.getElementById('pantalla-carga');
  const cargaTexto = document.getElementById('carga-texto');

  // El carrito de la pantalla de carga
  document.getElementById('carga-auto')?.append(crearCarro());

  function mostrarMensaje(texto, tipo = 'error') {
    mensajeAuth.textContent = texto;
    mensajeAuth.classList.toggle('exito', tipo === 'exito');
  }

  function mostrarCarga(texto) {
    cargaTexto.textContent = texto;
    pantallaCarga.hidden = false;
    document.body.classList.add('cargando');
  }

  function ocultarCarga() {
    pantallaCarga.hidden = true;
    document.body.classList.remove('cargando');
  }

  // 1. PESTAÑAS (Iniciar sesión / Crear cuenta)
  if (tabLogin && tabRegistro) {
    tabLogin.addEventListener('click', (e) => {
      e.preventDefault();
      tabLogin.classList.add('activa');
      tabRegistro.classList.remove('activa');
      formLogin.style.display = 'block';
      formRegistro.style.display = 'none';
      mostrarMensaje('');
    });

    tabRegistro.addEventListener('click', (e) => {
      e.preventDefault();
      tabRegistro.classList.add('activa');
      tabLogin.classList.remove('activa');
      formRegistro.style.display = 'block';
      formLogin.style.display = 'none';
      mostrarMensaje('');
    });
  }

  // 2. CREAR CUENTA
  formRegistro?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('reg-nombre').value.trim();
    const correo = document.getElementById('reg-correo').value.trim();
    const contrasena = document.getElementById('reg-contrasena').value;

    try {
      await registrarUsuario(nombre, correo, contrasena);
      formRegistro.reset();
      tabLogin.click();                                   // pasa a la pestaña de iniciar sesión
      mostrarMensaje('Cuenta creada correctamente. Ahora puedes iniciar sesión.', 'exito');
    } catch (error) {
      console.error('Error al registrar:', error);
      mostrarMensaje('Error al registrar. Es posible que el correo ya esté registrado.');
    }
  });

  // 3. INICIAR SESIÓN: pantalla de carga (carro avanzando...) y redirección según el rol
  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('login-correo').value.trim();
    const contrasena = document.getElementById('login-contrasena').value;
    const boton = formLogin.querySelector('button[type="submit"]');

    mostrarMensaje('');
    boton.disabled = true;
    mostrarCarga('Iniciando sesión');

    try {
      // La consulta y el tiempo mínimo corren en paralelo: no se alarga la espera si Neon tarda
      const [usuario] = await Promise.all([
        iniciarSesion(correo, contrasena),
        esperar(TIEMPO_MINIMO_CARGA_MS)
      ]);

      if (usuario) {
        window.location.href = rutaInicioSegunRol(usuario.rol);
        return;
      }
      ocultarCarga();
      mostrarMensaje('Correo o contraseña incorrectos.');
    } catch (error) {
      ocultarCarga();
      if (error.codigo === 'FUERA_DE_TURNO') {
        mostrarMensaje(error.message);
      } else {
        console.error('Error al iniciar sesión:', error);
        mostrarMensaje('Error al conectar con la base de datos.');
      }
    }
    boton.disabled = false;
  });
});
