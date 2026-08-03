import { empty, playerCell, rankBadge, sectionHead } from '../components.js';
import { deltaHtml, downloadCsv, esc, flagHtml, num, signed, sparkline } from '../format.js';
import { currentRanking, sortedPlayers, state } from '../store.js';

const COLUMNS = [
  { key: 'rank', label: '#', sortable: true, align: '' },
  { key: 'move', label: 'Δ sem', sortable: true, align: 'table__center' },
  { key: 'name', label: 'Jugador', sortable: true, align: '' },
  { key: 'country', label: 'País', sortable: true, align: '' },
  { key: 'points', label: 'Puntos', sortable: true, align: 'table__right' },
  { key: 'trend', label: '4 sem', sortable: true, align: 'table__right' },
  { key: 'spark', label: 'Tendencia 12 sem', sortable: false, align: '' },
  { key: 'partner', label: 'Pareja', sortable: false, align: '' },
];

function headerCell(column) {
  if (!column.sortable) return `<th class="${column.align}">${esc(column.label)}</th>`;

  const isActive = state.sort.key === column.key;
  const ariaSort = isActive ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

  return `<th class="${column.align}" aria-sort="${ariaSort}" data-sort="${esc(column.key)}" title="Ordenar por ${esc(column.label)}">${esc(column.label)}</th>`;
}

function row(player, ranking) {
  const trend = ranking.trends[player.playerId];
  const partner = ranking.partners[player.playerId];
  const delta4w = trend?.points4w;

  const deltaCell = delta4w === null || delta4w === undefined
    ? '<span class="delta delta--flat">–</span>'
    : `<span class="delta delta--${delta4w > 0 ? 'up' : delta4w < 0 ? 'down' : 'flat'} num">${signed(delta4w)}</span>`;

  return `
    <tr data-player="${esc(player.playerId)}" tabindex="0">
      <td>${rankBadge(player.rank)}</td>
      <td class="table__center">${deltaHtml(player.move)}</td>
      <td>${playerCell(player, trend?.seasonBestRank && trend.seasonBestRank < player.rank ? `Mejor de la temporada: #${esc(trend.seasonBestRank)}` : '')}</td>
      <td><span class="country-cell">${flagHtml(player)}<span>${esc(player.country)}</span></span></td>
      <td class="table__right num" style="font-weight:700;color:var(--accent)">${num(player.points)}</td>
      <td class="table__right">${deltaCell}</td>
      <td>${sparkline(trend?.spark, 'auto')}</td>
      <td style="font-size:12px;color:var(--text-2)">${partner ? esc(partner.name) : '—'}</td>
    </tr>`;
}

export function render() {
  const ranking = currentRanking();
  const players = sortedPlayers();
  const label = state.gender === 'female' ? 'femenino' : 'masculino';

  return `
    <section class="section">
      ${sectionHead(
        `Ranking FIP ${label}`,
        `<span class="pill">${esc(players.length)} de ${esc(ranking.players.length)}</span>
         <button type="button" class="btn btn--sm" data-action="export-csv">⬇ Exportar CSV</button>`,
      )}
      <p class="section__desc">
        Clasificación oficial de la semana ${esc(ranking.week)} de ${esc(ranking.year)}. Pulsa una cabecera para
        reordenar o una fila para abrir la ficha del jugador. La columna «4 sem» compara los puntos actuales con
        los de hace un mes.
      </p>

      <div class="card card--flush">
        ${players.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead><tr>${COLUMNS.map(headerCell).join('')}</tr></thead>
                <tbody>${players.map((p) => row(p, ranking)).join('')}</tbody>
              </table>
            </div>`
          : empty('Ningún jugador coincide con los filtros aplicados')}
      </div>
    </section>`;
}

export function mount() {}

/** Exporta exactamente lo que la tabla muestra en pantalla. */
export function exportCsv() {
  const ranking = currentRanking();
  const players = sortedPlayers();

  downloadCsv(
    `ranking-fip-${state.gender}-${ranking.year}-s${ranking.week}.csv`,
    ['Puesto', 'Jugador', 'País', 'Puntos', 'Variación semanal', 'Variación 4 semanas', 'Pareja'],
    players.map((p) => [
      p.rank,
      p.name,
      p.country,
      p.points,
      p.move,
      ranking.trends[p.playerId]?.points4w ?? '',
      ranking.partners[p.playerId]?.name ?? '',
    ]),
  );
}
