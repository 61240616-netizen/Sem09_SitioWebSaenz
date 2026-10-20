// JS/panel/panel.js
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import { llenarCiudades } from '../registro/ciudades.js';
import { crearCotizacion } from '../registro/cotizaciones.js';
import { TURNOS } from '../auth/turnos.js';
import { formatearFechaLima, formatearHoraLima } from '../utils/hora.js';
import { avanzarEstadosPorTiempo, crearBadgeEstado } from '../seguimiento/seguimiento.js';

const usuario = exigirRol('administrador', 'empleado');
if (!usuario) throw new Error('Acceso denegado');

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('tabla-panel');
  const inputBusqueda = document.getElementById('input-busqueda');
  const btnBuscar = document.getElementById('btn-buscar');
  const btnLimpiar = document.getElementById('btn-limpiar');
  const dialogoNuevo = document.getElementById('dialogo-nuevo');
  const formNuevo = document.getElementById('form-nuevo');
  const errorNuevo = document.getElementById('error-nuevo');
  const avisoPanel = document.getElementById('aviso-panel');

  // ---- Encabezado: rol, turno y reloj de Perú ----
  const turno = TURNOS[usuario.turno];
  document.getElementById('etiqueta-rol').textContent =
    usuario.rol.toUpperCase() + (turno ? ` · ${turno.etiqueta.toUpperCase()}` : '');
  const infoTurno = document.getElementById('info-turno');
  if (turno) infoTurno.textContent = `Horario: ${turno.horario} (hora de Perú)`;
  const reloj = document.getElementById('reloj-peru');
  const pintarReloj = () => {
    const ahora = new Date();
    reloj.textContent = `${formatearFechaLima(ahora)} ${formatearHoraLima(ahora, true)}`;
  };
  pintarReloj();
  setInterval(pintarReloj, 1000);

  if (usuario.rol === 'administrador') document.getElementById('nav-caja').hidden = false;

  llenarCiudades(document.getElementById('nuevo-origen'), 'Seleccione origen');
  llenarCiudades(document.getElementById('nuevo-destino'), 'Seleccione destino');

  // ---- Tabla ----
  const celda = (fila, texto) => {
    const td = document.createElement('td');
    td.textContent = texto ?? '—';        // textContent: los datos nunca se interpretan como HTML
    fila.append(td);
    return td;
  };

  function botonAccion(texto, clase, accion, id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.className = `btn-accion ${clase}`;
    b.dataset.accion = accion;
    b.dataset.id = id;
    return b;
  }

  const etiquetaPago = (r) => {
    if (r.estado_pago === 'pagado') return `Pagado (${r.canal_pago === 'caja' ? 'caja' : 'en línea'})`;
    if (r.estado_pago === 'exonerado') return 'Exonerado';
    return 'Pendiente';
  };

  function dibujarFila(r) {
    const tr = document.createElement('tr');

    const tdCodigo = celda(tr, r.codigo_seguimiento);
    tdCodigo.style.fontWeight = '700';
    celda(tr, r.cliente_base || r.nombre_remitente);
    celda(tr, r.origen).style.textTransform = 'capitalize';
    celda(tr, r.destino).style.textTransform = 'capitalize';
    celda(tr, `${r.peso} kg`);
    celda(tr, formatearSoles(Number(r.monto_calculado)));

    const tdPago = celda(tr, '');
    const badgePago = document.createElement('span');
    badgePago.className = `pago-badge pago-${r.estado_pago}`;
    badgePago.textContent = etiquetaPago(r);
    tdPago.append(badgePago);

    // Hora de Perú (la base guarda el instante en UTC; aquí se muestra en America/Lima)
    const tdFecha = celda(tr, '');
    const dia = document.createElement('div');
    dia.className = 'fecha-dia';
    dia.textContent = formatearFechaLima(r.fecha_registro);
    const hora = document.createElement('div');
    hora.className = 'fecha-hora';
    hora.textContent = formatearHoraLima(r.fecha_registro);
    tdFecha.append(dia, hora);

    celda(tr, '').append(crearBadgeEstado(r.estado));

    const acciones = document.createElement('div');
    acciones.className = 'acciones-col';
    const editar = document.createElement('a');
    editar.href = `actualizar.html?id=${encodeURIComponent(r.id)}`;
    editar.className = 'btn-accion btn-editar';
    editar.textContent = 'Editar';
    acciones.append(editar);
    if (r.estado !== 'cancelado') acciones.append(botonAccion('Cancelar', 'btn-cancelar', 'cancelar', r.id));
    acciones.append(botonAccion('Eliminar', 'btn-eliminar', 'eliminar', r.id));
    celda(tr, '').append(acciones);

    return tr;
  }

  function filaMensaje(texto) {
    const tr = document.createElement('tr');
    const td = celda(tr, texto);
    td.colSpan = 10;
    td.style.textAlign = 'center';
    td.style.padding = '20px';
    tbody.replaceChildren(tr);
  }

  const cargarRegistros = async (termino = '') => {
    try {
      // Cronómetro automático de avance de estados (simula el progreso real del envío)
      await avanzarEstadosPorTiempo();

      const patron = `%${termino}%`;
      const registros = await sql`
        SELECT c.id, c.codigo_seguimiento, c.nombre_remitente, c.origen, c.destino, c.peso,
               c.fecha_registro, c.estado, c.monto_calculado, c.estado_pago, c.canal_pago,
               u.nombre AS cliente_base
        FROM cotizaciones_envio c
        LEFT JOIN usuarios u ON c.id_usuario = u.id
        WHERE ${termino} = ''
           OR c.codigo_seguimiento ILIKE ${patron}
           OR c.nombre_remitente ILIKE ${patron}
           OR u.nombre ILIKE ${patron}
        ORDER BY c.fecha_registro DESC;
      `;

      if (registros.length === 0) return filaMensaje('No se encontraron registros.');
      tbody.replaceChildren(...registros.map(dibujarFila));
    } catch (error) {
      console.error('Error al cargar panel:', error);
      filaMensaje('No se pudieron cargar los registros. Revisa tu conexión.');
    }
  };

  const mostrarAviso = (texto) => { avisoPanel.textContent = texto; };

  // ---- Buscar ----
  btnBuscar.addEventListener('click', () => {
    const termino = inputBusqueda.value.trim();
    if (termino) {
      cargarRegistros(termino);
      btnLimpiar.style.display = 'inline-block';
    }
  });
  inputBusqueda.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnBuscar.click();
  });
  btnLimpiar.addEventListener('click', () => {
    inputBusqueda.value = '';
    cargarRegistros();
    btnLimpiar.style.display = 'none';
  });

  // ---- Cancelar / Eliminar (delegación de eventos) ----
  async function cancelarRegistro(id) {
    if (!confirm('¿Estás seguro de marcar esta cotización como CANCELADA?')) return;
    try {
      await sql`UPDATE cotizaciones_envio SET estado = 'cancelado' WHERE id = ${id}`;
      await cargarRegistros(inputBusqueda.value.trim());
    } catch (error) {
      console.error(error);
      alert('Error al cancelar el registro.');
    }
  }

  async function eliminarRegistro(id) {
    if (!confirm('¿Eliminar definitivamente este registro de la base de datos?')) return;
    try {
      await sql`DELETE FROM cotizaciones_envio WHERE id = ${id}`;
      await cargarRegistros(inputBusqueda.value.trim());
    } catch (error) {
      // 23503 = violación de llave foránea: el registro tiene pagos (aprobados o rechazados)
      if (error.code === '23503') {
        alert('No se puede eliminar: tiene historial de pagos. Cambie su estado a "cancelado".');
      } else {
        console.error(error);
        alert('Error al eliminar.');
      }
    }
  }

  tbody.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.accion === 'cancelar') cancelarRegistro(id);
    if (b.dataset.accion === 'eliminar') eliminarRegistro(id);
  });

  // ---- Crear un registro desde el panel (cliente presencial: paga luego en caja) ----
  document.getElementById('btn-nuevo').addEventListener('click', () => {
    formNuevo.reset();
    errorNuevo.textContent = '';
    dialogoNuevo.showModal();
  });
  document.getElementById('cancelar-nuevo').addEventListener('click', () => dialogoNuevo.close());

  formNuevo.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorNuevo.textContent = '';
    const datos = Object.fromEntries(new FormData(formNuevo));
    if (!formNuevo.checkValidity()) { formNuevo.reportValidity(); return; }
    if (datos.origen === datos.destino) {
      errorNuevo.textContent = 'El origen y el destino no pueden ser iguales.';
      return;
    }
    const boton = formNuevo.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const { codigo, monto } = await crearCotizacion({
        datos, nombreRemitente: datos.nombre_remitente.trim(), idUsuario: null
      });
      dialogoNuevo.close();
      mostrarAviso(`Registro ${codigo} creado por ${formatearSoles(monto)}. El cliente paga en caja con ese código.`);
      await cargarRegistros(inputBusqueda.value.trim());
    } catch (error) {
      console.error(error);
      errorNuevo.textContent = 'No se pudo crear el registro. Intenta nuevamente.';
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById('btn-cerrar-sesion')?.addEventListener('click', (e) => {
    e.preventDefault();
    cerrarSesion();
  });

  cargarRegistros();
});
