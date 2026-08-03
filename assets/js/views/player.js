import { PALETTE, evolutionLine } from '../charts.js';
import { empty, eventRow, sectionHead } from '../components.js';
import { deltaHtml, esc, flagHtml, num, photoHtml, signed } from '../format.js';
import { currentHistory, currentRanking, data, profileFor, state } from '../store.js';

const stat = (value, label, { text = false } = {}) => `
  <div class="stat">
    <div class="stat__val${text ? ' stat__val--text' : ''}">${value}</div>
    <div class="stat__lbl">${esc(label)}</div>
  </div>`;

export function render() {
  const ranking = currentRanking();
  const player = ranking.players.find((p) => p.playerId === state.player);

  if (!player) {
    return `<section class="section">${sectionHead('Ficha de jugador')}${empty('Jugador no encontrado en esta categoría', '🙁')}</section>`;
  }

  const trend = ranking.trends[player.playerId];
  const partner = ranking.partners[player.playerId];
  const profile = profileFor(player.playerId);
  const color = PALETTE[player.rank % PALETTE.length];

  const events = (data.tournaments?.events ?? []).filter((event) =>
    [...event.winners, ...event.finalists].some((side) => side.playerId === player.playerId),
  );

  const seasonStats = [
    stat(`#${esc(player.rank)}`, 'Puesto actual'),
    stat(num(player.points), 'Puntos FIP'),
    stat(deltaHtml(player.move), 'Variación semanal'),
    trend?.points4w != null ? stat(signed(trend.points4w), 'Puntos 4 semanas') : '',
    trend?.points12w != null ? stat(signed(trend.points12w), 'Puntos 12 semanas') : '',
    trend?.seasonBestRank ? stat(`#${esc(trend.seasonBestRank)}`, 'Mejor puesto temporada') : '',
    trend?.seasonPeakPoints ? stat(num(trend.seasonPeakPoints), 'Máximo de puntos') : '',
    profile?.season?.raceRank ? stat(`#${esc(profile.season.raceRank)}`, `Race ${esc(profile.season.year)}`) : '',
  ].filter(Boolean).join('');

  const careerStats = profile?.career
    ? [
        profile.career.bestRank ? stat(`#${esc(profile.career.bestRank)}`, 'Mejor puesto histórico') : '',
        profile.career.wins != null ? stat(`${esc(profile.career.wins)}-${esc(profile.career.losses)}`, 'Balance de carrera', { text: true }) : '',
        profile.career.winRate != null ? stat(`${esc(profile.career.winRate)}%`, 'Victorias') : '',
        profile.career.titles != null ? stat(esc(profile.career.titles), 'Títulos de carrera') : '',
        profile.career.consecutiveWins != null ? stat(esc(profile.career.consecutiveWins), 'Mejor racha') : '',
        profile.season?.titles != null ? stat(esc(profile.season.titles), `Títulos ${esc(profile.season.year)}`) : '',
      ].filter(Boolean).join('')
    : '';

  return `
    <button type="button" class="btn btn--ghost btn--sm" data-action="back" style="margin-bottom:16px">← Volver al ranking</button>

    <section class="profile" style="--pc:${esc(color)}">
      ${photoHtml({ ...player, portrait: profile?.portrait }, 'profile__photo', { big: true })}
      <div>
        <h1 class="profile__name">${esc(player.name)}</h1>
        <div class="profile__tags">
          <span class="pill pill--accent">#${esc(player.rank)} del ranking FIP</span>
          <span class="pill">${flagHtml(player)} ${esc(player.country)}</span>
          <span class="pill">${num(player.points)} puntos</span>
          ${partner
            ? partner.playerId
              // Solo es navegable si el compañero está dentro del ranking cargado.
              ? `<button type="button" class="pill" data-player="${esc(partner.playerId)}">🤝 ${esc(partner.name)}</button>`
              : `<span class="pill">🤝 ${esc(partner.name)}</span>`
            : ''}
          ${player.url ? `<a class="pill" href="${esc(player.url)}" target="_blank" rel="noopener">Ficha oficial ↗</a>` : ''}
        </div>
      </div>
    </section>

    <section class="section">
      ${sectionHead(`Temporada ${esc(ranking.year)}`)}
      <div class="stat-grid">${seasonStats}</div>
    </section>

    ${careerStats
      ? `<section class="section">
          ${sectionHead('Carrera', '<span class="pill">Datos de la ficha oficial FIP</span>')}
          <div class="stat-grid">${careerStats}</div>
        </section>`
      : `<section class="section">
          ${sectionHead('Carrera')}
          <div class="card"><p class="card__hint" style="margin:0">
            El panel solo descarga la ficha ampliada de los primeros puestos del ranking.
            ${player.url ? `Puedes consultarla en <a href="${esc(player.url)}" target="_blank" rel="noopener">padelfip.com</a>.` : ''}
          </p></div>
        </section>`}

    <section class="section">
      ${sectionHead('Evolución en la temporada')}
      <div class="card">
        <p class="card__hint">Puntos FIP semana a semana según las publicaciones oficiales del ranking.</p>
        <div class="chart chart--lg"><canvas id="chartPlayerEvolution"></canvas></div>
      </div>
    </section>

    <section class="section">
      ${sectionHead('Finales en el archivo', `<span class="pill">${esc(events.length)}</span>`)}
      <div class="card card--flush">
        ${events.length ? events.map((e) => eventRow(e, { showGender: false })).join('') : empty('Sin finales registradas para este jugador', '🎾')}
      </div>
    </section>`;
}

export function mount() {
  const history = currentHistory();
  const entry = history?.players?.[state.player];
  if (!entry) return;

  const ranking = currentRanking();
  const player = ranking.players.find((p) => p.playerId === state.player);
  if (!player) return;

  evolutionLine('chartPlayerEvolution', {
    weeks: history.weeks,
    series: [{ label: player.name, values: entry.points, color: PALETTE[player.rank % PALETTE.length] }],
    mode: 'points',
  });
}
