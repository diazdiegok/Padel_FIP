import { PALETTE, compareRadar, evolutionLine } from '../charts.js';
import { empty, sectionHead } from '../components.js';
import { esc, num, photoHtml, shortName, signed } from '../format.js';
import { currentHistory, currentRanking, profileFor, state } from '../store.js';

const COLORS = [PALETTE[0], PALETTE[1]];

const clamp = (value) => Math.max(0, Math.min(100, value));

/** Ejes del radar, normalizados a 0-100 y solo con métricas disponibles para ambos. */
function radarAxes(a, b) {
  const ranking = currentRanking();
  const leaderPoints = ranking.players[0]?.points || 1;
  const depth = ranking.players.length;

  const trendA = ranking.trends[a.playerId];
  const trendB = ranking.trends[b.playerId];
  const profileA = profileFor(a.playerId);
  const profileB = profileFor(b.playerId);

  const axes = [
    { label: 'Puntos FIP', a: (a.points / leaderPoints) * 100, b: (b.points / leaderPoints) * 100 },
    { label: 'Puesto actual', a: ((depth - a.rank) / depth) * 100, b: ((depth - b.rank) / depth) * 100 },
    {
      label: 'Mejor puesto',
      a: ((depth - (trendA?.seasonBestRank ?? a.rank)) / depth) * 100,
      b: ((depth - (trendB?.seasonBestRank ?? b.rank)) / depth) * 100,
    },
    // 50 = sin cambios; cada posición ganada suma 2,5 puntos al eje.
    {
      label: 'Progresión 12 sem',
      a: 50 + (trendA?.rank12w ?? 0) * 2.5,
      b: 50 + (trendB?.rank12w ?? 0) * 2.5,
    },
  ];

  if (profileA?.career?.winRate != null && profileB?.career?.winRate != null) {
    axes.push({ label: '% victorias', a: profileA.career.winRate, b: profileB.career.winRate });
  }

  if (profileA?.career?.titles != null && profileB?.career?.titles != null) {
    const max = Math.max(profileA.career.titles, profileB.career.titles, 1);
    axes.push({ label: 'Títulos carrera', a: (profileA.career.titles / max) * 100, b: (profileB.career.titles / max) * 100 });
  }

  return axes.map((axis) => ({ ...axis, a: clamp(axis.a), b: clamp(axis.b) }));
}

function statRows(a, b) {
  const ranking = currentRanking();
  const trendA = ranking.trends[a.playerId];
  const trendB = ranking.trends[b.playerId];
  const profileA = profileFor(a.playerId);
  const profileB = profileFor(b.playerId);

  const rows = [
    { label: 'Puesto FIP', a: a.rank, b: b.rank, better: 'lower', render: (v) => `#${v}` },
    { label: 'Puntos', a: a.points, b: b.points, better: 'higher', render: num },
    { label: 'País', a: a.country, b: b.country },
    { label: 'Variación semanal', a: a.move, b: b.move, better: 'higher', render: signed },
    { label: 'Puntos 4 semanas', a: trendA?.points4w, b: trendB?.points4w, better: 'higher', render: signed },
    { label: 'Puntos 12 semanas', a: trendA?.points12w, b: trendB?.points12w, better: 'higher', render: signed },
    { label: 'Mejor puesto temporada', a: trendA?.seasonBestRank, b: trendB?.seasonBestRank, better: 'lower', render: (v) => `#${v}` },
    { label: 'Máximo de puntos', a: trendA?.seasonPeakPoints, b: trendB?.seasonPeakPoints, better: 'higher', render: num },
    { label: 'Mejor puesto histórico', a: profileA?.career?.bestRank, b: profileB?.career?.bestRank, better: 'lower', render: (v) => `#${v}` },
    { label: 'Balance de carrera', a: profileA?.career && `${profileA.career.wins}-${profileA.career.losses}`, b: profileB?.career && `${profileB.career.wins}-${profileB.career.losses}` },
    { label: '% de victorias', a: profileA?.career?.winRate, b: profileB?.career?.winRate, better: 'higher', render: (v) => `${v}%` },
    { label: 'Títulos de carrera', a: profileA?.career?.titles, b: profileB?.career?.titles, better: 'higher' },
    { label: `Títulos ${ranking.year}`, a: profileA?.season?.titles, b: profileB?.season?.titles, better: 'higher' },
  ];

  return rows
    .filter((row) => row.a !== undefined && row.a !== null && row.b !== undefined && row.b !== null)
    .map((row) => {
      const show = (value) => esc(row.render && typeof value === 'number' ? row.render(value) : value);

      let winnerA = false;
      let winnerB = false;
      if (row.better && typeof row.a === 'number' && typeof row.b === 'number' && row.a !== row.b) {
        const aWins = row.better === 'higher' ? row.a > row.b : row.a < row.b;
        winnerA = aWins;
        winnerB = !aWins;
      }

      return `
        <div class="compare-row">
          <span class="compare-row__val${winnerA ? ' is-better' : ''}">${show(row.a)}</span>
          <span class="compare-row__label">${esc(row.label)}</span>
          <span class="compare-row__val${winnerB ? ' is-better' : ''}">${show(row.b)}</span>
        </div>`;
    })
    .join('');
}

const optionsFor = (selected) =>
  currentRanking()
    .players.slice(0, 100)
    .map((p) => `<option value="${esc(p.playerId)}"${p.playerId === selected ? ' selected' : ''}>#${esc(p.rank)} ${esc(p.name)}</option>`)
    .join('');

export function render() {
  const ranking = currentRanking();
  const [idA, idB] = state.compare;
  const a = ranking.players.find((p) => p.playerId === idA);
  const b = ranking.players.find((p) => p.playerId === idB);
  const ready = a && b && a.playerId !== b.playerId;

  const picker = `
    <div class="compare-picker">
      <div>
        <label class="sidebar__title" for="compareA">Jugador A</label>
        <select class="input" id="compareA" data-compare="0" style="margin-top:6px">
          <option value="">— Elegir jugador —</option>${optionsFor(idA)}
        </select>
      </div>
      <div>
        <label class="sidebar__title" for="compareB">Jugador B</label>
        <select class="input" id="compareB" data-compare="1" style="margin-top:6px">
          <option value="">— Elegir jugador —</option>${optionsFor(idB)}
        </select>
      </div>
    </div>`;

  if (!ready) {
    return `
      <section class="section">
        ${sectionHead('Comparador de jugadores')}
        <p class="section__desc">Elige dos jugadores para enfrentar sus métricas de temporada y de carrera.</p>
        ${picker}
        ${empty(a && b ? 'Selecciona dos jugadores distintos' : 'Selecciona dos jugadores para empezar', '🔀')}
      </section>`;
  }

  return `
    <section class="section">
      ${sectionHead('Comparador de jugadores')}
      <p class="section__desc">
        Comparativa directa sobre datos oficiales. Las filas resaltadas en color señalan al jugador que va por
        delante en cada métrica; las estadísticas de carrera solo están disponibles para la élite del ranking.
      </p>
      ${picker}

      <div class="compare-head">
        <div class="compare-head__side" style="--pc:${COLORS[0]}">
          ${photoHtml({ ...a, portrait: profileFor(a.playerId)?.portrait }, 'compare-head__photo', { big: true })}
          <div>
            <div class="compare-head__name">${esc(a.name)}</div>
            <div class="pill" style="margin-top:6px">#${esc(a.rank)} · ${esc(a.country)}</div>
          </div>
        </div>
        <div class="compare-head__vs">VS</div>
        <div class="compare-head__side" style="--pc:${COLORS[1]}">
          ${photoHtml({ ...b, portrait: profileFor(b.playerId)?.portrait }, 'compare-head__photo', { big: true })}
          <div>
            <div class="compare-head__name">${esc(b.name)}</div>
            <div class="pill" style="margin-top:6px">#${esc(b.rank)} · ${esc(b.country)}</div>
          </div>
        </div>
      </div>

      <div class="card card--flush" style="margin-bottom:18px">${statRows(a, b)}</div>

      <div class="grid grid--2">
        <div class="card">
          <div class="card__head"><h3 class="card__title">Perfil comparado</h3></div>
          <p class="card__hint">Todos los ejes se normalizan de 0 a 100 para poder superponerlos.</p>
          <div class="chart chart--lg"><canvas id="chartCompareRadar"></canvas></div>
        </div>
        <div class="card">
          <div class="card__head"><h3 class="card__title">Puntos a lo largo de la temporada</h3></div>
          <p class="card__hint">Evolución semanal de ambos jugadores en ${esc(ranking.year)}.</p>
          <div class="chart chart--lg"><canvas id="chartCompareLine"></canvas></div>
        </div>
      </div>
    </section>`;
}

export function mount() {
  const ranking = currentRanking();
  const [idA, idB] = state.compare;
  const a = ranking.players.find((p) => p.playerId === idA);
  const b = ranking.players.find((p) => p.playerId === idB);
  if (!a || !b || a.playerId === b.playerId) return;

  const axes = radarAxes(a, b);
  compareRadar('chartCompareRadar', {
    axes: axes.map((x) => x.label),
    series: [
      { label: shortName(a), values: axes.map((x) => x.a), color: COLORS[0] },
      { label: shortName(b), values: axes.map((x) => x.b), color: COLORS[1] },
    ],
  });

  const history = currentHistory();
  if (!history?.weeks?.length) return;

  const series = [
    { player: a, color: COLORS[0] },
    { player: b, color: COLORS[1] },
  ]
    .map(({ player, color }) => {
      const entry = history.players[player.playerId];
      return entry ? { label: shortName(player), values: entry.points, color } : null;
    })
    .filter(Boolean);

  if (series.length) evolutionLine('chartCompareLine', { weeks: history.weeks, series, mode: 'points' });
}
