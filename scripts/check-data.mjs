#!/usr/bin/env node
// Valida los JSON de /data antes de publicarlos: comprueba que existen, que
// son coherentes entre sí y que las referencias cruzadas apuntan a algo real.
//
//   npm run check

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const problems = [];
const notes = [];

const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

async function read(file) {
  try {
    return JSON.parse(await readFile(join(DATA_DIR, file), 'utf8'));
  } catch (error) {
    fail(`${file}: no se puede leer (${error.message})`);
    return null;
  }
}

function checkRanking(gender, ranking, meta, tournaments) {
  const label = `ranking-${gender}.json`;
  if (!ranking) return;

  if (!Array.isArray(ranking.players) || ranking.players.length === 0) {
    fail(`${label}: sin jugadores`);
    return;
  }

  if (ranking.week !== meta.week || ranking.year !== meta.year) {
    fail(`${label}: periodo ${ranking.year}/S${ranking.week} distinto del de meta.json (${meta.year}/S${meta.week})`);
  }

  const ids = new Set();
  let previousRank = 0;

  for (const player of ranking.players) {
    if (!player.playerId) fail(`${label}: jugador sin playerId (${player.name})`);
    if (ids.has(player.playerId)) fail(`${label}: playerId duplicado ${player.playerId}`);
    ids.add(player.playerId);

    if (!Number.isFinite(player.points) || player.points < 0) fail(`${label}: puntos inválidos en ${player.name}`);
    if (player.rank < previousRank) fail(`${label}: ranking desordenado en #${player.rank} (${player.name})`);
    previousRank = player.rank;
  }

  // Los puntos deben decrecer conforme baja el puesto.
  const sorted = [...ranking.players].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].points > sorted[i - 1].points) {
      fail(`${label}: #${sorted[i].rank} (${sorted[i].points} pts) supera a #${sorted[i - 1].rank} (${sorted[i - 1].points} pts)`);
      break;
    }
  }

  for (const [playerId, partner] of Object.entries(ranking.partners ?? {})) {
    if (!ids.has(playerId)) fail(`${label}: partners referencia a un jugador ausente (${playerId})`);
    if (partner.playerId && !ids.has(partner.playerId)) fail(`${label}: compañero fuera del ranking (${partner.playerId})`);
  }

  for (const pair of ranking.pairs ?? []) {
    if (pair.players.length !== 2) fail(`${label}: pareja ${pair.id} no tiene dos jugadores`);
    if (!Number.isFinite(pair.avgPoints)) fail(`${label}: pareja ${pair.id} sin media de puntos`);
    for (const member of pair.players) {
      if (!ids.has(member.playerId)) fail(`${label}: pareja ${pair.id} referencia a ${member.playerId}, ausente del ranking`);
    }
  }

  const orderedPairs = ranking.pairs ?? [];
  for (let i = 1; i < orderedPairs.length; i++) {
    if (orderedPairs[i].avgPoints > orderedPairs[i - 1].avgPoints) {
      fail(`${label}: parejas desordenadas en la posición ${i + 1}`);
      break;
    }
  }

  const countryTotal = (ranking.countries ?? []).reduce((sum, c) => sum + c.players, 0);
  if (countryTotal !== ranking.players.length) {
    fail(`${label}: los países suman ${countryTotal} jugadores y el ranking tiene ${ranking.players.length}`);
  }

  const colors = new Set((ranking.countries ?? []).map((c) => c.color));
  if (colors.size < Math.min(8, (ranking.countries ?? []).length)) {
    note(`${label}: pocos colores distintos entre federaciones (${colors.size})`);
  }

  if (!ranking.insights?.length) note(`${label}: sin insights generados`);

  const genderEvents = (tournaments?.events ?? []).filter((e) => e.gender === gender);
  note(`${label}: ${ranking.players.length} jugadores · ${orderedPairs.length} parejas · ${(ranking.countries ?? []).length} países · ${genderEvents.length} finales`);
}

function checkHistory(gender, history, ranking) {
  const label = `history-${gender}.json`;
  if (!history) return;

  if (!history.weeks?.length) {
    fail(`${label}: sin semanas`);
    return;
  }

  const ascending = history.weeks.every((week, i) => i === 0 || week > history.weeks[i - 1]);
  if (!ascending) fail(`${label}: las semanas no están ordenadas`);

  const size = history.weeks.length;
  for (const [playerId, entry] of Object.entries(history.players)) {
    if (entry.ranks.length !== size || entry.points.length !== size) {
      fail(`${label}: series de longitud incorrecta en ${playerId}`);
      break;
    }
  }

  const leader = ranking?.players?.[0];
  if (leader && history.players[leader.playerId]) {
    const last = history.players[leader.playerId].points.at(-1);
    if (last !== null && last !== leader.points) {
      fail(`${label}: la última semana del líder (${last}) no coincide con el ranking (${leader.points})`);
    }
  }

  note(`${label}: ${size} semanas (S${history.weeks[0]}–S${history.weeks.at(-1)}) · ${Object.keys(history.players).length} jugadores`);
}

async function main() {
  const meta = await read('meta.json');
  if (!meta) {
    console.error('\n❌ Falta meta.json. Ejecuta primero: npm run update\n');
    process.exit(1);
  }

  const ageHours = (Date.now() - new Date(meta.generatedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours)) fail('meta.json: generatedAt inválido');
  else if (ageHours > 48) note(`meta.json: los datos tienen ${Math.round(ageHours / 24)} días`);

  const tournaments = await read('tournaments.json');
  if (tournaments && !tournaments.events?.length) fail('tournaments.json: sin eventos');

  const profiles = await read('profiles.json');
  if (profiles && !Object.keys(profiles.players ?? {}).length) note('profiles.json: sin fichas ampliadas');

  for (const gender of ['male', 'female']) {
    const ranking = await read(`ranking-${gender}.json`);
    const history = await read(`history-${gender}.json`);
    checkRanking(gender, ranking, meta, tournaments);
    checkHistory(gender, history, ranking);
  }

  console.log(`\n📋 Validación de /data — generado ${new Date(meta.generatedAt).toLocaleString('es-ES')}\n`);
  notes.forEach((n) => console.log(`   · ${n}`));

  if (problems.length) {
    console.error(`\n❌ ${problems.length} problema(s):\n`);
    problems.forEach((p) => console.error(`   ✗ ${p}`));
    console.error('');
    process.exit(1);
  }

  console.log('\n✅ Todos los datos son coherentes.\n');
}

main();
