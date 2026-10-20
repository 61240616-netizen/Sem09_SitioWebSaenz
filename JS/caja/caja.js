// JS/caja/caja.js
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { formatearSoles, redondear, calcularMontoServicio } from '../registro/tarifario.js';
import { generarCodigoOperacion } from '../pago/validaciones.js';
import { formatearHoraLima, hoyEnLima } from '../utils/hora.js';

const usuario = exigirRol('cajero', 'administrador');
if (!usuario) throw new Error('Acceso denegado');

/* =========================================================
   A. DATOS — consultas a Neon
   ========================================================= */

async function buscarPendientes(criterio = '') {
  const patron = `%${criterio.trim()}%`;
  return await sql`
    SELECT r.id, r.id_usuario, r.codigo_seguimiento, r.monto_calculado, r.fecha_registro,
           r.origen, r.destino, r.peso_kg, r.largo_cm, r.ancho_cm, r.alto_cm,
           COALESCE(u.nombre, r.nombre_remitente) AS cliente, u.dni
    FROM cotizaciones_envio r
    LEFT JOIN usuarios u ON u.id = r.id_usuario       -- LEFT: incluye registros creados en el panel
    WHERE r.estado_pago = 'pendiente' AND r.estado <> 'cancelado'
      AND (r.codigo_seguimiento ILIKE ${patron} OR u.dni ILIKE ${patron}
           OR u.nombre ILIKE ${patron} OR r.nombre_remitente ILIKE ${patron})
    ORDER BY r.fecha_registro ASC
    LIMIT 50;
  `;
}

const METODOS_CAJA = {
  efectivo:  { metodo: 'efectivo',  proveedor: null },
  pos:       { metodo: 'pos',       proveedor: null },
  andipay:   { metodo: 'billetera', proveedor: 'andipay' },
  pagomovil: { metodo: 'billetera', proveedor: 'pagomovil' }
};

// El cajero valida el peso en balanza: si cambió, se actualiza el peso y se recalcula el monto,
// y el cobro se confirma todo-o-nada en una sola transacción.
async function cobrarPresencial({ registro, pesoVerificado, opcion, montoRecibido, referencia }) {
  const { metodo, proveedor } = METODOS_CAJA[opcion];
  const datosPaquete = { ...registro, peso_kg: pesoVerificado };
  const monto = calcularMontoServicio(datosPaquete);
  let vuelto = null;

  if (metodo === 'efectivo') {
    if (!(montoRecibido >= monto)) throw new Error('El monto recibido es menor que el total.');
    vuelto = redondear(montoRecibido - monto);
    referencia = 'Efectivo';
  } else {
    montoRecibido = null;
    referencia = (metodo === 'pos' ? 'Voucher ' : 'Op. ') + referencia;
  }

  const codigo = generarCodigoOperacion('CJ');
  await sql.transaction([
    sql`UPDATE cotizaciones_envio
        SET peso = ${pesoVerificado}, peso_kg = ${pesoVerificado}, monto_calculado = ${monto}
        WHERE id = ${registro.id} AND estado_pago = 'pendiente';`,
    sql`INSERT INTO pagos (codigo_operacion, id_registro, id_usuario, canal, metodo, proveedor_billetera,
                           referencia, monto, monto_recibido, vuelto, estado, id_cajero)
        VALUES (${codigo}, ${registro.id}, ${registro.id_usuario}, 'caja', ${metodo}, ${proveedor},
                ${referencia}, ${monto}, ${montoRecibido}, ${vuelto}, 'aprobado', ${usuario.id});`,
    sql`UPDATE cotizaciones_envio
        SET estado_pago = 'pagado', canal_pago = 'caja', fecha_pago = NOW()
        WHERE id = ${registro.id} AND estado_pago = 'pendiente';`
  ]);
  return { codigo, vuelto, monto };
}

// Pagos de la pasarela de una fecha, en hora de Lima (aprobados y rechazados)
async function listarPagosEnLinea(fecha, soloPorVerificar) {
  return await sql`
    SELECT p.id, p.codigo_operacion, p.metodo, p.proveedor_billetera, p.marca_tarjeta, p.referencia,
           p.monto, p.estado, p.motivo_rechazo, p.verificado, p.fecha_pago,
           r.codigo_seguimiento, u.nombre AS cliente, v.nombre AS verificador
    FROM pagos p
    JOIN cotizaciones_envio r ON r.id = p.id_registro
    LEFT JOIN usuarios u ON u.id = p.id_usuario
    LEFT JOIN usuarios v ON v.id = p.verificado_por
    WHERE p.canal = 'pasarela'
      AND (p.fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
      AND (${soloPorVerificar} = false OR (p.estado = 'aprobado' AND p.verificado = false))
    ORDER BY p.fecha_pago DESC;
  `;
}

async function verificarPago(idPago) {
  await sql`
    UPDATE pagos
    SET verificado = true, verificado_por = ${usuario.id}, fecha_verificacion = NOW()
    WHERE id = ${idPago} AND canal = 'pasarela' AND estado = 'aprobado';
  `;
}

async function resumenDelDia(fecha) {
  return await sql`
    SELECT canal, metodo, COUNT(*)::int AS operaciones, SUM(monto) AS total
    FROM pagos
    WHERE estado = 'aprobado'
      AND (fecha_pago AT TIME ZONE 'America/Lima')::date = ${fecha}::date
    GROUP BY canal, metodo
    ORDER BY canal, metodo;
  `;
}

/* =========================================================
   B. INTERFAZ
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const tablaPendientes = $('#tabla-pendientes tbody');
const tablaEnLinea = $('#tabla-en-linea tbody');
const tablaResumen = $('#tabla-resumen tbody');
const dialogo = $('#dialogo-cobro');
const formCobro = $('#form-cobro');
const selectMetodo = $('#metodo-caja');
const inputRecibido = $('#monto-recibido');
const inputReferencia = $('#referencia');
const inputPeso = $('#peso-verificado');
const inputFecha = $('#fecha-caja');
const chkPorVerificar = $('#solo-por-verificar');

const NOMBRES_METODO = {
  tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito',
  billetera: 'Billetera', efectivo: 'Efectivo', pos: 'POS'
};

$('#nombre-cajero').textContent = usuario.nombre;
$('#cerrar-sesion').addEventListener('click', (e) => {
  e.preventDefault();
  cerrarSesion();
});
if (usuario.rol === 'administrador') $('#nav-panel').hidden = false;

// Reloj de Perú
const reloj = $('#reloj-peru');
const pintarReloj = () => { reloj.textContent = formatearHoraLima(new Date(), true); };
pintarReloj();
setInterval(pintarReloj, 1000);

inputFecha.value = hoyEnLima();

let pendientesCache = [];
let registroEnCobro = null;
let montoEnCobro = 0;
let ultimoIdVisto = null;

function celda(fila, texto = '') {
  const td = document.createElement('td');
  td.textContent = texto ?? '—';       // textContent: nunca interpretar datos como HTML
  fila.append(td);
  return td;
}

function boton(texto, accion, id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.dataset.accion = accion;
  b.dataset.id = id;
  return b;
}

function filaVacia(tbody, columnas, texto) {
  const tr = document.createElement('tr');
  const td = celda(tr, texto);
  td.colSpan = columnas;
  tbody.append(tr);
}

function describirMedio(p) {
  if (p.metodo === 'billetera') return `Billetera ${p.proveedor_billetera} ${p.referencia}`;
  if (p.marca_tarjeta) return `${p.marca_tarjeta} ${p.referencia}`;
  return p.referencia ?? p.metodo;
}

const ciudad = (texto) => String(texto ?? '').replace(/^./, (c) => c.toUpperCase());
const numero = (valor) => String(Math.round(Number(valor) * 100) / 100);

function mostrarAvisoCobro(codigo, vuelto) {
  const aviso = $('#aviso-cobro');
  aviso.replaceChildren();
  aviso.append(document.createTextNode(
    `Cobro registrado. Operación ${codigo}.` + (vuelto !== null ? ` Vuelto: ${formatearSoles(vuelto)}.` : '')
  ));
  const enlace = document.createElement('a');
  enlace.href = `comprobante.html?op=${encodeURIComponent(codigo)}`;
  enlace.target = '_blank';
  enlace.rel = 'noopener';
  enlace.textContent = 'Imprimir guía de envío';
  aviso.append(enlace);
}

// ---- Cobro presencial ----
async function pintarPendientes(criterio = '') {
  pendientesCache = await buscarPendientes(criterio);
  tablaPendientes.replaceChildren();
  if (pendientesCache.length === 0) return filaVacia(tablaPendientes, 6, 'Sin solicitudes pendientes.');
  for (const r of pendientesCache) {
    const tr = document.createElement('tr');
    celda(tr, r.codigo_seguimiento);
    celda(tr, r.cliente ?? 'Atención presencial');
    celda(tr, r.dni);
    celda(tr, `${ciudad(r.origen)} → ${ciudad(r.destino)}`);
    celda(tr, formatearSoles(Number(r.monto_calculado)));
    celda(tr).append(boton('Cobrar', 'cobrar', r.id));
    tablaPendientes.append(tr);
  }
}

$('#form-buscar').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await pintarPendientes(new FormData(e.target).get('criterio'));
  } catch (error) {
    console.error(error);
    alert('No se pudo buscar. Revisa tu conexión.');
  }
});

function ajustarCamposMetodo() {
  const esEfectivo = selectMetodo.value === 'efectivo';
  $('#campo-recibido').hidden = !esEfectivo;
  $('#campo-referencia').hidden = esEfectivo;
  inputRecibido.required = esEfectivo;
  inputReferencia.required = !esEfectivo;
  actualizarVuelto();
}
selectMetodo.addEventListener('change', ajustarCamposMetodo);

function actualizarVuelto() {
  const vuelto = Number(inputRecibido.value) - montoEnCobro;
  $('#vuelto').textContent = vuelto >= 0 ? formatearSoles(redondear(vuelto)) : 'Monto insuficiente';
  if (!inputRecibido.value) $('#vuelto').textContent = formatearSoles(0);
}
inputRecibido.addEventListener('input', actualizarVuelto);

// Al validar el peso en balanza, la tarifa se recalcula en vivo
function recalcularPorPeso() {
  const peso = Number(inputPeso.value);
  const ayuda = $('#ayuda-peso');
  if (!(peso > 0)) return;
  montoEnCobro = calcularMontoServicio({ ...registroEnCobro, peso_kg: peso });
  $('#cobro-total').textContent = formatearSoles(montoEnCobro);
  const cambio = Math.abs(peso - Number(registroEnCobro.peso_kg)) > 0.004;
  ayuda.textContent = cambio
    ? `El peso difiere del declarado: la tarifa se recalculó a ${formatearSoles(montoEnCobro)}.`
    : 'Peso conforme con lo declarado.';
  ayuda.classList.toggle('cambio', cambio);
  actualizarVuelto();
}
inputPeso.addEventListener('input', recalcularPorPeso);

// Delegación de eventos: un solo listener para todos los botones "Cobrar"
tablaPendientes.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-accion="cobrar"]');
  if (!b) return;
  registroEnCobro = pendientesCache.find((r) => r.id === Number(b.dataset.id));
  if (!registroEnCobro) return;
  formCobro.reset();
  $('#cobro-codigo').textContent = registroEnCobro.codigo_seguimiento;
  $('#cobro-ruta').textContent = `${ciudad(registroEnCobro.origen)} → ${ciudad(registroEnCobro.destino)}`;
  $('#cobro-medidas').textContent =
    `${numero(registroEnCobro.largo_cm)} × ${numero(registroEnCobro.ancho_cm)} × ${numero(registroEnCobro.alto_cm)}`;
  $('#cobro-peso-declarado').textContent = `${numero(registroEnCobro.peso_kg)} kg`;
  inputPeso.value = numero(registroEnCobro.peso_kg);
  montoEnCobro = Number(registroEnCobro.monto_calculado);
  $('#cobro-total').textContent = formatearSoles(montoEnCobro);
  $('#ayuda-peso').textContent = 'Si el peso cambia, la tarifa se recalcula.';
  $('#ayuda-peso').classList.remove('cambio');
  ajustarCamposMetodo();
  dialogo.showModal();
});

$('#cancelar-cobro').addEventListener('click', () => dialogo.close());

formCobro.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(formCobro));
  if (datos.metodo !== 'efectivo' && !/^\d{6,12}$/.test(datos.referencia)) {
    alert('Ingresa el número de voucher u operación (6 a 12 dígitos).');
    return;
  }
  const pesoVerificado = Number(datos.peso_verificado);
  if (!(pesoVerificado > 0)) {
    alert('Ingresa el peso verificado en balanza.');
    return;
  }
  const total = formatearSoles(calcularMontoServicio({ ...registroEnCobro, peso_kg: pesoVerificado }));
  if (!confirm(`¿Confirmar el cobro de ${total} por la solicitud ${registroEnCobro.codigo_seguimiento}?`)) return;

  const botonConfirmar = formCobro.querySelector('button[type="submit"]');
  botonConfirmar.disabled = true;
  try {
    const { codigo, vuelto } = await cobrarPresencial({
      registro: registroEnCobro,
      pesoVerificado,
      opcion: datos.metodo,
      montoRecibido: Number(datos.monto_recibido),
      referencia: datos.referencia
    });
    dialogo.close();
    mostrarAvisoCobro(codigo, vuelto);
    await Promise.all([pintarPendientes($('#criterio').value), refrescar()]);
  } catch (error) {
    console.error(error);
    alert(error.code === '23505' ? 'Esta solicitud ya fue pagada.' : (error.message || 'No se pudo registrar el cobro.'));
  } finally {
    botonConfirmar.disabled = false;
  }
});

// ---- Pagos en línea (lo que el cliente pagó por la pasarela) ----
async function pintarPagosEnLinea() {
  const pagos = await listarPagosEnLinea(inputFecha.value, chkPorVerificar.checked);
  tablaEnLinea.replaceChildren();
  if (pagos.length === 0) filaVacia(tablaEnLinea, 8, 'Sin operaciones en línea para esta fecha.');

  for (const p of pagos) {
    const tr = document.createElement('tr');
    if (p.estado === 'rechazado') tr.className = 'fila-rechazada';
    celda(tr, formatearHoraLima(p.fecha_pago));
    celda(tr, p.codigo_operacion);
    celda(tr, p.codigo_seguimiento);
    celda(tr, p.cliente);
    celda(tr, describirMedio(p));
    celda(tr, formatearSoles(Number(p.monto)));
    celda(tr, p.estado === 'aprobado' ? 'Aprobado' : `Rechazado: ${p.motivo_rechazo}`);
    const tdAccion = celda(tr);
    if (p.estado === 'aprobado' && !p.verificado) tdAccion.append(boton('Verificar', 'verificar', p.id));
    else if (p.verificado) tdAccion.textContent = `Verificado por ${p.verificador}`;
    tablaEnLinea.append(tr);
  }

  // Aviso de pagos nuevos desde la última revisión
  const idsAprobados = pagos.filter((p) => p.estado === 'aprobado').map((p) => p.id);
  const maxId = idsAprobados.length ? Math.max(...idsAprobados) : 0;
  if (ultimoIdVisto !== null && maxId > ultimoIdVisto) {
    const nuevos = idsAprobados.filter((id) => id > ultimoIdVisto).length;
    $('#aviso-nuevos').textContent = `Ingresaron ${nuevos} pago(s) nuevo(s) por la pasarela.`;
  }
  ultimoIdVisto = Math.max(ultimoIdVisto ?? 0, maxId);
}

tablaEnLinea.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-accion="verificar"]');
  if (!b) return;
  if (!confirm('¿Confirmas que este pago figura en el estado de cuenta de la entidad?')) return;
  try {
    await verificarPago(Number(b.dataset.id));
    await pintarPagosEnLinea();
  } catch (error) {
    console.error(error);
    alert('No se pudo verificar el pago.');
  }
});

// ---- Resumen del día ----
async function pintarResumen() {
  const filas = await resumenDelDia(inputFecha.value);
  tablaResumen.replaceChildren();
  let total = 0;
  if (filas.length === 0) filaVacia(tablaResumen, 4, 'Sin cobros para esta fecha.');
  for (const f of filas) {
    const tr = document.createElement('tr');
    celda(tr, f.canal === 'pasarela' ? 'En línea' : 'Ventanilla');
    celda(tr, NOMBRES_METODO[f.metodo] ?? f.metodo);
    celda(tr, String(f.operaciones));
    celda(tr, formatearSoles(Number(f.total)));
    tablaResumen.append(tr);
    total += Number(f.total);
  }
  $('#total-dia').textContent = formatearSoles(redondear(total));
}

async function refrescar() {
  try {
    await Promise.all([pintarPagosEnLinea(), pintarResumen()]);
  } catch (error) {
    console.error(error);
  }
}

inputFecha.addEventListener('change', () => { ultimoIdVisto = null; $('#aviso-nuevos').textContent = ''; refrescar(); });
chkPorVerificar.addEventListener('change', refrescar);

// Revisa cada 15 segundos si entraron pagos por la pasarela (solo con la pestaña visible)
setInterval(() => { if (!document.hidden) refrescar(); }, 15000);

pintarPendientes().catch((error) => {
  console.error(error);
  filaVacia(tablaPendientes, 6, 'No se pudieron cargar las solicitudes.');
});
refrescar();
