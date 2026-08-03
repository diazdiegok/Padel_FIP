// Derivaciones sobre el ranking crudo de la FIP: parejas, países, movimientos
// e insights. Todo se recalcula en cada actualización, nada está escrito a mano.

export const COUNTRY_NAMES = {
  ESP: 'España', ARG: 'Argentina', BRA: 'Brasil', POR: 'Portugal', ITA: 'Italia',
  FRA: 'Francia', MEX: 'México', SWE: 'Suecia', NED: 'Países Bajos', BEL: 'Bélgica',
  GBR: 'Reino Unido', USA: 'Estados Unidos', CHI: 'Chile', PAR: 'Paraguay',
  URU: 'Uruguay', QAT: 'Catar', KSA: 'Arabia Saudí', UAE: 'Emiratos Árabes',
  EGY: 'Egipto', RSA: 'Sudáfrica', GER: 'Alemania', SUI: 'Suiza', AUT: 'Austria',
  DEN: 'Dinamarca', FIN: 'Finlandia', NOR: 'Noruega', POL: 'Polonia', CZE: 'Chequia',
  AND: 'Andorra', MON: 'Mónaco', CAN: 'Canadá', COL: 'Colombia', ECU: 'Ecuador',
  PER: 'Perú', BOL: 'Bolivia', VEN: 'Venezuela', CRC: 'Costa Rica', GUA: 'Guatemala',
  DOM: 'Rep. Dominicana', PAN: 'Panamá', JPN: 'Japón', KUW: 'Kuwait', BRN: 'Baréin',
  LIB: 'Líbano', IND: 'India', AUS: 'Australia', NZL: 'Nueva Zelanda', ISR: 'Israel',
  ROU: 'Rumanía', HUN: 'Hungría', GRE: 'Grecia', IRL: 'Irlanda', SVK: 'Eslovaquia',
  SLO: 'Eslovenia', CRO: 'Croacia', SRB: 'Serbia', BUL: 'Bulgaria', UKR: 'Ucrania',
  MAR: 'Marruecos', TUN: 'Túnez', NGR: 'Nigeria', KEN: 'Kenia', LUX: 'Luxemburgo',
};

// Colores fijos para las federaciones con presencia habitual, elegidos según
// su bandera para que el gráfico se lea sin consultar la leyenda.
const COUNTRY_COLORS = {
  ESP: '#e63946', ARG: '#5bc0eb', BRA: '#2dc653', POR: '#e85d04', ITA: '#0ead69',
  FRA: '#4361ee', MEX: '#06d6a0', SWE: '#ffd60a', NED: '#ff7b00', BEL: '#f4a261',
  GBR: '#8d99ae', USA: '#7209b7', QAT: '#9d0208', KSA: '#007f5f', UAE: '#43aa8b',
  EGY: '#c9a227', RSA: '#80b918', PAR: '#ef476f', CHI: '#118ab2', URU: '#4cc9f0',
  GER: '#adb5bd', SUI: '#d00000', AUT: '#f28482', DEN: '#bc4749', POL: '#e5989b',
  FIN: '#48cae4', NOR: '#3a86ff', CZE: '#b5179e', COL: '#fcbf49', ECU: '#f9c74f',
  PER: '#e76f51', CAN: '#e5383b', JPN: '#ff5d8f', AUS: '#00b4d8', ISR: '#4ea8de',
};

// Reserva para federaciones sin color asignado: se recorre en orden para que
// dos países distintos no acaben compartiendo tono.
const FALLBACK_PALETTE = [
  '#9d4eddff', '#57cc99', '#f4978e', '#4895ef', '#b5e48c', '#ffafcc',
  '#90caf9', '#ffb703', '#a3b18a', '#cdb4db', '#84dcc6', '#f6bd60',
];

export function countryName(code) {
  return COUNTRY_NAMES[code] || code;
}

/**
 * Asigna un color por federación. Las conocidas usan su color de bandera; el
 * resto recibe uno de la reserva según el orden en que aparece en el ranking,
 * lo que evita colisiones dentro de una misma vista.
 */
function colorAssigner() {
  let next = 0;
  const assigned = new Map();

  return (code) => {
    if (COUNTRY_COLORS[code]) return COUNTRY_COLORS[code];
    if (!assigned.has(code)) {
      assigned.set(code, FALLBACK_PALETTE[next % FALLBACK_PALETTE.length]);
      next += 1;
    }
    return assigned.get(code);
  };
}

const lastName = (player) => player.lastName || player.name.split(' ').slice(-1)[0];

/** Grupos de jugadores que comparten exactamente puesto y puntuación. */
function pointTies(ranking) {
  const buckets = new Map();

  for (const player of ranking) {
    const key = `${player.rank}::${player.points}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(player);
  }

  return [...buckets.values()].filter((group) => group.length === 2);
}

/**
 * Mapa playerId → compañero, por orden de fiabilidad:
 *   1. la pareja que declara la ficha oficial del jugador,
 *   2. el empate exacto de puesto y puntos en el ranking,
 *   3. haber disputado juntos una final reciente.
 */
export function derivePartners(ranking, finals = [], profiles = {}) {
  const byId = new Map(ranking.map((p) => [p.playerId, p]));
  const byUrl = new Map(ranking.filter((p) => p.url).map((p) => [p.url.replace(/\/+$/, ''), p]));
  const partners = new Map();

  for (const [playerId, profile] of Object.entries(profiles)) {
    if (!profile?.partner || !byId.has(playerId)) continue;

    const matched = byUrl.get(String(profile.partner.url).replace(/\/+$/, ''));
    partners.set(playerId, {
      playerId: matched?.playerId ?? null,
      name: matched?.name ?? profile.partner.name,
      source: 'official',
    });
  }

  for (const [a, b] of pointTies(ranking)) {
    if (!partners.has(a.playerId)) partners.set(a.playerId, { playerId: b.playerId, name: b.name, source: 'ranking' });
    if (!partners.has(b.playerId)) partners.set(b.playerId, { playerId: a.playerId, name: a.name, source: 'ranking' });
  }

  // Las finales recientes cubren duplas que aún no empatan en puntos.
  for (const event of [...finals].reverse()) {
    for (const side of [event.winners, event.finalists]) {
      if (side.length !== 2) continue;
      const [a, b] = side;
      if (!byId.has(a.playerId) || !byId.has(b.playerId)) continue;
      if (!partners.has(a.playerId)) partners.set(a.playerId, { playerId: b.playerId, name: b.name, source: 'circuit' });
      if (!partners.has(b.playerId)) partners.set(b.playerId, { playerId: a.playerId, name: a.name, source: 'circuit' });
    }
  }

  return Object.fromEntries(partners);
}

/**
 * Duplas del circuito. Se construyen sobre el mapa de compañeros para que la
 * pestaña de parejas y la columna «pareja» del ranking no se contradigan:
 * solo cuenta como pareja si ambos jugadores se señalan mutuamente.
 *
 * La FIP no publica un ranking de parejas. Se usa la media de puntos de los
 * dos miembros porque coincide exactamente con la cifra compartida cuando la
 * dupla ha jugado todo junta, y sigue siendo comparable cuando no.
 */
export function derivePairs(ranking, finals = [], partners = {}) {
  const byId = new Map(ranking.map((p) => [p.playerId, p]));

  const titlesByPair = new Map();
  for (const event of finals) {
    if (event.winners.length !== 2) continue;
    const key = event.winners.map((w) => w.playerId).sort().join('+');
    titlesByPair.set(key, (titlesByPair.get(key) || 0) + 1);
  }

  const seen = new Set();
  const pairs = [];

  for (const [playerId, partner] of Object.entries(partners)) {
    if (!partner.playerId) continue;

    // Mutualidad: descarta emparejamientos declarados solo por un lado.
    if (partners[partner.playerId]?.playerId !== playerId) continue;

    const key = [playerId, partner.playerId].sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);

    const a = byId.get(playerId);
    const b = byId.get(partner.playerId);
    if (!a || !b) continue;

    pairs.push({
      id: key,
      rank: Math.min(a.rank, b.rank),
      avgPoints: Math.round((a.points + b.points) / 2),
      combinedPoints: a.points + b.points,
      sharedPoints: a.points === b.points ? a.points : null,
      players: [a, b]
        .sort((x, y) => x.rank - y.rank)
        .map((p) => ({
          playerId: p.playerId,
          name: p.name,
          shortName: lastName(p),
          country: p.country,
          photo: p.photo,
          rank: p.rank,
          points: p.points,
        })),
      countries: [...new Set([a.country, b.country])],
      titles: titlesByPair.get(key) || 0,
      combinedMove: a.move + b.move,
      source: partner.source,
    });
  }

  return pairs
    .sort((x, y) => y.avgPoints - x.avgPoints)
    .map((pair, index) => ({ ...pair, pairRank: index + 1 }));
}

export function deriveCountries(ranking) {
  const map = new Map();
  const colorFor = colorAssigner();

  for (const player of ranking) {
    if (!map.has(player.country)) {
      map.set(player.country, {
        code: player.country,
        name: countryName(player.country),
        color: colorFor(player.country),
        flag: player.flag,
        players: 0,
        points: 0,
        bestRank: Infinity,
        top10: 0,
        top50: 0,
      });
    }

    const entry = map.get(player.country);
    entry.players += 1;
    entry.points += player.points;
    entry.bestRank = Math.min(entry.bestRank, player.rank);
    if (player.rank <= 10) entry.top10 += 1;
    if (player.rank <= 50) entry.top50 += 1;
  }

  const list = [...map.values()].sort((a, b) => b.points - a.points);
  const total = list.reduce((sum, c) => sum + c.points, 0) || 1;

  return list.map((c) => ({
    ...c,
    avgPoints: Math.round(c.points / c.players),
    share: Number(((c.points / total) * 100).toFixed(1)),
  }));
}

/** Títulos de la temporada por jugador, contados sobre finales reales. */
export function deriveSeasonTitles(finals) {
  const titles = new Map();
  const finalsPlayed = new Map();

  for (const event of finals) {
    for (const winner of event.winners) {
      titles.set(winner.playerId, (titles.get(winner.playerId) || 0) + 1);
      finalsPlayed.set(winner.playerId, (finalsPlayed.get(winner.playerId) || 0) + 1);
    }
    for (const finalist of event.finalists) {
      finalsPlayed.set(finalist.playerId, (finalsPlayed.get(finalist.playerId) || 0) + 1);
    }
  }

  return { titles: Object.fromEntries(titles), finals: Object.fromEntries(finalsPlayed) };
}

/**
 * Serie temporal por jugador a partir de las fotos semanales del ranking.
 * `weeks` viene ordenado de más antiguo a más reciente.
 */
export function buildHistory(weeklySnapshots) {
  const weeks = weeklySnapshots.map((s) => s.week);
  const players = new Map();

  weeklySnapshots.forEach((snapshot, index) => {
    for (const player of snapshot.ranking) {
      if (!players.has(player.playerId)) {
        players.set(player.playerId, {
          name: player.name,
          country: player.country,
          ranks: new Array(weeklySnapshots.length).fill(null),
          points: new Array(weeklySnapshots.length).fill(null),
        });
      }
      const entry = players.get(player.playerId);
      entry.ranks[index] = player.rank;
      entry.points[index] = player.points;
    }
  });

  return { weeks, players: Object.fromEntries(players) };
}

/** Variaciones a 4 y 12 semanas, y mejor puesto de la temporada. */
export function deriveTrends(ranking, history) {
  const trends = {};
  const total = history.weeks.length;

  for (const player of ranking) {
    const entry = history.players[player.playerId];
    if (!entry) continue;

    const pointsAt = (weeksAgo) => {
      const index = total - 1 - weeksAgo;
      return index >= 0 ? entry.points[index] : null;
    };
    const rankAt = (weeksAgo) => {
      const index = total - 1 - weeksAgo;
      return index >= 0 ? entry.ranks[index] : null;
    };

    const knownRanks = entry.ranks.filter((r) => r !== null);
    const knownPoints = entry.points.filter((p) => p !== null);

    trends[player.playerId] = {
      points4w: pointsAt(4) !== null ? player.points - pointsAt(4) : null,
      points12w: pointsAt(12) !== null ? player.points - pointsAt(12) : null,
      rank4w: rankAt(4) !== null ? rankAt(4) - player.rank : null,
      rank12w: rankAt(12) !== null ? rankAt(12) - player.rank : null,
      seasonBestRank: knownRanks.length ? Math.min(...knownRanks) : player.rank,
      seasonPeakPoints: knownPoints.length ? Math.max(...knownPoints) : player.points,
      // Serie corta para dibujar sparklines en la tabla.
      spark: entry.points.slice(-12).filter((p) => p !== null),
    };
  }

  return trends;
}

const fmt = (n) => Number(n).toLocaleString('es-ES');

/**
 * Titulares generados a partir de los datos del día. Se recalculan solos,
 * de modo que el panel nunca muestra un récord caducado.
 */
export function deriveInsights({ ranking, pairs, countries, trends, finals, gender }) {
  const insights = [];
  const label = gender === 'female' ? 'femenino' : 'masculino';
  const leader = ranking[0];
  const topPair = pairs[0];

  if (leader) {
    const chaser = ranking.find((p) => p.rank > leader.rank);
    const gap = chaser ? leader.points - chaser.points : 0;
    insights.push({
      icon: '👑',
      title: `Nº1 ${label}`,
      value: leader.name,
      detail: chaser
        ? `${fmt(leader.points)} pts, con ${fmt(gap)} de ventaja sobre el #${chaser.rank}.`
        : `${fmt(leader.points)} puntos FIP.`,
      tag: 'Liderato',
    });
  }

  if (topPair) {
    const points = topPair.sharedPoints
      ? `${fmt(topPair.sharedPoints)} pts compartidos`
      : `${fmt(topPair.avgPoints)} pts de media`;

    insights.push({
      icon: '🤝',
      title: 'Pareja dominante',
      value: topPair.players.map((p) => p.shortName).join(' / '),
      detail: `${points}${topPair.titles ? ` · ${topPair.titles} ${topPair.titles === 1 ? 'título registrado' : 'títulos registrados'}` : ''}.`,
      tag: 'Parejas',
    });
  }

  const climber = ranking
    .filter((p) => p.move > 0)
    .sort((a, b) => b.move - a.move)[0];
  if (climber) {
    insights.push({
      icon: '🚀',
      title: 'Mayor escalada semanal',
      value: climber.name,
      detail: `Sube ${climber.move} puesto${climber.move > 1 ? 's' : ''} hasta el #${climber.rank}.`,
      tag: 'Movimiento',
    });
  }

  const surger = Object.entries(trends)
    .filter(([, t]) => t.rank12w !== null && t.rank12w > 0)
    .sort((a, b) => b[1].rank12w - a[1].rank12w)[0];
  if (surger) {
    const player = ranking.find((p) => p.playerId === surger[0]);
    if (player) {
      insights.push({
        icon: '📈',
        title: 'Progresión trimestral',
        value: player.name,
        detail: `Gana ${surger[1].rank12w} posiciones en 12 semanas, hasta el #${player.rank}.`,
        tag: 'Tendencia',
      });
    }
  }

  const top = countries[0];
  if (top) {
    insights.push({
      icon: '🌍',
      title: 'País dominante',
      value: top.name,
      detail: `${top.players} jugadores y el ${top.share}% de los puntos del top ${ranking.length}.`,
      tag: 'Países',
    });
  }

  const lastEvent = finals.find((f) => f.gender === gender);
  if (lastEvent) {
    // Los apellidos compuestos ("Triay Pons") se rompen al cortar por espacios,
    // así que se toma el `surname` oficial del ranking cuando el jugador está.
    const byId = new Map(ranking.map((p) => [p.playerId, p]));
    const short = (winner) => byId.get(winner.playerId)?.lastName || winner.name;

    insights.push({
      icon: '🏆',
      title: 'Último título',
      value: lastEvent.winners.map(short).join(' / '),
      detail: `${lastEvent.tournament} (${lastEvent.city}) · ${lastEvent.score}.`,
      tag: 'Circuito',
    });
  }

  return insights;
}

/** Bloque de indicadores de cabecera. */
export function deriveSummary({ ranking, pairs, countries, finals, gender }) {
  const leader = ranking[0];
  const totalPoints = ranking.reduce((sum, p) => sum + p.points, 0);
  const genderFinals = finals.filter((f) => f.gender === gender);
  const movers = ranking.filter((p) => p.move !== 0);

  return {
    players: ranking.length,
    countries: countries.length,
    pairs: pairs.length,
    totalPoints,
    avgPoints: Math.round(totalPoints / (ranking.length || 1)),
    leaderName: leader?.name ?? '—',
    leaderPoints: leader?.points ?? 0,
    topCountry: countries[0]?.name ?? '—',
    topCountryShare: countries[0]?.share ?? 0,
    recentEvents: genderFinals.length,
    weeklyMovers: movers.length,
  };
}
