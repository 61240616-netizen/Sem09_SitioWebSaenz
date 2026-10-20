// JS/comprobante/comprobante.js
// Constancia de pago + GUÍA DE ENVÍO. El pago aprobado es lo que habilita imprimir la guía.
import { sql } from '../config/neon-config.js';
import { exigirSesion, cerrarSesion } from '../auth/auth.js';
import { formatearSoles, calcularPesoVolumetrico, calcularPesoFacturable } from '../registro/tarifario.js';
import { formatearFechaHoraLima } from '../utils/hora.js';

const usuario = exigirSesion();
if (!usuario) throw new Error('Sin sesión');

const NOMBRES_METODO = {
  tarjeta_debito: 'Tarjeta de débito', tarjeta_credito: 'Tarjeta de crédito',
  billetera: 'Billetera electrónica', efectivo: 'Efectivo', pos: 'Tarjeta en POS'
};

// A dónde vuelve cada perfil
const RUTA_VOLVER = {
  cliente: 'consulta.html', cajero: 'caja.html', administrador: 'caja.html', empleado: 'panel.html'
};
for (const id of ['enlace-volver', 'enlace-volver-nav']) {
  document.getElementById(id).href = RUTA_VOLVER[usuario.rol] ?? '../index.html';
}
document.getElementById('btn-cerrar-sesion').addEventListener('click', (e) => {
  e.preventDefault();
  cerrarSesion();
});

const contenedor = document.querySelector('#comprobante');
const botonImprimir = document.querySelector('#imprimir');
const op = new URLSearchParams(location.search).get('op');

function elemento(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function agregarDato(lista, etiqueta, valor, clase = '') {
  const dt = elemento('dt', '', etiqueta);
  const dd = elemento('dd', clase, valor ?? '—');
  lista.append(dt, dd);
}

const kg = (valor) => `${Math.round(Number(valor) * 100) / 100} kg`;
const cm = (valor) => `${Math.round(Number(valor) * 100) / 100}`;
const ciudad = (texto) => String(texto ?? '').replace(/^./, (c) => c.toUpperCase());

async function cargar() {
  const filas = await sql`
    SELECT p.codigo_operacion, p.canal, p.metodo, p.proveedor_billetera, p.marca_tarjeta, p.referencia,
           p.monto, p.monto_recibido, p.vuelto, p.fecha_pago, p.id_usuario,
           r.codigo_seguimiento, r.origen, r.destino, r.peso_kg, r.largo_cm, r.ancho_cm, r.alto_cm,
           r.nombre_remitente, u.nombre AS cliente, c.nombre AS cajero
    FROM pagos p
    JOIN cotizaciones_envio r ON r.id = p.id_registro
    LEFT JOIN usuarios u ON u.id = p.id_usuario
    LEFT JOIN usuarios c ON c.id = p.id_cajero
    WHERE p.codigo_operacion = ${op ?? ''} AND p.estado = 'aprobado';
  `;
  const pago = filas[0];

  // Un cliente solo puede ver sus propios comprobantes
  if (!pago || (usuario.rol === 'cliente' && pago.id_usuario !== usuario.id)) {
    contenedor.textContent = 'Comprobante no encontrado.';
    return;
  }

  const datosPaquete = {
    peso_kg: pago.peso_kg, largo_cm: pago.largo_cm, ancho_cm: pago.ancho_cm, alto_cm: pago.alto_cm
  };

  contenedor.replaceChildren();

  const encabezado = elemento('div', 'hoja-encabezado');
  const marca = elemento('div', 'hoja-marca', 'LogísticaExpress');
  marca.append(elemento('small', '', 'Guía de envío · Encomiendas y courier'));
  const codigo = elemento('div', 'hoja-codigo', 'N.° de guía');
  codigo.append(elemento('strong', '', pago.codigo_seguimiento));
  encabezado.append(marca, codigo);

  const dlEnvio = document.createElement('dl');
  agregarDato(dlEnvio, 'Remitente', pago.cliente ?? pago.nombre_remitente);
  agregarDato(dlEnvio, 'Origen', ciudad(pago.origen));
  agregarDato(dlEnvio, 'Destino', ciudad(pago.destino));
  agregarDato(dlEnvio, 'Peso real', kg(pago.peso_kg));
  agregarDato(dlEnvio, 'Medidas (L×A×H)', `${cm(pago.largo_cm)} × ${cm(pago.ancho_cm)} × ${cm(pago.alto_cm)} cm`);
  agregarDato(dlEnvio, 'Peso volumétrico', kg(calcularPesoVolumetrico(datosPaquete)));
  agregarDato(dlEnvio, 'Peso facturable', kg(calcularPesoFacturable(datosPaquete)));

  const dlPago = document.createElement('dl');
  agregarDato(dlPago, 'N.° de operación', pago.codigo_operacion);
  agregarDato(dlPago, 'Cliente', pago.cliente ?? 'Atención presencial');
  agregarDato(dlPago, 'Canal', pago.canal === 'pasarela' ? 'Pago en línea' : 'Ventanilla');
  agregarDato(dlPago, 'Medio', `${NOMBRES_METODO[pago.metodo]} ${pago.marca_tarjeta ?? pago.proveedor_billetera ?? ''} ${pago.referencia ?? ''}`.trim());
  agregarDato(dlPago, 'Importe', formatearSoles(Number(pago.monto)), 'importe');
  if (pago.metodo === 'efectivo') {
    agregarDato(dlPago, 'Recibido', formatearSoles(Number(pago.monto_recibido)));
    agregarDato(dlPago, 'Vuelto', formatearSoles(Number(pago.vuelto)));
  }
  if (pago.cajero) agregarDato(dlPago, 'Atendido por', pago.cajero);
  agregarDato(dlPago, 'Fecha y hora (Perú)', formatearFechaHoraLima(pago.fecha_pago));

  contenedor.append(
    encabezado,
    elemento('h2', '', 'Datos del envío'), dlEnvio,
    elemento('h2', '', 'Datos del pago'), dlPago,
    elemento('p', 'hoja-pie', 'Pago aprobado: esta guía autoriza la entrega del paquete en ventanilla.')
  );
  botonImprimir.disabled = false;
}

botonImprimir.addEventListener('click', () => window.print());

cargar().catch((error) => {
  console.error(error);
  contenedor.textContent = 'No se pudo cargar el comprobante. Revisa tu conexión.';
});
