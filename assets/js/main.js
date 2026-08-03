// Arranque, enrutado por pestañas y conexión de la interfaz con el store.

import { destroyCharts } from './charts.js';
import { esc, relativeTime } from './format.js';
import {
  data, ensureGender, ensureShared, loadAll, startAutoRefresh, state,
} from './store.js';

import * as compare from './views/compare.js';
import * as countries from './views/countries.js';
import * as overview from './views/overview.js';
import * as pairs from './views/pairs.js';
import * as player from './views/player.js';
import * as ranking from './views/ranking.js';
import * as tournaments from './views/tournaments.js';
import * as trends from './views/trends.js';

const TABS = [
  { id: 'overview', label: 'Resumen', view: overview },
  { id: 'ranking', label: 'Ranking', view: ranking },
  { id: 'trends', label: 'Evolución', view: trends },
  { id: 'pairs', label: 'Parejas', view: pairs },
  { id: 'countries', label: 'Países', view: countries },
  { id: 'circuit', label: 'Circuito', view: tournaments },
  { id: 'compare', label: 'Comparador', view: compare },
];

const el = {
  view: document.getElementById('view'),
  tabs: document.getElementById('tabs'),
  freshness: document.getElementById('freshness'),
  toast: document.getElementById('toast'),
  search: document.getElementById('filterSearch'),
  country: document.getElementById('filterCountry'),
  depth: document.getElementById('filterDepth'),
  sidebarCount: document.getElementById('sidebarCount'),
  themeToggle: document.getElementById('themeToggle'),
};

// ── Tema ──────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('fip-theme', theme);
}

function initTheme() {
  const stored = localStorage.getItem('fip-theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme(stored || preferred);

  el.themeToggle.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    render(); // los gráficos leen los colores del tema al construirse
  });
}

// ── URL ───────────────────────────────────────────────────────────────────

function readUrl() {
  const params = new URLSearchParams(location.search);

  if (TABS.some((t) => t.id === params.get('tab'))) state.tab = params.get('tab');
  if (params.get('gender') === 'female') state.gender = 'female';
  if (params.get('country')) state.country = params.get('country');
  if (params.get('player')) state.player = params.get('player');
  if (params.get('depth')) state.depth = Number(params.get('depth')) || state.depth;

  const versus = params.get('compare');
  if (versus?.includes(',')) state.compare = versus.split(',').slice(0, 2);
}

function writeUrl() {
  const params = new URLSearchParams();

  if (state.tab !== 'overview') params.set('tab', state.tab);
  if (state.gender !== 'male') params.set('gender', state.gender);
  if (state.country !== 'all') params.set('country', state.country);
  if (state.depth !== 50) params.set('depth', String(state.depth));
  if (state.player) params.set('player', state.player);
  if (state.tab === 'compare' && state.compare[0] && state.compare[1]) params.set('compare', state.compare.join(','));

  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// ── Interfaz ──────────────────────────────────────────────────────────────

function renderTabs() {
  el.tabs.innerHTML = TABS.map(
    (tab) => `<button type="button" class="tab" role="tab" data-tab="${tab.id}" aria-selected="${state.tab === tab.id && !state.player}">${esc(tab.label)}</button>`,
  ).join('');
}

function renderFreshness() {
  const { meta } = data;
  if (!meta) return;

  const ageHours = (Date.now() - new Date(meta.generatedAt).getTime()) / 3_600_000;
  const status = ageHours > 48 ? 'freshness--stale' : '';

  el.freshness.className = `freshness ${status}`;
  el.freshness.innerHTML = `
    <span class="freshness__dot" aria-hidden="true"></span>
    <span class="freshness__text">Semana ${esc(meta.week)} · ${esc(relativeTime(meta.generatedAt))}</span>`;
  el.freshness.title = `Datos generados el ${new Date(meta.generatedAt).toLocaleString('es-ES')} desde ${meta.source}`;
}

function renderCountryFilter() {
  const list = data.ranking[state.gender]?.countries ?? [];
  const current = state.country;

  el.country.innerHTML = [
    '<option value="all">Todos los países</option>',
    ...list.map((c) => `<option value="${esc(c.code)}"${c.code === current ? ' selected' : ''}>${esc(c.name)} (${esc(c.players)})</option>`),
  ].join('');
}

function syncSidebar() {
  document.querySelectorAll('[data-gender]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.gender === state.gender));
  });

  el.depth.value = String(state.depth);
  if (el.search.value !== state.search) el.search.value = state.search;

  const total = data.ranking[state.gender]?.players.length ?? 0;
  el.sidebarCount.textContent = `${total} jugadores seguidos`;
}

let toastTimer = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 6000);
}

function showError(error) {
  const isFileProtocol = location.protocol === 'file:';

  el.view.innerHTML = `
    <div class="error-box">
      <h2>No se pudieron cargar los datos</h2>
      <p>${esc(error.message)}</p>
      ${isFileProtocol
        ? `<p style="margin-top:12px">Has abierto el archivo directamente desde el disco y el navegador bloquea la
             lectura de los JSON. Levanta un servidor local con <code>npm run dev</code> y entra en
             <code>http://localhost:3000</code>.</p>`
        : `<p style="margin-top:12px">Genera los datos con <code>npm run update</code> y vuelve a cargar la página.</p>`}
    </div>`;
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  destroyCharts();
  renderTabs();
  renderFreshness();
  syncSidebar();
  writeUrl();

  const active = state.player ? player : TABS.find((t) => t.id === state.tab)?.view ?? overview;

  el.view.innerHTML = active.render();
  el.view.classList.remove('view-enter');
  void el.view.offsetWidth; // reinicia la animación de entrada
  el.view.classList.add('view-enter');

  requestAnimationFrame(() => active.mount());
}

async function switchGender(gender) {
  if (gender === state.gender) return;

  state.gender = gender;
  state.player = null;
  state.country = 'all';
  state.compare = [null, null];
  state.trendPicks = [];

  await ensureGender(gender);
  renderCountryFilter();
  render();
}

function goTab(tabId) {
  state.tab = tabId;
  state.player = null;
  render();
  el.view.focus({ preventScroll: true });
}

function openPlayer(playerId) {
  state.player = playerId;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFilters() {
  state.search = '';
  state.country = 'all';
  state.depth = 50;
  state.sort = { key: 'rank', dir: 'asc' };
  state.player = null;
  el.search.value = '';
  render();
}

// ── Eventos ───────────────────────────────────────────────────────────────

function bindEvents() {
  el.tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) goTab(tab.dataset.tab);
  });

  document.querySelectorAll('[data-gender]').forEach((btn) => {
    btn.addEventListener('click', () => switchGender(btn.dataset.gender));
  });

  el.country.addEventListener('change', () => {
    state.country = el.country.value;
    render();
  });

  el.depth.addEventListener('change', () => {
    state.depth = Number(el.depth.value);
    render();
  });

  let searchTimer = null;
  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = el.search.value;
      if (state.tab !== 'ranking' && state.search) state.tab = 'ranking';
      state.player = null;
      render();
    }, 220);
  });

  // Delegación única para todo lo que renderizan las vistas.
  document.addEventListener('click', (event) => {
    const target = event.target;

    const playerBtn = target.closest('[data-player]');
    if (playerBtn && el.view.contains(playerBtn)) {
      openPlayer(playerBtn.dataset.player);
      return;
    }

    const action = target.closest('[data-action]');
    if (action) {
      const { action: name } = action.dataset;
      if (name === 'home') { state.tab = 'overview'; resetFilters(); }
      if (name === 'reset') resetFilters();
      if (name === 'back') { state.player = null; render(); }
      if (name === 'export-csv') ranking.exportCsv();
      return;
    }

    const sortHeader = target.closest('[data-sort]');
    if (sortHeader) {
      const key = sortHeader.dataset.sort;
      const sameKey = state.sort.key === key;
      // Puesto y nombre se leen mejor ascendentes; el resto, de mayor a menor.
      const defaultDir = key === 'rank' || key === 'name' || key === 'country' ? 'asc' : 'desc';
      state.sort = { key, dir: sameKey ? (state.sort.dir === 'asc' ? 'desc' : 'asc') : defaultDir };
      render();
      return;
    }

    const pick = target.closest('[data-trend-pick]');
    if (pick) {
      const id = pick.dataset.trendPick;
      const current = state.trendPicks.length ? [...state.trendPicks] : trends.defaultPicks(data.ranking[state.gender]);
      const index = current.indexOf(id);

      if (index > -1) current.splice(index, 1);
      else if (current.length < trends.MAX_PICKS) current.push(id);
      else showToast(`Puedes comparar hasta ${trends.MAX_PICKS} jugadores a la vez.`);

      state.trendPicks = current;
      render();
      return;
    }

    const mode = target.closest('[data-trend-mode]');
    if (mode) {
      state.trendMode = mode.dataset.trendMode;
      render();
    }
  });

  document.addEventListener('change', (event) => {
    const select = event.target.closest('[data-compare]');
    if (!select) return;

    const next = [...state.compare];
    next[Number(select.dataset.compare)] = select.value || null;
    state.compare = next;
    render();
  });

  // Las filas de la tabla son navegables con teclado.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const row = event.target.closest('tr[data-player]');
    if (row) openPlayer(row.dataset.player);
  });
}

// ── Arranque ──────────────────────────────────────────────────────────────

async function init() {
  initTheme();
  readUrl();

  try {
    await loadAll();
    await ensureShared();
  } catch (error) {
    showError(error);
    return;
  }

  renderCountryFilter();
  bindEvents();
  render();

  startAutoRefresh((meta) => {
    renderCountryFilter();
    render();
    showToast(`Datos actualizados: semana ${meta.week} de ${meta.year}.`);
  });
}

init();
