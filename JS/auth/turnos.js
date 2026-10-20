// JS/auth/turnos.js
// Turnos de los empleados (hora de Perú):
//   Turno día   → 06:00 a 17:59
//   Turno noche → 18:00 a 05:59 (cruza la medianoche)
// Un usuario sin turno (administrador, cajero, cliente) no tiene restricción horaria.
import { horaActualLima, formatearHoraLima } from '../utils/hora.js';

export const TURNOS = {
  dia:   { etiqueta: 'Turno día',   inicio: 6,  fin: 18, horario: '6:00 a. m. a 6:00 p. m.' },
  noche: { etiqueta: 'Turno noche', inicio: 18, fin: 6,  horario: '6:00 p. m. a 6:00 a. m.' }
};

// ¿La hora de Lima cae dentro del turno? (maneja el turno que cruza la medianoche)
function horaDentroDelTurno(turno, hora) {
  const { inicio, fin } = turno;
  return inicio < fin ? hora >= inicio && hora < fin : hora >= inicio || hora < fin;
}

// Turno que corresponde a este momento ('dia' o 'noche')
export function turnoVigente(ahora = new Date()) {
  const { hora } = horaActualLima(ahora);
  return horaDentroDelTurno(TURNOS.dia, hora) ? 'dia' : 'noche';
}

// ¿Puede trabajar ahora un usuario con este turno?
export function puedeTrabajar(turno, ahora = new Date()) {
  if (!turno || !TURNOS[turno]) return true;
  return horaDentroDelTurno(TURNOS[turno], horaActualLima(ahora).hora);
}

export function mensajeFueraDeTurno(turno, ahora = new Date()) {
  const t = TURNOS[turno];
  const hora = formatearHoraLima(ahora);               // "05:37 p. m."
  return `Fuera de tu horario: tu ${t.etiqueta.toLowerCase()} es de ${t.horario} (hora de Perú). ` +
         `Ahora son las ${hora}${hora.endsWith('.') ? '' : '.'}`;
}
