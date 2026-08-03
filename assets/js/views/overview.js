import { PALETTE, countryDoughnut, evolutionLine, pointsBar } from '../charts.js';
import { empty, eventRow, insightCard, kpi, pairCard, podiumCard, sectionHead } from '../components.js';
import { esc, num, shortName } from '../format.js';
import { currentHistory, currentRanking, data, state } from '../store.js';

const TOP_TRACKED = 5;

/** Series de evolución de los primeros jugadores, saltando parejas repetidas. */
function leaderSeries() {
  const ranking = currentRanking();
  const history = currentHistory();
  if (!history) return { weeks: [], series: [] };

  const picked = [];
  const seenPoints = new Set();

  for (const player of ranking.players) {
    if (picked.length >= TOP_TRACKED) break;
    // Las parejas comparten puntos: se dibuja una sola línea por dupla.
    const key = `${player.rank}-${player.points}`;
    if (seenPoints.has(key)) continue;
    seenPoints.add(key);
    picked.push(player);
  }

  const series = picked
    .map((player, index) => {
      const entry = history.players[player.playerId];
      if (!entry) return null;
      return { label: shortName(player), values: entry.points, color: PALETTE[index % PALETTE.length] };
    })
    .filter(Boolean);

  return { weeks: history.weeks, series };
}

export function render() {
  const ranking = currentRanking();
  const { summary, insights, pairs, countries, players } = ranking;
  const label = state.gender === 'female' ? 'femenino' : 'masculino';
  const events = (data.tournaments?.events ?? []).filter((e) => e.gender === state.gender).slice(0, 6);

  const podium = [];
  const seen = new Set();
  for (const player of players) {
    if (podium.length >= 6) break;
    if (seen.has(player.playerId)) continue;
    seen.add(player.playerId);
    podium.push(player);
  }

  return `
    <section class="hero">
      <div class="hero__eyebrow">Ranking FIP · temporada ${esc(ranking.year)} · semana ${esc(ranking.week)}</div>
      <h1 class="hero__title">Panel analítico del circuito ${esc(label)}</h1>
      <p class="hero__sub">
        Seguimiento de los ${esc(summary.players)} primeros jugadores del ranking oficial de la Federación
        Internacional de Pádel, con evolución semanal, parejas activas, reparto por país y resultados del circuito.
        Todos los datos se leen directamente de padelfip.com.
      </p>
      <div class="hero__stats">
        <div>
          <div class="hero__stat-val">${esc(summary.leaderName)}</div>
          <div class="hero__stat-lbl">Número 1 · ${num(summary.leaderPoints)} pts</div>
        </div>
        <div>
          <div class="hero__stat-val num">${num(summary.totalPoints)}</div>
          <div class="hero__stat-lbl">Puntos acumulados del top ${esc(summary.players)}</div>
        </div>
        <div>
          <div class="hero__stat-val">${esc(summary.topCountry)}</div>
          <div class="hero__stat-lbl">País dominante · ${esc(summary.topCountryShare)}% de los puntos</div>
        </div>
        <div>
          <div class="hero__stat-val num">${esc(summary.weeklyMovers)}</div>
          <div class="hero__stat-lbl">Jugadores que se mueven esta semana</div>
        </div>
      </div>
    </section>

    <div class="grid grid--kpi section">
      ${kpi({ label: 'Jugadores seguidos', value: num(summary.players), sub: `Top ${summary.players} oficial`, icon: '🎾' })}
      ${kpi({ label: 'Parejas activas', value: num(summary.pairs), sub: 'Duplas confirmadas por ambos lados', icon: '🤝' })}
      ${kpi({ label: 'Países representados', value: num(summary.countries), sub: `Media ${num(summary.avgPoints)} pts/jugador`, icon: '🌍' })}
      ${kpi({ label: 'Finales registradas', value: num(summary.recentEvents), sub: 'Premier Padel y Cupra FIP Tour', icon: '🏆' })}
    </div>

    <section class="section">
      ${sectionHead('Cabeza del ranking', '<span class="pill pill--accent">Pulsa para ver la ficha</span>')}
      <div class="podium">
        ${podium.map((p, i) => podiumCard(p, PALETTE[i % PALETTE.length])).join('')}
      </div>
    </section>

    <section class="section">
      ${sectionHead('Lecturas de la jornada')}
      <p class="section__desc">
        Titulares calculados sobre los datos del día: se recalculan en cada actualización, así que nunca muestran
        un récord caducado.
      </p>
      <div class="grid grid--3">
        ${insights.map(insightCard).join('')}
      </div>
    </section>

    <section class="section grid grid--wide">
      <div class="card">
        <div class="card__head"><h3 class="card__title">Evolución de puntos de la élite</h3></div>
        <p class="card__hint">Puntos FIP semana a semana de los ${TOP_TRACKED} primeros puestos de la temporada ${esc(ranking.year)}.</p>
        <div class="chart chart--lg"><canvas id="chartEvolution"></canvas></div>
      </div>
      <div class="card">
        <div class="card__head"><h3 class="card__title">Pareja dominante</h3></div>
        ${pairs[0] ? pairCard(pairs[0], { top: true }) : empty('Sin parejas detectadas', '🤝')}
      </div>
    </section>

    <section class="section grid grid--2">
      <div class="card">
        <div class="card__head"><h3 class="card__title">Top 10 por puntos</h3></div>
        <p class="card__hint">Los miembros de una misma pareja comparten puntuación y aparecen con el mismo valor.</p>
        <div class="chart chart--lg"><canvas id="chartTopPoints"></canvas></div>
      </div>
      <div class="card">
        <div class="card__head"><h3 class="card__title">Reparto de puntos por país</h3></div>
        <p class="card__hint">Suma de puntos de los ${esc(summary.players)} jugadores seguidos, agrupada por federación.</p>
        <div class="chart chart--lg"><canvas id="chartCountries"></canvas></div>
      </div>
    </section>

    <section class="section">
      ${sectionHead('Últimos resultados del circuito', `<span class="pill">${esc(events.length)} finales</span>`)}
      <div class="card card--flush">
        ${events.length ? events.map((e) => eventRow(e)).join('') : empty('Todavía no hay finales registradas para esta categoría', '🏆')}
      </div>
    </section>

    <p class="section__desc" style="text-align:center">
      Fuente oficial · <a href="${esc(data.meta.source)}" target="_blank" rel="noopener">padelfip.com/fip-rankings</a>
    </p>`;
}

export function mount() {
  const ranking = currentRanking();
  const { weeks, series } = leaderSeries();

  if (weeks.length) evolutionLine('chartEvolution', { weeks, series, mode: 'points' });

  const top = ranking.players.filter((p) => p.rank <= 10).sort((a, b) => b.points - a.points);
  pointsBar('chartTopPoints', top.map((p, i) => ({
    label: `#${p.rank} ${shortName(p)}`,
    points: p.points,
    color: PALETTE[i % PALETTE.length],
  })));

  countryDoughnut('chartCountries', ranking.countries);
}
