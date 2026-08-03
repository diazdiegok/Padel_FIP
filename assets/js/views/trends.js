import { PALETTE, evolutionLine } from '../charts.js';
import { empty, sectionHead } from '../components.js';
import { esc, num, shortName, signed } from '../format.js';
import { currentHistory, currentRanking, state } from '../store.js';

const MAX_PICKS = 6;

/** Selección por defecto: los primeros puestos, sin repetir parejas. */
export function defaultPicks(ranking) {
  const picks = [];
  const seen = new Set();

  for (const player of ranking.players) {
    if (picks.length >= 4) break;
    const key = `${player.rank}-${player.points}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(player.playerId);
  }

  return picks;
}

const colorFor = (playerId, picks) => PALETTE[Math.max(0, picks.indexOf(playerId)) % PALETTE.length];

export function render() {
  const ranking = currentRanking();
  const history = currentHistory();
  const picks = state.trendPicks.length ? state.trendPicks : defaultPicks(ranking);

  if (!history || !history.weeks.length) {
    return `<section class="section">${sectionHead('Evolución semanal')}${empty('Todavía no hay histórico para esta categoría', '📈')}</section>`;
  }

  // Solo se ofrecen jugadores con serie histórica registrada.
  const selectable = ranking.players.filter((p) => history.players[p.playerId]).slice(0, 40);

  const rows = picks
    .map((playerId) => {
      const player = ranking.players.find((p) => p.playerId === playerId);
      const entry = history.players[playerId];
      const trend = ranking.trends[playerId];
      if (!player || !entry) return null;

      const known = entry.points.filter((v) => v !== null);
      const first = known[0] ?? 0;
      const last = known.at(-1) ?? 0;

      return `
        <tr>
          <td><span class="chart-legend__swatch" style="background:${esc(colorFor(playerId, picks))};display:inline-block"></span></td>
          <td style="font-weight:600">${esc(player.name)}</td>
          <td class="table__right num">#${esc(player.rank)}</td>
          <td class="table__right num">${num(player.points)}</td>
          <td class="table__right num"><span class="delta delta--${last - first > 0 ? 'up' : last - first < 0 ? 'down' : 'flat'}">${signed(last - first)}</span></td>
          <td class="table__right num">#${esc(trend?.seasonBestRank ?? player.rank)}</td>
          <td class="table__right num">${num(trend?.seasonPeakPoints ?? player.points)}</td>
        </tr>`;
    })
    .filter(Boolean)
    .join('');

  return `
    <section class="section">
      ${sectionHead(
        'Evolución semanal',
        `<div class="segmented" role="group" aria-label="Métrica del gráfico">
           <button type="button" class="segmented__btn" data-trend-mode="points" aria-pressed="${state.trendMode === 'points'}">Puntos</button>
           <button type="button" class="segmented__btn" data-trend-mode="rank" aria-pressed="${state.trendMode === 'rank'}">Puesto</button>
         </div>`,
      )}
      <p class="section__desc">
        Reconstrucción semana a semana del ranking oficial de la temporada ${esc(ranking.year)}
        (${esc(history.weeks.length)} publicaciones, de la semana ${esc(history.weeks[0])} a la ${esc(history.weeks.at(-1))}).
        Elige hasta ${MAX_PICKS} jugadores para compararlos.
      </p>

      <div class="card" style="margin-bottom:18px">
        <div class="picker-grid">
          ${selectable
            .map((player) => {
              const active = picks.includes(player.playerId);
              const color = active ? colorFor(player.playerId, picks) : 'var(--text-3)';
              return `<button type="button" class="picker-chip" style="--chip:${esc(color)}" aria-pressed="${active}" data-trend-pick="${esc(player.playerId)}">
                        <span class="picker-chip__dot"></span>#${esc(player.rank)} ${esc(shortName(player))}
                      </button>`;
            })
            .join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="chart chart--lg"><canvas id="chartTrends"></canvas></div>
      </div>

      <div class="card card--flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width:28px"></th>
                <th>Jugador</th>
                <th class="table__right">Puesto</th>
                <th class="table__right">Puntos</th>
                <th class="table__right">Balance temporada</th>
                <th class="table__right">Mejor puesto</th>
                <th class="table__right">Máximo de puntos</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="7">${empty('Selecciona al menos un jugador', '📈')}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </section>`;
}

export function mount() {
  const ranking = currentRanking();
  const history = currentHistory();
  if (!history || !history.weeks.length) return;

  const picks = state.trendPicks.length ? state.trendPicks : defaultPicks(ranking);

  const series = picks
    .map((playerId) => {
      const entry = history.players[playerId];
      const player = ranking.players.find((p) => p.playerId === playerId);
      if (!entry || !player) return null;

      return {
        label: shortName(player),
        values: state.trendMode === 'rank' ? entry.ranks : entry.points,
        color: colorFor(playerId, picks),
      };
    })
    .filter(Boolean);

  evolutionLine('chartTrends', { weeks: history.weeks, series, mode: state.trendMode });
}

export { MAX_PICKS };
