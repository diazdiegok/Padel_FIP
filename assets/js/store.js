// Estado de la aplicación y acceso a los JSON generados por el ETL.

const DATA_DIR = 'data';
const REFRESH_INTERVAL = 5 * 60 * 1000; // sondeo de meta.json

export const state = {
  tab: 'overview',
  gender: 'male',
  country: 'all',
  search: '',
  depth: 50,
  player: null,
  compare: [null, null],
  trendPicks: [],
  trendMode: 'points',
  sort: { key: 'rank', dir: 'asc' },
};

export const data = {
  meta: null,
  ranking: { male: null, female: null },
  history: { male: null, female: null },
  tournaments: null,
  profiles: null,
};

const listeners = new Set();

export const onChange = (fn) => listeners.add(fn);
const emit = (reason) => listeners.forEach((fn) => fn(reason));

/**
 * Los JSON se versionan con `generatedAt` para saltar la caché del navegador
 * en cuanto el ETL publica datos nuevos.
 */
async function loadJson(file, { bust = true } = {}) {
  const version = bust && data.meta ? `?v=${encodeURIComponent(data.meta.generatedAt)}` : '';
  const res = await fetch(`${DATA_DIR}/${file}${version}`, { cache: bust ? 'default' : 'no-store' });

  if (!res.ok) throw new Error(`No se pudo cargar ${file} (HTTP ${res.status})`);
  return res.json();
}

export async function loadMeta() {
  data.meta = await loadJson('meta.json', { bust: false });
  return data.meta;
}

/** Carga bajo demanda del dataset de un género (ranking + histórico). */
export async function ensureGender(gender) {
  if (data.ranking[gender] && data.history[gender]) return;

  const [ranking, history] = await Promise.all([
    loadJson(`ranking-${gender}.json`),
    loadJson(`history-${gender}.json`),
  ]);

  data.ranking[gender] = ranking;
  data.history[gender] = history;
}

export async function ensureShared() {
  if (!data.tournaments) data.tournaments = await loadJson('tournaments.json');
  if (!data.profiles) data.profiles = await loadJson('profiles.json');
}

export async function loadAll() {
  await loadMeta();
  await Promise.all([ensureGender(state.gender), ensureShared()]);
}

/** Descarta lo cargado para releer los JSON recién publicados. */
export async function reloadAll() {
  data.ranking = { male: null, female: null };
  data.history = { male: null, female: null };
  data.tournaments = null;
  data.profiles = null;
  await loadAll();
}

/**
 * Sondea meta.json y avisa cuando el ETL ha publicado una versión nueva,
 * de modo que una pestaña abierta no se queda con datos viejos.
 */
export function startAutoRefresh(onUpdate) {
  let timer = null;

  const check = async () => {
    if (document.hidden) return;

    try {
      const res = await fetch(`${DATA_DIR}/meta.json`, { cache: 'no-store' });
      if (!res.ok) return;

      const fresh = await res.json();
      if (fresh.generatedAt === data.meta?.generatedAt) return;

      data.meta = fresh;
      await reloadAll();
      onUpdate(fresh);
    } catch {
      // Sin conexión: se reintenta en el siguiente ciclo.
    }
  };

  const start = () => {
    stop();
    timer = setInterval(check, REFRESH_INTERVAL);
  };
  const stop = () => timer && clearInterval(timer);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : (check(), start())));
  start();
}

// ── Selectores ────────────────────────────────────────────────────────────

export const currentRanking = () => data.ranking[state.gender];
export const currentHistory = () => data.history[state.gender];

export const findPlayer = (playerId, gender = state.gender) =>
  data.ranking[gender]?.players.find((p) => p.playerId === playerId) ?? null;

export const trendsFor = (playerId) => currentRanking()?.trends?.[playerId] ?? null;
export const profileFor = (playerId) => data.profiles?.players?.[playerId] ?? null;

/** Ranking tras aplicar búsqueda, país y profundidad de la barra lateral. */
export function filteredPlayers() {
  const ranking = currentRanking();
  if (!ranking) return [];

  const term = state.search.trim().toLowerCase();

  return ranking.players.filter((player) => {
    if (player.rank > state.depth) return false;
    if (state.country !== 'all' && player.country !== state.country) return false;
    if (!term) return true;
    return player.name.toLowerCase().includes(term) || player.country.toLowerCase().includes(term);
  });
}

export function sortedPlayers() {
  const players = [...filteredPlayers()];
  const { key, dir } = state.sort;
  const factor = dir === 'asc' ? 1 : -1;

  return players.sort((a, b) => {
    const pick = (player) => {
      if (key === 'name') return player.name;
      if (key === 'country') return player.country;
      if (key === 'trend') return currentRanking()?.trends?.[player.playerId]?.points4w ?? 0;
      return player[key] ?? 0;
    };

    const va = pick(a);
    const vb = pick(b);

    if (typeof va === 'string') return va.localeCompare(vb, 'es') * factor;
    return (va - vb) * factor;
  });
}

export function setState(patch, reason = 'state') {
  Object.assign(state, patch);
  emit(reason);
}
