// JS/registro/registro.js — cotizador en vivo + registro con monto + seguimiento animado
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import {
  calcularMontoServicio, calcularPesoVolumetrico, calcularPesoFacturable, formatearSoles
} from './tarifario.js';
import { llenarCiudades } from './ciudades.js';
import { crearCotizacion } from './cotizaciones.js';
import {
  crearSeguimiento, consultarEstadoPedido, avanzarEstadosPorTiempo
} from '../seguimiento/seguimiento.js';

// Solo los clientes cotizan desde aquí (admin / empleado crean registros desde el panel)
const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');

const INTERVALO_SEGUIMIENTO_MS = 5000;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-cotizador');
  const resultadoDiv = document.getElementById('resultado-cotizacion');
  const timelineDiv = document.getElementById('timeline-cotizacion');
  const contenedorSeguimiento = document.getElementById('seguimiento-cotizacion');
  const salidaMonto = document.getElementById('monto-estimado');
  const errorDiv = document.getElementById('error-cotizador');
  const boton = document.getElementById('btn-cotizar');
  const selectOrigen = document.getElementById('origen');
  const selectDestino = document.getElementById('destino');

  llenarCiudades(selectOrigen, 'Seleccione origen');
  llenarCiudades(selectDestino, 'Seleccione destino');

  let temporizadorSeguimiento = null;

  const leerFormulario = () => Object.fromEntries(new FormData(form));

  const formatearKg = (kg) => `${(Math.round(kg * 100) / 100).toLocaleString('es-PE')} kg`;

  // ---------- Cotización en vivo ----------
  function medidasCompletas(d) {
    return [d.peso_kg, d.largo_cm, d.ancho_cm, d.alto_cm].every((v) => Number(v) > 0);
  }

  function actualizarCotizacion() {
    const datos = leerFormulario();
    if (!medidasCompletas(datos)) {
      salidaMonto.textContent = formatearSoles(0);
      for (const id of ['det-real', 'det-volumetrico', 'det-facturable']) {
        document.getElementById(id).textContent = '—';
      }
      return;
    }
    document.getElementById('det-real').textContent = formatearKg(Number(datos.peso_kg));
    document.getElementById('det-volumetrico').textContent = formatearKg(calcularPesoVolumetrico(datos));
    document.getElementById('det-facturable').textContent = formatearKg(calcularPesoFacturable(datos));
    salidaMonto.textContent = formatearSoles(calcularMontoServicio(datos));
  }

  form.addEventListener('input', actualizarCotizacion);    // en cada tecla
  form.addEventListener('change', actualizarCotizacion);   // selects
  actualizarCotizacion();

  // ---------- Seguimiento animado ----------
  function detenerSeguimiento() {
    if (temporizadorSeguimiento) {
      clearInterval(temporizadorSeguimiento);
      temporizadorSeguimiento = null;
    }
  }

  function mostrarSeguimiento(idRegistro) {
    detenerSeguimiento();
    contenedorSeguimiento.replaceChildren();
    const seguimiento = crearSeguimiento();
    contenedorSeguimiento.append(seguimiento.elemento);
    timelineDiv.style.display = 'block';
    seguimiento.actualizar('registrado', 0);               // arranca en "Recepción"

    async function refrescar() {
      try {
        await avanzarEstadosPorTiempo(usuario.id);        // el cronómetro de exposición
        const pedido = await consultarEstadoPedido(idRegistro);
        if (!pedido) return;
        seguimiento.actualizar(pedido.estado, pedido.segundos);
        if (pedido.estado === 'entregado' || pedido.estado === 'cancelado') detenerSeguimiento();
      } catch (error) {
        console.error('No se pudo actualizar el seguimiento:', error);
      }
    }
    temporizadorSeguimiento = setInterval(refrescar, INTERVALO_SEGUIMIENTO_MS);
  }

  function mostrarResultado({ codigo, id, monto }) {
    resultadoDiv.style.display = 'block';
    resultadoDiv.className = 'confirmacion-cotizacion confirmacion-pop';
    resultadoDiv.replaceChildren();

    const titulo = document.createElement('p');
    titulo.textContent = `¡Envío registrado! Código: ${codigo}`;
    const total = document.createElement('p');
    total.textContent = `Total a pagar: ${formatearSoles(monto)}`;

    const acciones = document.createElement('div');
    acciones.className = 'acciones-post';
    const pagar = document.createElement('a');
    pagar.href = `pago.html?id=${encodeURIComponent(id)}`;
    pagar.className = 'principal';
    pagar.textContent = 'Pagar ahora';
    const mis = document.createElement('a');
    mis.href = 'consulta.html';
    mis.textContent = 'Ver mis cotizaciones';
    acciones.append(pagar, mis);

    resultadoDiv.append(titulo, total, acciones);
  }

  // ---------- Guardar ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';

    const datos = leerFormulario();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (datos.origen === datos.destino) {
      errorDiv.textContent = 'El origen y el destino no pueden ser iguales.';
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Guardando en la base de datos...';

    try {
      const cotizacion = await crearCotizacion({
        datos,
        nombreRemitente: usuario.nombre,
        idUsuario: usuario.id
      });
      mostrarResultado(cotizacion);
      mostrarSeguimiento(cotizacion.id);
      form.reset();
      actualizarCotizacion();
      boton.textContent = 'Cotizar otro envío';
    } catch (error) {
      console.error('Error al guardar en Neon:', error);
      errorDiv.textContent = 'Ocurrió un error al registrar en la base de datos. Intenta nuevamente.';
      boton.textContent = 'Reintentar';
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById('btn-cerrar-sesion')?.addEventListener('click', (e) => {
    e.preventDefault();
    cerrarSesion();
  });
});
