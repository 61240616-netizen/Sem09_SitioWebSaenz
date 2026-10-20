// JS/consulta/consulta.js
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { formatearSoles } from '../registro/tarifario.js';
import {
  avanzarEstadosPorTiempo, crearSeguimiento, crearBadgeEstado, actualizarBadgeEstado, normalizarEstado
} from '../seguimiento/seguimiento.js';

const usuario = exigirRol('cliente');
if (!usuario) throw new Error('Acceso denegado');

const INTERVALO_REFRESCO_MS = 8000;

document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('tabla-registros');
  const filas = new Map();          // id -> { seguimiento, badge, tdAcciones, estado }

  document.getElementById('btn-cerrar-sesion')?.addEventListener('click', (e) => {
    e.preventDefault();
    cerrarSesion();
  });

  const consultar = () => sql`
    SELECT r.id, r.codigo_seguimiento, r.origen, r.destino, r.peso, r.estado, r.estado_pago,
           r.monto_calculado, EXTRACT(EPOCH FROM (NOW() - r.fecha_registro))::float AS segundos,
           p.codigo_operacion
    FROM cotizaciones_envio r
    LEFT JOIN pagos p ON p.id_registro = r.id AND p.estado = 'aprobado'
    WHERE r.id_usuario = ${usuario.id}
    ORDER BY r.fecha_registro DESC;
  `;

  const celda = (tr, texto = '') => {
    const td = document.createElement('td');
    td.textContent = texto;
    tr.append(td);
    return td;
  };

  function enlace(href, texto, clase) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = texto;
    a.className = `btn-fila ${clase}`;
    return a;
  }

  // Acciones según el estado operativo y el estado de pago
  function pintarAcciones(td, r) {
    td.replaceChildren();
    const estado = normalizarEstado(r.estado);
    const acciones = document.createElement('div');
    acciones.className = 'acciones-fila';

    if (estado === 'registrado' && r.estado_pago !== 'pagado') {
      acciones.append(enlace(`actualizar.html?id=${encodeURIComponent(r.id)}`, 'Editar cotización', 'btn-editar-fila'));
    }
    if (r.estado_pago === 'pendiente' && estado !== 'cancelado') {
      acciones.append(enlace(`pago.html?id=${encodeURIComponent(r.id)}`, 'Pagar', 'btn-pagar-fila'));
    } else if (r.estado_pago === 'pagado' && r.codigo_operacion) {
      acciones.append(enlace(`comprobante.html?op=${encodeURIComponent(r.codigo_operacion)}`, 'Ver comprobante / guía', 'btn-comprobante-fila'));
    }
    if (acciones.children.length === 0) {
      const texto = document.createElement('span');
      texto.className = 'solo-lectura';
      texto.textContent = r.estado_pago === 'exonerado' ? 'Exonerado' : 'Solo lectura';
      acciones.append(texto);
    }
    td.append(acciones);
  }

  function pintarPago(td, r) {
    td.replaceChildren();
    const badge = document.createElement('span');
    badge.className = `pago-badge pago-${r.estado_pago}`;
    badge.textContent = r.estado_pago === 'pagado' ? 'Pagado' : r.estado_pago === 'exonerado' ? 'Exonerado' : 'Pendiente';
    td.append(badge);
  }

  function dibujarFila(r) {
    const tr = document.createElement('tr');
    celda(tr).append(Object.assign(document.createElement('strong'), { textContent: r.codigo_seguimiento }));
    celda(tr, r.origen).style.textTransform = 'capitalize';
    celda(tr, r.destino).style.textTransform = 'capitalize';
    celda(tr, `${r.peso} kg`);
    celda(tr, formatearSoles(Number(r.monto_calculado)));
    const tdPago = celda(tr);
    pintarPago(tdPago, r);

    // Estado: etiqueta + seguimiento animado (el carro avanza entre etapas)
    const tdEstado = celda(tr);
    tdEstado.className = 'celda-estado';
    const badge = crearBadgeEstado(r.estado);
    const seguimiento = crearSeguimiento({ compacto: true });
    tdEstado.append(badge, seguimiento.elemento);
    seguimiento.actualizar(r.estado, r.segundos);

    const tdAcciones = celda(tr);
    pintarAcciones(tdAcciones, r);

    filas.set(r.id, { tr, seguimiento, badge, tdPago, tdAcciones, estado: r.estado, pago: r.estado_pago });
    return tr;
  }

  function actualizarFila(r) {
    const fila = filas.get(r.id);
    if (!fila) return;
    fila.seguimiento.actualizar(r.estado, r.segundos);
    actualizarBadgeEstado(fila.badge, r.estado);
    if (fila.estado !== r.estado || fila.pago !== r.estado_pago) {
      pintarPago(fila.tdPago, r);
      pintarAcciones(fila.tdAcciones, r);
      fila.estado = r.estado;
      fila.pago = r.estado_pago;
    }
  }

  async function refrescar() {
    try {
      await avanzarEstadosPorTiempo(usuario.id);
      const registros = await consultar();
      registros.forEach(actualizarFila);
    } catch (error) {
      console.error('No se pudo refrescar el seguimiento:', error);
    }
  }

  try {
    await avanzarEstadosPorTiempo(usuario.id);
    const registros = await consultar();     // RF-30.5: solo los registros propios

    if (registros.length === 0) {
      const tr = document.createElement('tr');
      const td = celda(tr, 'No tienes cotizaciones registradas aún.');
      td.colSpan = 7;
      td.style.textAlign = 'center';
      td.style.padding = '20px';
      tbody.replaceChildren(tr);
    } else {
      tbody.replaceChildren(...registros.map(dibujarFila));
      setInterval(() => { if (!document.hidden) refrescar(); }, INTERVALO_REFRESCO_MS);
    }
  } catch (error) {
    console.error('Error al cargar la tabla:', error);
    const tr = document.createElement('tr');
    const td = celda(tr, 'No se pudieron cargar tus cotizaciones. Revisa tu conexión.');
    td.colSpan = 7;
    td.style.textAlign = 'center';
    tbody.replaceChildren(tr);
  }
});
