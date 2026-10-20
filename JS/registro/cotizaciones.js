// JS/registro/cotizaciones.js
// INSERT de una cotización con sus medidas y su monto. Lo usan registro.js (cliente) y panel.js.
import { sql } from '../config/neon-config.js';
import { calcularMontoServicio } from './tarifario.js';

// El monto SIEMPRE se recalcula aquí: no se confía en lo que muestra la pantalla.
export async function crearCotizacion({ datos, nombreRemitente, idUsuario = null }) {
  const monto = calcularMontoServicio(datos);
  const estadoPago = monto === 0 ? 'exonerado' : 'pendiente';
  const codigo = 'COD-' + Date.now().toString().slice(-8);   // 12 caracteres (VARCHAR(12))
  const peso = Number(datos.peso_kg);

  const filas = await sql`
    INSERT INTO cotizaciones_envio
      (codigo_seguimiento, nombre_remitente, origen, destino, peso, peso_kg,
       largo_cm, ancho_cm, alto_cm, id_usuario, monto_calculado, estado_pago, estado)
    VALUES
      (${codigo}, ${nombreRemitente}, ${datos.origen}, ${datos.destino}, ${peso}, ${peso},
       ${Number(datos.largo_cm)}, ${Number(datos.ancho_cm)}, ${Number(datos.alto_cm)},
       ${idUsuario}, ${monto}, ${estadoPago}, 'registrado')
    RETURNING id;
  `;
  return { id: filas[0].id, codigo, monto, estadoPago };
}
