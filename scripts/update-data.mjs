#!/usr/bin/env node
// ETL del dashboard: descarga el ranking oficial de la FIP, reconstruye el
// histórico semanal y deja en /data los JSON que consume el front.
//
//   npm run update        actualización incremental (solo semanas nuevas)
//   npm run update:full   reconstruye el histórico completo de la temporada

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENDERS, fetchCurrentPeriod, fetchPlayerProfile, fetchRanking, fetchRecentFinals } from './lib/fip-api.mjs';
import {
  buildHistory, deriveCountries, deriveInsights, derivePairs, derivePartners,
  deriveSeasonTitles, deriveSummary, deriveTrends,
} from './lib/transform.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const CACHE_DIR = join(DATA_DIR, '.cache');

const RANKING_DEPTH = 200;   // jugadores del ranking vigente
const HISTORY_DEPTH = 100;   // profundidad de cada foto semanal
const PROFILE_DEPTH = 20;    // fichas ampliadas por género
const PROFILE_TTL_DAYS = 6;  // las fichas cambian poco: se revisitan cada 6 días
const FIRST_WEEK = 3;        // primera semana publicada de la temporada
const CONCURRENCY = 3;

const FULL_REBUILD = process.argv.includes('--full');

const log = (msg) => console.log(msg);
const fmt = (n) => Number(n).toLocaleString('es-ES');

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Ejecuta tareas con un tope de peticiones simultáneas. */
async function pool(items, worker, limit = CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

/**
 * El caché local pesa demasiado para versionarlo, así que cuando no está
 * (por ejemplo en CI) las fotos semanales se reconstruyen desde el histórico
 * ya publicado en /data. Contiene lo justo para recalcular tendencias.
 */
async function snapshotsFromHistory(gender, year) {
  const history = await readJson(join(DATA_DIR, `history-${gender}.json`));
  if (!history?.weeks?.length || history.year !== year) return [];

  return history.weeks.map((week, index) => ({
    week,
    ranking: Object.entries(history.players)
      .filter(([, entry]) => entry.ranks[index] !== null)
      .map(([playerId, entry]) => ({
        playerId,
        name: entry.name,
        country: entry.country,
        rank: entry.ranks[index],
        points: entry.points[index],
      })),
  }));
}

/**
 * Fotos semanales del ranking. Reutiliza lo que ya haya en disco y solo pide a
 * la API las semanas que faltan, así la actualización diaria es de 2 peticiones.
 */
async function loadSnapshots(gender, year, currentWeek) {
  const cachePath = join(CACHE_DIR, `snapshots-${gender}-${year}.json`);
  const cached = FULL_REBUILD ? null : await readJson(cachePath);

  const seed = cached?.snapshots ?? (FULL_REBUILD ? [] : await snapshotsFromHistory(gender, year));
  if (!cached && seed.length) log(`   ${gender}: histórico reconstruido desde /data (${seed.length} semanas)`);

  const byWeek = new Map(seed.map((s) => [s.week, s]));

  // La FIP no publica ranking todas las semanas; las vacías se recuerdan para
  // no volver a pedirlas en cada ejecución.
  const knownEmpty = new Set(cached?.emptyWeeks ?? []);

  const allWeeks = Array.from({ length: currentWeek - FIRST_WEEK + 1 }, (_, i) => FIRST_WEEK + i);
  // La semana en curso siempre se refresca: sus puntos aún se mueven.
  const missing = allWeeks.filter((w) => w === currentWeek || (!byWeek.has(w) && !knownEmpty.has(w)));

  if (missing.length) {
    log(`   ${gender}: descargando ${missing.length} semana(s) → ${missing.join(', ')}`);
    const fetched = await pool(missing, async (week) => ({
      week,
      ranking: await fetchRanking({ gender, year, week, limit: HISTORY_DEPTH }),
    }));

    for (const snapshot of fetched) {
      if (snapshot.ranking.length) byWeek.set(snapshot.week, snapshot);
      else if (snapshot.week !== currentWeek) knownEmpty.add(snapshot.week);
    }
  } else {
    log(`   ${gender}: histórico al día (${byWeek.size} semanas en caché)`);
  }

  const snapshots = [...byWeek.values()].sort((a, b) => a.week - b.week);
  await writeJson(cachePath, {
    year,
    updatedAt: new Date().toISOString(),
    emptyWeeks: [...knownEmpty].sort((a, b) => a - b),
    snapshots,
  });

  return snapshots;
}

/** Fichas ampliadas del top N, cacheadas para no reescanear el sitio cada día. */
async function loadProfiles(ranking, cache) {
  const targets = ranking.slice(0, PROFILE_DEPTH).filter((p) => p.url);
  const staleBefore = Date.now() - PROFILE_TTL_DAYS * 24 * 3600 * 1000;

  const results = await pool(targets, async (player) => {
    const cached = cache[player.playerId];
    if (cached && new Date(cached.fetchedAt).getTime() > staleBefore) return null;

    const profile = await fetchPlayerProfile(player.url);
    return profile ? [player.playerId, { ...profile, fetchedAt: new Date().toISOString() }] : null;
  });

  let updated = 0;
  for (const entry of results) {
    if (!entry) continue;
    cache[entry[0]] = entry[1];
    updated += 1;
  }

  return updated;
}

/**
 * `circuit-stats` solo devuelve las ~20 finales más recientes, así que se
 * acumulan en disco: el histórico de torneos crece con cada actualización.
 */
async function mergeTournamentArchive(finals) {
  const path = join(DATA_DIR, 'tournaments.json');
  const previous = await readJson(path, { events: [] });

  const byId = new Map((previous.events ?? []).map((e) => [e.id, e]));
  let added = 0;

  for (const event of finals) {
    if (!byId.has(event.id)) added += 1;
    byId.set(event.id, event);
  }

  const events = [...byId.values()].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
  return { events, added };
}

async function main() {
  const startedAt = Date.now();
  log('\n🎾 Actualizando datos FIP desde padelfip.com\n');

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });

  const { year, week } = await fetchCurrentPeriod();
  log(`📅 Ranking vigente: temporada ${year}, semana ${week}`);

  const recentFinals = await fetchRecentFinals();
  const { events: finals, added } = await mergeTournamentArchive(recentFinals);
  log(`🏆 Finales: ${recentFinals.length} recientes · ${added} nuevas · ${finals.length} en archivo`);

  const profileCache = (await readJson(join(DATA_DIR, 'profiles.json'), { players: {} })).players ?? {};
  const seasonTitles = deriveSeasonTitles(finals.filter((f) => f.year === year));
  const meta = { generatedAt: new Date().toISOString(), year, week, source: 'https://www.padelfip.com/fip-rankings/', genders: {} };

  for (const gender of GENDERS) {
    log(`\n▶ ${gender === 'male' ? 'Masculino' : 'Femenino'}`);

    const ranking = await fetchRanking({ gender, year, week, limit: RANKING_DEPTH });
    if (!ranking.length) throw new Error(`La API no devolvió ranking ${gender} para ${year}/W${week}`);
    log(`   ranking vigente: ${ranking.length} jugadores (líder ${ranking[0].name}, ${fmt(ranking[0].points)} pts)`);

    const snapshots = await loadSnapshots(gender, year, week);
    const history = buildHistory(snapshots);
    const trends = deriveTrends(ranking, history);

    // Las fichas se leen antes de derivar parejas: la pareja que declara el
    // perfil oficial tiene prioridad sobre la inferida del ranking.
    const profilesUpdated = await loadProfiles(ranking, profileCache);
    if (profilesUpdated) log(`   fichas ampliadas actualizadas: ${profilesUpdated}`);

    const genderFinals = finals.filter((f) => f.gender === gender);
    const partners = derivePartners(ranking, genderFinals, profileCache);
    const pairs = derivePairs(ranking, genderFinals, partners);
    const countries = deriveCountries(ranking);
    const insights = deriveInsights({ ranking, pairs, countries, trends, finals, gender });
    const summary = deriveSummary({ ranking, pairs, countries, finals, gender });

    await writeJson(join(DATA_DIR, `ranking-${gender}.json`), {
      gender, year, week,
      generatedAt: meta.generatedAt,
      players: ranking,
      pairs, countries, trends, insights, summary, partners,
      seasonTitles: seasonTitles.titles,
      seasonFinals: seasonTitles.finals,
    });

    await writeJson(join(DATA_DIR, `history-${gender}.json`), { gender, year, ...history });

    meta.genders[gender] = {
      players: ranking.length,
      pairs: pairs.length,
      countries: countries.length,
      weeks: history.weeks.length,
      leader: ranking[0].name,
      leaderPoints: ranking[0].points,
    };

    log(`   parejas ${pairs.length} · países ${countries.length} · semanas ${history.weeks.length}`);
  }

  meta.tournaments = finals.length;

  await writeJson(join(DATA_DIR, 'tournaments.json'), { generatedAt: meta.generatedAt, events: finals });
  await writeJson(join(DATA_DIR, 'profiles.json'), { generatedAt: meta.generatedAt, players: profileCache });
  await writeJson(join(DATA_DIR, 'meta.json'), meta);

  log(`\n✅ Datos escritos en /data (${((Date.now() - startedAt) / 1000).toFixed(1)}s)\n`);
}

main().catch((error) => {
  console.error(`\n❌ Falló la actualización: ${error.message}\n`);
  process.exitCode = 1;
});
