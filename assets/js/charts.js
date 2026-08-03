// Fábricas de Chart.js. Los gráficos se registran para poder destruirlos al
// cambiar de vista y así evitar fugas de canvas entre renders.

import { num } from './format.js';

const registry = new Map();

export const PALETTE = [
  '#22d3ee', '#fbbf24', '#a78bfa', '#34d399', '#f87171',
  '#60a5fa', '#f472b6', '#fb923c', '#4ade80', '#e879f9',
];

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function theme() {
  return {
    text: cssVar('--text-2') || '#94a3b8',
    muted: cssVar('--text-3') || '#64748b',
    grid: cssVar('--border') || 'rgba(255,255,255,.09)',
    surface: cssVar('--surface') || '#0e1524',
    accent: cssVar('--accent') || '#22d3ee',
  };
}

export function destroyCharts() {
  registry.forEach((chart) => chart.destroy());
  registry.clear();
}

function create(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;

  registry.get(canvasId)?.destroy();

  const t = theme();
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.color = t.text;

  const chart = new Chart(canvas, config);
  registry.set(canvasId, chart);
  return chart;
}

const tooltipStyle = (t) => ({
  backgroundColor: t.surface,
  borderColor: t.grid,
  borderWidth: 1,
  titleColor: cssVar('--text') || '#fff',
  bodyColor: t.text,
  padding: 10,
  cornerRadius: 8,
  displayColors: true,
  boxPadding: 4,
});

/** Barras horizontales de puntos por jugador. */
export function pointsBar(canvasId, players) {
  const t = theme();

  return create(canvasId, {
    type: 'bar',
    data: {
      labels: players.map((p) => p.label),
      datasets: [{
        data: players.map((p) => p.points),
        backgroundColor: players.map((p) => p.color),
        borderRadius: 5,
        borderSkipped: false,
        barThickness: 'flex',
        maxBarThickness: 20,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipStyle(t), callbacks: { label: (ctx) => ` ${num(ctx.raw)} puntos FIP` } },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, callback: (v) => num(v), maxTicksLimit: 6 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: t.text, font: { size: 11, weight: '600' } } },
      },
    },
  });
}

/** Evolución semanal (puntos o puesto) de varios jugadores. */
export function evolutionLine(canvasId, { weeks, series, mode = 'points' }) {
  const t = theme();
  const isRank = mode === 'rank';

  return create(canvasId, {
    type: 'line',
    data: {
      labels: weeks.map((w) => `S${w}`),
      datasets: series.map((s) => ({
        label: s.label,
        data: s.values,
        borderColor: s.color,
        backgroundColor: `${s.color}22`,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: s.color,
        tension: 0.32,
        spanGaps: true,
        fill: series.length === 1,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: {
            title: (items) => `Semana ${items[0].label.slice(1)}`,
            label: (ctx) => ` ${ctx.dataset.label}: ${isRank ? `#${ctx.raw}` : `${num(ctx.raw)} pts`}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: t.muted, maxTicksLimit: 14, font: { size: 10 } } },
        y: {
          reverse: isRank,
          grid: { color: t.grid },
          border: { display: false },
          ticks: { color: t.muted, callback: (v) => (isRank ? `#${v}` : num(v)), maxTicksLimit: 6 },
        },
      },
    },
  });
}

/** Reparto de puntos por país. */
export function countryDoughnut(canvasId, countries) {
  const t = theme();
  const top = countries.slice(0, 8);
  const rest = countries.slice(8);

  const labels = top.map((c) => c.name);
  const values = top.map((c) => c.points);
  const colors = top.map((c) => c.color);

  if (rest.length) {
    labels.push(`Otros (${rest.length})`);
    values.push(rest.reduce((sum, c) => sum + c.points, 0));
    colors.push(t.muted);
  }

  const total = values.reduce((sum, v) => sum + v, 0) || 1;

  return create(canvasId, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: t.surface, hoverOffset: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: { color: t.text, boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11.5 } } },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: { label: (ctx) => ` ${num(ctx.raw)} pts · ${((ctx.raw / total) * 100).toFixed(1)}%` },
        },
      },
    },
  });
}

/** Barras verticales genéricas (jugadores por país, parejas, etc.). */
export function verticalBar(canvasId, { labels, values, colors, unit = '', stepSize }) {
  const t = theme();

  return create(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 5, borderSkipped: false, maxBarThickness: 46 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltipStyle(t), callbacks: { label: (ctx) => ` ${num(ctx.raw)}${unit ? ` ${unit}` : ''}` } },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: t.muted, font: { size: 11 }, maxRotation: 45, minRotation: 0 } },
        y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, stepSize, callback: (v) => num(v) } },
      },
    },
  });
}

/** Radar del comparador, con todos los ejes normalizados a 0-100. */
export function compareRadar(canvasId, { axes, series }) {
  const t = theme();

  return create(canvasId, {
    type: 'radar',
    data: {
      labels: axes,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.values,
        borderColor: s.color,
        backgroundColor: `${s.color}2e`,
        borderWidth: 2,
        pointBackgroundColor: s.color,
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, padding: 14 } },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${Math.round(ctx.raw)} / 100` },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          grid: { color: t.grid },
          angleLines: { color: t.grid },
          pointLabels: { color: t.text, font: { size: 11.5 } },
          ticks: { display: false, stepSize: 25 },
        },
      },
    },
  });
}
