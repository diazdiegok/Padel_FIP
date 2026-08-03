// Cliente de la API pública de padelfip.com.
//
// Endpoints usados (descubiertos en el tema WordPress oficial, sin autenticación):
//   GET /wp-json/fip/v1/ranking/load-more   → ranking por género / año / semana
//   GET /wp-json/fip/v1/circuit-stats       → finales recientes del circuito
//   GET /fip-rankings/                      → HTML con la semana publicada vigente

const ORIGIN = 'https://www.padelfip.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html;q=0.9',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

export const GENDERS = ['male', 'female'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * La API cae de vez en cuando con 5xx o devuelve HTML de error en vez de JSON,
 * así que cada lectura se reintenta con backoff exponencial.
 */
async function request(url, { retries = 4, expectJson = true } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(600 * 2 ** (attempt - 1));

    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} en ${url}`);
        continue;
      }

      if (!expectJson) return await res.text();

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        lastError = new Error(`Respuesta no-JSON (${contentType}) en ${url}`);
        continue;
      }

      return await res.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`No se pudo leer ${url}`);
}

/** Semana ISO y año del ranking publicado ahora mismo en padelfip.com. */
export async function fetchCurrentPeriod() {
  const html = await request(`${ORIGIN}/fip-rankings/`, { expectJson: false });
  const match = html.match(/data-year="(\d{4})"[\s\S]{0,200}?data-week-no="(\d{1,2})"/);

  if (!match) throw new Error('No se pudo detectar el año/semana vigente en padelfip.com');

  return { year: Number(match[1]), week: Number(match[2]) };
}

/**
 * Ranking maestro de un género para una semana concreta.
 * La API tope entrega ~500 filas por llamada, de sobra para el top que usamos.
 */
export async function fetchRanking({ gender, year, week, limit = 200 }) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: '0',
    gender,
    category: 'master',
    circuit: '',
    year: String(year),
    week: String(week),
    lang: 'en',
  });

  const payload = await request(`${ORIGIN}/wp-json/fip/v1/ranking/load-more?${params}`);

  // Cuando la semana no existe la API responde [] o { error: ... }
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((row) => row && row.rank && row.rank !== 9999)
    .map((row) => ({
      playerId: row.player_id,
      firstName: (row.name || '').trim(),
      lastName: (row.surname || '').trim(),
      name: [row.name, row.surname].filter(Boolean).join(' ').trim(),
      rank: Number(row.rank),
      points: Number(row.points) || 0,
      move: Number(row.move) || 0,
      country: row.country_name || '—',
      flag: row.country_flag || null,
      photo: row.thumbnail || null,
      url: row.url || null,
    }));
}

/** Finales recientes del circuito (Premier Padel + Cupra FIP Tour). */
export async function fetchRecentFinals() {
  const payload = await request(`${ORIGIN}/wp-json/fip/v1/circuit-stats`);
  if (!Array.isArray(payload)) return [];

  const side = (entry) => (entry && entry.name ? { name: entry.name, playerId: entry.player_id, photo: entry.thumbnail, country: entry.country_name } : null);

  return payload
    .map((event) => ({
      id: event.id,
      year: event.year,
      category: event.category,
      circuit: event.circuit,
      gender: event.gender,
      tournament: event.tournament,
      city: event.city,
      countryFlag: event.country?.flag || null,
      date: event.final_date,
      sortDate: event.date_for_order,
      score: event.score,
      winners: [side(event.winner_player), side(event.winner_partner)].filter(Boolean),
      finalists: [side(event.finalist), side(event.finalist_partner)].filter(Boolean),
    }))
    .filter((event) => event.winners.length > 0)
    .sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
}

/**
 * La ficha del jugador apila varios bloques `tab__row` (uno por temporada y
 * otro de carrera), cada uno con pares título/valor. Se parsean por bloque
 * porque temporada y carrera comparten las mismas etiquetas.
 */
function parseStatBlocks(html) {
  const start = html.indexOf('id="tabpanel-1"');
  if (start === -1) return [];

  // El segundo panel (Cupra FIP Tour) viene comentado en el HTML: se corta ahí
  // para no mezclar sus cifras con las de Premier Padel.
  const commentAt = html.indexOf('<!--', start);
  const panel = html.slice(start, commentAt === -1 ? start + 20_000 : commentAt);

  return panel
    .split(/<div class="tab__row/)
    .slice(1)
    .map((chunk) => {
      const name = chunk.match(/tab__name">([^<]+)</)?.[1]?.trim();
      if (!name) return null;

      const stats = {};
      for (const [, key, value] of chunk.matchAll(/tab__title">([^<]+)<\/p>\s*<span class="tab__value">([^<]*)</g)) {
        stats[key.trim().toLowerCase()] = value.trim();
      }

      return { name, stats };
    })
    .filter(Boolean);
}

function parseRecord(value) {
  const match = String(value || '').match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return { wins: null, losses: null, winRate: null };

  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const played = wins + losses;

  return { wins, losses, winRate: played > 0 ? Number(((wins / played) * 100).toFixed(1)) : null };
}

const int = (value) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Perfil ampliado: carrera, temporada en curso, pareja oficial y retrato.
 * No hay endpoint JSON, así que se lee de la ficha pública del jugador.
 */
export async function fetchPlayerProfile(playerUrl) {
  try {
    const html = await request(playerUrl, { expectJson: false });
    const blocks = parseStatBlocks(html);

    const careerBlock = blocks.find((b) => /career/i.test(b.name));
    const seasonBlock = blocks.find((b) => /^\d{4}$/.test(b.name));

    const career = careerBlock
      ? {
          bestRank: int(careerBlock.stats['best rank']),
          ...parseRecord(careerBlock.stats['w-l']),
          titles: int(careerBlock.stats.titles),
          consecutiveWins: int(careerBlock.stats['cons. win']),
        }
      : null;

    const season = seasonBlock
      ? {
          year: int(seasonBlock.name),
          bestRank: int(seasonBlock.stats['best rank']),
          titles: int(seasonBlock.stats.titles),
          raceRank: int(seasonBlock.stats.race),
        }
      : null;

    // Pareja oficial declarada por la FIP, más fiable que inferirla del ranking.
    const pairedBlock = html.slice(html.indexOf('player__paired'), html.indexOf('player__paired') + 1500);
    const pairedHref = pairedBlock.match(/href="(https:\/\/www\.padelfip\.com\/player\/[^"]+)"/)?.[1] ?? null;
    const pairedName = pairedBlock.match(/pairedName[\s\S]{0,300}?>([^<]+)<\/a>/)?.[1]?.trim() ?? null;

    // Retrato de cuerpo entero (~258x400), muy superior al thumbnail 150x150
    // que devuelve la API de ranking.
    const portrait = html.match(/<div class="player__img">[\s\S]{0,400}?<img[^>]+src="([^"]+)"/)?.[1] ?? null;

    if (!career && !season && !pairedName) return null;

    return {
      career,
      season,
      partner: pairedName && pairedHref ? { name: pairedName, url: pairedHref } : null,
      portrait,
    };
  } catch {
    return null;
  }
}
