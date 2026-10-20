// JS/actualizar/actualizar.js
import { sql } from '../config/neon-config.js';
import { exigirRol, cerrarSesion } from '../auth/auth.js';
import { calcularMontoServicio, formatearSoles } from '../registro/tarifario.js';
import { llenarCiudades, seleccionarCiudad } from '../registro/ciudades.js';
import { normalizarEstado } from '../seguimiento/seguimiento.js';

const usuario = exigirRol('cliente', 'administrador', 'empleado');
if (!usuario) throw new Error('Acceso denegado');

const esCliente = usuario.rol === 'cliente';
const paginaInicio = esCliente ? 'consulta.html' : 'panel.html';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const idRegistro = Number(params.get('id'));
  const form = document.getElementById('form-actualizar');
  const $ = (id) => document.getElementById(id);

  $('enlace-volver').href = paginaInicio;
  $('btn-cerrar-sesion')?.addEventListener('click', (e) => {
    e.preventDefault();
    cerrarSesion();
  });

  if (!idRegistro) {
    window.location.href = paginaInicio;
    return;
  }

  llenarCiudades($('edit-origen'));
  llenarCiudades($('edit-destino'));

  const leerMedidas = () => ({
    peso_kg: $('edit-peso').value,
    largo_cm: $('edit-largo').value,
    ancho_cm: $('edit-ancho').value,
    alto_cm: $('edit-alto').value
  });
  const medidasValidas = (d) => Object.values(d).every((v) => Number(v) > 0);

  function mostrarMonto() {
    const datos = leerMedidas();
    $('edit-monto').textContent = medidasValidas(datos) ? formatearSoles(calcularMontoServicio(datos)) : '—';
  }
  form.addEventListener('input', mostrarMonto);

  try {
    // 1. Consulta según el rol
    const columnas = esCliente
      ? await sql`SELECT origen, destino, peso_kg, largo_cm, ancho_cm, alto_cm, estado, estado_pago, monto_calculado
                  FROM cotizaciones_envio WHERE id = ${idRegistro} AND id_usuario = ${usuario.id}`
      : await sql`SELECT origen, destino, peso_kg, largo_cm, ancho_cm, alto_cm, estado, estado_pago, monto_calculado
                  FROM cotizaciones_envio WHERE id = ${idRegistro}`;

    if (columnas.length === 0) {
      alert('Registro no encontrado o sin permisos.');
      window.location.href = paginaInicio;
      return;
    }

    const reg = columnas[0];
    const estadoActual = normalizarEstado(reg.estado);
    const pagado = reg.estado_pago === 'pagado';

    // 2. Rellenar los campos
    seleccionarCiudad($('edit-origen'), reg.origen);
    seleccionarCiudad($('edit-destino'), reg.destino);
    $('edit-peso').value = Number(reg.peso_kg);
    $('edit-largo').value = Number(reg.largo_cm);
    $('edit-ancho').value = Number(reg.ancho_cm);
    $('edit-alto').value = Number(reg.alto_cm);
    $('edit-monto').textContent = formatearSoles(Number(reg.monto_calculado));
    $('edit-pago').textContent = pagado ? '(ya pagado)' : reg.estado_pago === 'exonerado' ? '(exonerado)' : '(pendiente de pago)';

    // 3. REGLA ESTRICTA PARA ADMIN/EMPLEADO: Solo puede Cancelar
    if (!esCliente) {
      $('div-estado').style.display = 'block';
      const selectEstado = $('edit-estado');
      selectEstado.replaceChildren();
      const agregar = (valor, texto) => {
        const o = document.createElement('option');
        o.value = valor;
        o.textContent = texto;
        selectEstado.append(o);
      };
      if (estadoActual === 'cancelado') {
        agregar('cancelado', 'Cancelado');
      } else {
        agregar(estadoActual, `${estadoActual.toUpperCase()} (Estado actual)`);
        agregar('cancelado', 'CANCELAR COTIZACIÓN');
      }
    }

    // 4. LÓGICA DE "SOLO LECTURA": solo se edita si está registrado y NO pagado
    const soloLectura = estadoActual !== 'registrado' || pagado;
    const btn = $('btn-guardar');
    if (soloLectura) {
      for (const id of ['edit-origen', 'edit-destino', 'edit-peso', 'edit-largo', 'edit-ancho', 'edit-alto']) {
        $(id).disabled = true;
      }
      if (esCliente) {
        btn.disabled = true;
        btn.textContent = pagado ? 'Solo lectura (ya pagado)' : 'Solo lectura (Trámite iniciado)';
        btn.style.background = '#94a3b8';
      } else if (estadoActual === 'cancelado') {
        btn.disabled = true;
        btn.textContent = 'Cotización Cancelada';
        btn.style.background = '#94a3b8';
      } else {
        btn.textContent = 'Actualizar a Cancelado';
        btn.style.background = '#b91c1c';
      }
    }

    // 5. GUARDAR EN BASE DE DATOS
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('edit-error').textContent = '';

      const origen = $('edit-origen').value;
      const destino = $('edit-destino').value;
      const datos = leerMedidas();

      try {
        if (!esCliente && soloLectura) {
          await sql`UPDATE cotizaciones_envio SET estado = ${$('edit-estado').value} WHERE id = ${idRegistro}`;
        } else {
          if (!form.checkValidity()) { form.reportValidity(); return; }
          if (origen === destino) {
            $('edit-error').textContent = 'El origen y el destino no pueden ser iguales.';
            return;
          }
          const monto = calcularMontoServicio(datos);          // el monto se recalcula al editar
          const estadoPago = monto === 0 ? 'exonerado' : 'pendiente';
          const estado = esCliente ? 'registrado' : $('edit-estado').value;
          const peso = Number(datos.peso_kg);

          const filas = await sql`
            UPDATE cotizaciones_envio
            SET origen = ${origen}, destino = ${destino}, peso = ${peso}, peso_kg = ${peso},
                largo_cm = ${Number(datos.largo_cm)}, ancho_cm = ${Number(datos.ancho_cm)}, alto_cm = ${Number(datos.alto_cm)},
                monto_calculado = ${monto}, estado_pago = ${estadoPago}, estado = ${estado}
            WHERE id = ${idRegistro}
              AND (${esCliente}::boolean = false OR id_usuario = ${usuario.id})
              AND estado = 'registrado' AND estado_pago <> 'pagado'
            RETURNING id;
          `;
          if (filas.length !== 1) {
            alert('No se pudo guardar: la cotización ya no se puede editar (pagada o en trámite).');
            window.location.href = paginaInicio;
            return;
          }
        }

        alert('Modificación guardada exitosamente.');
        window.location.href = paginaInicio;
      } catch (error) {
        console.error(error);
        alert('Ocurrió un error al intentar guardar.');
      }
    });
  } catch (error) {
    console.error(error);
    alert('No se pudo cargar la cotización.');
  }
});
