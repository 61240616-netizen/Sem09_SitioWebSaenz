// JS/seguimiento/seguimiento.js
// Seguimiento animado del pedido: línea de tiempo con un carro que avanza entre etapas.
// Lo usan formulario.html (al cotizar) y consulta.html (en cada fila).
import { sql } from '../config/neon-config.js';
import { crearCarro, moverRuedas } from '../utils/carro.js';

// Etapas del envío. `desdeSeg` = segundos desde el registro en que pasa a esa etapa
// (es el "cronómetro de exposición" que ya usaba tu panel: 2, 3 y 4 minutos).
export const ETAPAS = [
  { estado: 'registrado',  etiqueta: 'Recepción',   detalle: 'Recibimos tu solicitud de envío.',          desdeSeg: 0 },
  { estado: 'en tránsito', etiqueta: 'En tránsito', detalle: 'Tu paquete va en camino a su destino.',     desdeSeg: 120 },
  { estado: 'en local',    etiqueta: 'En local',    detalle: 'Tu paquete llegó a la agencia de destino.', desdeSeg: 180 },
  { estado: 'entregado',   etiqueta: 'Entregado',   detalle: '¡Tu paquete fue entregado!',                desdeSeg: 240 }
];

const EQUIVALENCIAS = { 'en proceso': 'en tránsito', 'finalizado': 'entregado' };
export const normalizarEstado = (estado) => EQUIVALENCIAS[estado] ?? estado;

export function indiceEtapa(estado) {
  const i = ETAPAS.findIndex((e) => e.estado === normalizarEstado(estado));
  return i === -1 ? 0 : i;
}

/* =========================================================
   Avance automático de estados (se usa en panel, consulta y cotizador)
   ========================================================= */
// Si pasas un id de usuario solo avanza sus pedidos; sin id, avanza todos.
export async function avanzarEstadosPorTiempo(idUsuario = null) {
  await sql`UPDATE cotizaciones_envio SET estado = 'en tránsito' WHERE estado = 'en proceso'`;
  await sql`UPDATE cotizaciones_envio SET estado = 'entregado' WHERE estado = 'finalizado'`;
  await sql`
    UPDATE cotizaciones_envio
    SET estado = CASE
      WHEN EXTRACT(EPOCH FROM (NOW() - fecha_registro)) >= 240 THEN 'entregado'
      WHEN EXTRACT(EPOCH FROM (NOW() - fecha_registro)) >= 180 THEN 'en local'
      WHEN EXTRACT(EPOCH FROM (NOW() - fecha_registro)) >= 120 THEN 'en tránsito'
      ELSE estado
    END
    WHERE estado NOT IN ('cancelado', 'entregado')
      AND (${idUsuario}::int IS NULL OR id_usuario = ${idUsuario}::int);
  `;
}

/* =========================================================
   Etiqueta de estado (badge) con colores
   ========================================================= */
const CLASE_BADGE = {
  'registrado': 'registrado', 'en tránsito': 'transito', 'en local': 'local',
  'entregado': 'entregado', 'cancelado': 'cancelado'
};

export function actualizarBadgeEstado(badge, estado) {
  const normal = normalizarEstado(estado);
  badge.className = `seg-badge seg-badge--${CLASE_BADGE[normal] ?? 'registrado'}`;
  badge.textContent = normal;
}

export function crearBadgeEstado(estado) {
  const badge = document.createElement('span');
  actualizarBadgeEstado(badge, estado);
  return badge;
}

/* =========================================================
   Componente visual
   ========================================================= */
const formatearCuenta = (segundos) => {
  const total = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function crear(clase, etiqueta = 'div') {
  const el = document.createElement(etiqueta);
  el.className = clase;
  return el;
}

// Devuelve { elemento, actualizar(estado, segundosDesdeRegistro) }
export function crearSeguimiento({ compacto = false } = {}) {
  const raiz = crear(`seg${compacto ? ' seg--compacto' : ''}`);
  raiz.style.setProperty('--avance', '-0.2');           // el carro entra desde la izquierda

  const pista = crear('seg-pista');
  pista.setAttribute('aria-hidden', 'true');
  const linea = crear('seg-linea');
  const progreso = crear('seg-progreso');
  const auto = crear('seg-auto');
  const carro = crearCarro();
  auto.append(carro);
  pista.append(linea, progreso, auto);

  const lista = crear('seg-pasos', 'ol');
  const pasos = ETAPAS.map((etapa) => {
    const li = crear('seg-paso', 'li');
    const punto = crear('seg-punto', 'span');
    const nombre = crear('seg-etiqueta', 'span');
    nombre.textContent = etapa.etiqueta;
    li.append(punto, nombre);
    lista.append(li);
    return li;
  });

  const texto = crear('seg-texto', 'p');
  texto.setAttribute('role', 'status');
  texto.setAttribute('aria-live', 'polite');

  raiz.append(pista, lista);
  if (!compacto) raiz.append(texto);

  let primeraVez = true;
  let reloj = null;
  let conectado = false;
  let etapaActual = 0;
  let segundosBase = null;
  let marcaTiempo = 0;

  function pintarTexto() {
    if (compacto) return;
    const etapa = ETAPAS[etapaActual];
    let mensaje = `${etapa.etiqueta}: ${etapa.detalle}`;
    if (etapaActual < ETAPAS.length - 1 && segundosBase !== null) {
      const transcurridos = segundosBase + (performance.now() - marcaTiempo) / 1000;
      const falta = ETAPAS[etapaActual + 1].desdeSeg - transcurridos;
      mensaje += falta > 0
        ? ` · Siguiente etapa en ${formatearCuenta(falta)}`
        : ' · Actualizando…';
    }
    texto.textContent = mensaje;
  }

  function detenerReloj() {
    if (reloj) { clearInterval(reloj); reloj = null; }
  }

  function iniciarReloj() {
    if (reloj || compacto) return;
    reloj = setInterval(() => {
      if (raiz.isConnected) conectado = true;
      else if (conectado) { detenerReloj(); return; }
      pintarTexto();
    }, 1000);
  }

  function actualizar(estado, segundosDesdeRegistro = null) {
    const normal = normalizarEstado(estado);
    const cancelado = normal === 'cancelado';
    const idx = indiceEtapa(normal);
    etapaActual = idx;
    if (segundosDesdeRegistro !== null && segundosDesdeRegistro !== undefined) {
      segundosBase = Number(segundosDesdeRegistro);
      marcaTiempo = performance.now();
    }

    raiz.dataset.estado = cancelado ? 'cancelado' : normal;
    raiz.dataset.etapa = String(idx);
    const llego = cancelado ? false : idx === ETAPAS.length - 1;
    raiz.classList.toggle('seg--final', llego);
    raiz.classList.toggle('seg--cancelado', cancelado);
    moverRuedas(carro, !llego && !cancelado);

    pasos.forEach((paso, i) => {
      paso.classList.toggle('hecho', !cancelado && i < idx);
      paso.classList.toggle('actual', !cancelado && i === idx);
      paso.removeAttribute('aria-current');
      if (!cancelado && i === idx) paso.setAttribute('aria-current', 'step');
    });

    const destino = cancelado ? 0 : idx / (ETAPAS.length - 1);
    if (primeraVez) {
      primeraVez = false;
      // Fuerza el estado inicial (fuera de pantalla) antes de animar hacia la etapa real
      void raiz.offsetWidth;
      requestAnimationFrame(() => requestAnimationFrame(() => raiz.style.setProperty('--avance', String(destino))));
    } else {
      raiz.style.setProperty('--avance', String(destino));
    }

    if (cancelado) {
      detenerReloj();
      if (!compacto) texto.textContent = 'Este envío fue cancelado.';
    } else {
      pintarTexto();
      if (llego) detenerReloj(); else iniciarReloj();
    }
  }

  return { elemento: raiz, actualizar };
}

// Consulta el estado actual (y cuántos segundos pasaron desde el registro, medido por Neon)
export async function consultarEstadoPedido(id) {
  const filas = await sql`
    SELECT estado, EXTRACT(EPOCH FROM (NOW() - fecha_registro))::float AS segundos
    FROM cotizaciones_envio
    WHERE id = ${id};
  `;
  return filas[0] ?? null;
}
