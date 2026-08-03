// Formateo y fragmentos HTML reutilizables.
// Todo texto que venga de la API se pasa por `esc` antes de inyectarse.

const NUMBER = new Intl.NumberFormat('es-ES');
const DATE_TIME = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const DATE_LONG = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
}

export const num = (value) => NUMBER.format(Math.round(Number(value) || 0));

export function signed(value) {
  const n = Number(value) || 0;
  return n > 0 ? `+${num(n)}` : num(n);
}

export function dateTime(iso) {
  try {
    return DATE_TIME.format(new Date(iso));
  } catch {
    return '—';
  }
}

export function dateLong(iso) {
  try {
    return DATE_LONG.format(new Date(iso));
  } catch {
    return '—';
  }
}

/** "hace 3 h" / "hace 2 días" a partir de un ISO. */
export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';

  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

/** Fecha dd/mm/aaaa de la FIP → "2 ago 2026". */
export function fipDate(value) {
  const match = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return esc(value || '—');

  const [, day, month, year] = match;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(Number(year), Number(month) - 1, Number(day)));
}

export function deltaHtml(move, { compact = false } = {}) {
  const n = Number(move) || 0;
  if (n === 0) return '<span class="delta delta--flat" title="Sin cambios">–</span>';

  const dir = n > 0 ? 'up' : 'down';
  const arrow = n > 0 ? '▲' : '▼';
  const label = `${n > 0 ? 'Sube' : 'Baja'} ${Math.abs(n)} posiciones`;

  return `<span class="delta delta--${dir}" title="${label}">${arrow}${compact ? '' : ' '}${Math.abs(n)}</span>`;
}

export function flagHtml(player) {
  if (player.flag) {
    return `<img class="flag" src="${esc(player.flag)}" alt="" loading="lazy" width="20" height="14">`;
  }
  return `<span class="flag--text">${esc(player.country)}</span>`;
}

// Silueta neutra para los jugadores sin foto en la FIP. Contrasta lo bastante
// como para no confundirse con una imagen rota.
const PHOTO_FALLBACK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" fill="#2b3a52"/>' +
      '<circle cx="24" cy="19" r="8" fill="#7d90ad"/>' +
      '<path d="M8 46c2-9 8-13 16-13s14 4 16 13z" fill="#7d90ad"/>' +
      '</svg>',
  );

export function photoHtml(player, className, { big = false } = {}) {
  const src = (big && player.portrait) || player.photo || PHOTO_FALLBACK;
  return `<img class="${className}" src="${esc(src)}" alt="${esc(player.name)}" loading="lazy" onerror="this.src='${PHOTO_FALLBACK}'">`;
}

export function rankBadge(rank) {
  const modifier = rank <= 3 ? ` rank-badge--${rank}` : '';
  return `<span class="rank-badge${modifier}">${esc(rank)}</span>`;
}

/** Apellido oficial de la FIP; conserva compuestos como "Triay Pons". */
export const shortName = (player) => player?.lastName || player?.name?.split(' ').slice(-1)[0] || '';

export const TIER_COLORS = {
  Major: '#fbbf24',
  P1: '#22d3ee',
  P2: '#38bdf8',
  Gold: '#f59e0b',
  Silver: '#cbd5e1',
  Bronze: '#d97706',
  Finals: '#f87171',
};

export function tierStyle(tier) {
  const bg = TIER_COLORS[tier] || '#64748b';
  const dark = ['Silver', 'Major', 'Gold', 'P1', 'P2'].includes(tier);
  return `background:${bg};color:${dark ? '#14202e' : '#fff'}`;
}

/** Sparkline SVG a partir de una serie de puntos. */
export function sparkline(values, color = 'currentColor') {
  const series = (values || []).filter((v) => Number.isFinite(v));
  if (series.length < 2) return '<span class="flag--text">—</span>';

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const stepX = 100 / (series.length - 1);

  const points = series.map((value, i) => `${(i * stepX).toFixed(1)},${(22 - ((value - min) / span) * 20).toFixed(1)}`);
  const trend = series.at(-1) >= series[0] ? 'var(--up)' : 'var(--down)';

  return `<svg class="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label="Tendencia de puntos">
    <path d="M${points.join(' L')}" stroke="${color === 'auto' ? trend : color}"/>
  </svg>`;
}

/** Descarga cliente de un CSV a partir de filas ya normalizadas. */
export function downloadCsv(filename, headers, rows) {
  const encode = (cell) => {
    const text = String(cell ?? '');
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const csv = [headers, ...rows].map((row) => row.map(encode).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
