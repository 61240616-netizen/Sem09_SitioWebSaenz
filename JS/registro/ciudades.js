// JS/registro/ciudades.js
// Lista única de ciudades para el cotizador, la edición y el panel.
// El valor que se guarda en la base va en minúsculas (como ya lo hacía tu proyecto).
export const CIUDADES = [
  ['tarapoto', 'Tarapoto'], ['moyobamba', 'Moyobamba'], ['yurimaguas', 'Yurimaguas'],
  ['lima', 'Lima'], ['chiclayo', 'Chiclayo'], ['trujillo', 'Trujillo'], ['piura', 'Piura'],
  ['arequipa', 'Arequipa'], ['cuzco', 'Cuzco'], ['iquitos', 'Iquitos'], ['pucallpa', 'Pucallpa'],
  ['huancayo', 'Huancayo'], ['ayacucho', 'Ayacucho'], ['cajamarca', 'Cajamarca'], ['ica', 'Ica'],
  ['puno', 'Puno'], ['tacna', 'Tacna'], ['tumbes', 'Tumbes'], ['moquegua', 'Moquegua']
];

export const normalizarCiudad = (valor) => String(valor ?? '').trim().toLowerCase();

export function llenarCiudades(select, textoInicial = '') {
  select.replaceChildren();
  if (textoInicial) {
    const vacia = document.createElement('option');
    vacia.value = '';
    vacia.textContent = textoInicial;
    select.append(vacia);
  }
  for (const [valor, nombre] of CIUDADES) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = nombre;
    select.append(opcion);
  }
}

// Si el registro trae una ciudad que no está en la lista, la agrega para no perder el dato
export function seleccionarCiudad(select, valor) {
  const v = normalizarCiudad(valor);
  if (v && ![...select.options].some((o) => o.value === v)) {
    const extra = document.createElement('option');
    extra.value = v;
    extra.textContent = v.charAt(0).toUpperCase() + v.slice(1);
    select.append(extra);
  }
  select.value = v;
}
