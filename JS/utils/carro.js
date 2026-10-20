// JS/utils/carro.js
// Dibujo SVG del carrito de reparto (ruedas giratorias con animación SMIL, sin CSS externo).
// Lo usan la pantalla de carga del login y el seguimiento animado de los pedidos.
const SVG_CARRO = `
<svg class="carro-svg" viewBox="0 0 150 76" width="150" height="76" role="img" aria-label="Carro de reparto" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="76" cy="68" rx="62" ry="5" fill="rgba(15,23,42,.22)"/>
  <!-- paquete sobre el techo -->
  <rect x="62" y="1" width="28" height="14" rx="2" fill="#c98b3c"/>
  <rect x="62" y="1" width="28" height="4" rx="1" fill="#e0a64f"/>
  <rect x="74" y="1" width="4" height="14" fill="#f5d9a8"/>
  <!-- carrocería -->
  <path d="M10 56 V43 Q10 36 18 34 L40 30 L52 16 Q54 14 58 14 H100 Q104 14 107 17 L122 33 L134 36 Q141 38 141 45 V56 Z" fill="#ffb800"/>
  <path d="M10 49 H141 V56 H10 Z" fill="#e0a200"/>
  <!-- ventanas -->
  <path d="M57 19 H76 V32 H46 Z" fill="#0d2c6c"/>
  <path d="M81 19 H100 Q102 19 104 21 L116 32 H81 Z" fill="#0d2c6c"/>
  <path d="M60 21 H70 L62 30 H54 Z" fill="rgba(255,255,255,.25)"/>
  <!-- luces -->
  <rect x="11" y="39" width="6" height="6" rx="1.5" fill="#ef4444"/>
  <rect x="134" y="39" width="6" height="6" rx="1.5" fill="#fff7cc"/>
  <!-- ruedas -->
  <g>
    <circle cx="38" cy="57" r="12" fill="#0f172a"/>
    <g>
      <circle cx="38" cy="57" r="6" fill="#cbd5e1"/>
      <path d="M38 51 V63 M32 57 H44" stroke="#64748b" stroke-width="2"/>
      <animateTransform attributeName="transform" type="rotate" from="0 38 57" to="360 38 57" dur="0.55s" repeatCount="indefinite"/>
    </g>
  </g>
  <g>
    <circle cx="112" cy="57" r="12" fill="#0f172a"/>
    <g>
      <circle cx="112" cy="57" r="6" fill="#cbd5e1"/>
      <path d="M112 51 V63 M106 57 H118" stroke="#64748b" stroke-width="2"/>
      <animateTransform attributeName="transform" type="rotate" from="0 112 57" to="360 112 57" dur="0.55s" repeatCount="indefinite"/>
    </g>
  </g>
</svg>`;

export function crearCarro() {
  const plantilla = document.createElement('template');
  plantilla.innerHTML = SVG_CARRO.trim();
  return plantilla.content.firstElementChild;
}

// Detiene / reanuda el giro de las ruedas (por ejemplo, cuando el pedido ya fue entregado)
export function moverRuedas(svg, girando) {
  if (!svg || typeof svg.pauseAnimations !== 'function') return;
  if (girando) svg.unpauseAnimations();
  else svg.pauseAnimations();
}
