// JS/utils/hora.js
// Todo lo que el usuario ve (fechas, horas, turnos) se muestra en hora de Perú,
// sin importar la zona horaria del servidor de Neon (UTC) ni la del computador.
export const ZONA_PERU = 'America/Lima';

const aFecha = (valor) => (valor instanceof Date ? valor : new Date(valor));

// "19/10/2026"
export function formatearFechaLima(valor) {
  return aFecha(valor).toLocaleDateString('es-PE', {
    timeZone: ZONA_PERU, day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

// "05:37 p. m."  (con segundos: "05:37:12 p. m.")
export function formatearHoraLima(valor, conSegundos = false) {
  return aFecha(valor).toLocaleTimeString('es-PE', {
    timeZone: ZONA_PERU, hour: '2-digit', minute: '2-digit',
    ...(conSegundos ? { second: '2-digit' } : {}), hour12: true
  });
}

// "19/10/2026, 05:37 p. m."
export const formatearFechaHoraLima = (valor) =>
  `${formatearFechaLima(valor)}, ${formatearHoraLima(valor)}`;

// Fecha de HOY en Lima con formato AAAA-MM-DD (lo que espera <input type="date">)
export const hoyEnLima = (ahora = new Date()) =>
  ahora.toLocaleDateString('en-CA', { timeZone: ZONA_PERU });

// { hora: 0-23, minuto: 0-59 } según el reloj de Lima
export function horaActualLima(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_PERU, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(ahora);
  const valorDe = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  return { hora: valorDe('hour') % 24, minuto: valorDe('minute') };
}
