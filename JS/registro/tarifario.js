// JS/registro/tarifario.js
// Regla de negocio del Caso 30 (ExpressEnvíos Perú) — funciones PURAS: no tocan el DOM ni la base.
// Peso facturable = el mayor entre el peso real (kg) y (largo × ancho × alto en cm) / 5000
// Tarifa = S/ 12.00 base + S/ 4.00 por kg facturable
//
// Pruebas en consola:
//   calcularMontoServicio({ peso_kg: 2, largo_cm: 40, ancho_cm: 30, alto_cm: 30 })  → 40.8
//   calcularMontoServicio({ peso_kg: 5, largo_cm: 20, ancho_cm: 20, alto_cm: 20 })  → 32

export const TARIFA_BASE = 12.00;
export const TARIFA_POR_KG = 4.00;
export const DIVISOR_VOLUMETRICO = 5000;

export function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

export function formatearSoles(monto) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(monto);
}

// Utilidad: un checkbox marcado llega en FormData como 'on'; si no está marcado, NO llega
export const marcado = (valor) => valor === 'on';

export function calcularPesoVolumetrico(d) {
  return (Number(d.largo_cm) * Number(d.ancho_cm) * Number(d.alto_cm)) / DIVISOR_VOLUMETRICO || 0;
}

export function calcularPesoFacturable(d) {
  return Math.max(Number(d.peso_kg) || 0, calcularPesoVolumetrico(d));
}

export function calcularMontoServicio(d) {
  return redondear(TARIFA_BASE + TARIFA_POR_KG * calcularPesoFacturable(d));
}
