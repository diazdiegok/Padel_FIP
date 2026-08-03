// Fragmentos HTML compartidos por las vistas.

import { deltaHtml, esc, flagHtml, num, photoHtml, rankBadge, shortName, tierStyle, fipDate } from './format.js';

export const sectionHead = (title, right = '') => `
  <div class="section__head">
    <h2 class="section__title">${esc(title)}</h2>
    <span class="section__spacer"></span>
    ${right}
  </div>`;

export const kpi = ({ label, value, sub, icon, small = false }) => `
  <div class="kpi">
    <div class="kpi__label">${esc(label)}</div>
    <div class="kpi__value${small ? ' kpi__value--sm' : ''}">${value}</div>
    ${sub ? `<div class="kpi__sub">${sub}</div>` : ''}
    ${icon ? `<div class="kpi__icon" aria-hidden="true">${icon}</div>` : ''}
  </div>`;

export const insightCard = (insight) => `
  <div class="insight">
    <div class="insight__icon" aria-hidden="true">${insight.icon}</div>
    <div class="insight__body">
      <div class="insight__title">${esc(insight.title)}</div>
      <div class="insight__value">${esc(insight.value)}</div>
      <div class="insight__detail">${esc(insight.detail)}</div>
    </div>
  </div>`;

export const podiumCard = (player, color) => `
  <button type="button" class="podium__card" style="--pc:${esc(color)}" data-player="${esc(player.playerId)}">
    ${photoHtml(player, 'podium__photo')}
    <div class="podium__body">
      <div class="podium__rank">#${esc(player.rank)} FIP</div>
      <div class="podium__name">${esc(player.name)}</div>
      <div class="podium__meta">
        ${flagHtml(player)}
        <span class="num">${num(player.points)} pts</span>
        ${deltaHtml(player.move, { compact: true })}
      </div>
    </div>
  </button>`;

export const pairCard = (pair, { top = false } = {}) => {
  // Cuando la dupla ha jugado todo junta ambos tienen la misma cifra; si no,
  // se muestra la media, que es la métrica por la que están ordenadas.
  const points = pair.sharedPoints ?? pair.avgPoints;
  const pointsLabel = pair.sharedPoints ? 'pts compartidos' : 'pts de media';

  return `
  <article class="pair${top ? ' pair--top' : ''}">
    <div class="pair__head">
      <div class="pair__photos">
        ${pair.players.map((p) => photoHtml(p, 'pair__photo')).join('')}
      </div>
      <div>
        <div class="pair__names">${pair.players.map((p) => esc(p.shortName)).join(' / ')}</div>
        <div class="pair__sub">${pair.countries.map(esc).join(' · ')} · mejor puesto #${esc(pair.rank)}</div>
      </div>
    </div>
    <div class="pair__points num">${num(points)} <span style="font-size:12px;color:var(--text-3)">${pointsLabel}</span></div>
    <div class="pair__foot">
      <span class="pill${top ? ' pill--gold' : ''}">Pareja #${esc(pair.pairRank)}</span>
      ${pair.titles ? `<span class="pill pill--accent">${esc(pair.titles)} ${pair.titles === 1 ? 'título' : 'títulos'}</span>` : ''}
      ${pair.combinedMove ? `<span class="pill">${deltaHtml(pair.combinedMove)} conjunto</span>` : ''}
    </div>
    <div class="pair__link">
      ${pair.players.map((p) => `<button type="button" class="btn btn--sm btn--ghost" data-player="${esc(p.playerId)}">#${esc(p.rank)} ${esc(p.shortName)} →</button>`).join('')}
    </div>
  </article>`;
};

export const eventRow = (event, { showGender = false } = {}) => {
  const names = (side) => side.map((p) => esc(p.name)).join(' / ') || '—';

  return `
  <div class="event">
    <div class="event__tier" style="${tierStyle(event.category)}">${esc(event.category)}</div>
    <div>
      <div class="event__name">${esc(event.tournament)}</div>
      <div class="event__meta">
        <span>${esc(event.city)}</span>
        <span>·</span>
        <span>${fipDate(event.date)}</span>
        <span class="pill">${esc(event.circuit)}</span>
        ${showGender ? `<span class="pill">${event.gender === 'female' ? 'Femenino' : 'Masculino'}</span>` : ''}
      </div>
      <div class="event__result">
        <span class="event__winner">🏆 ${names(event.winners)}</span>
        <span class="event__vs">vs</span>
        <span class="event__loser">${names(event.finalists)}</span>
      </div>
    </div>
    <div class="event__score">${esc(event.score || '—')}</div>
  </div>`;
};

export const playerCell = (player, sub = '') => `
  <div class="player-cell">
    ${photoHtml(player, 'player-cell__photo')}
    <div style="min-width:0">
      <div class="player-cell__name">${esc(player.name)}</div>
      ${sub ? `<div class="player-cell__sub">${sub}</div>` : ''}
    </div>
  </div>`;

export const countryRow = (country, index, maxPoints) => `
  <div class="country-row">
    <div class="country-row__pos">${index + 1}</div>
    <div>
      ${country.flag ? `<img class="flag" src="${esc(country.flag)}" alt="" loading="lazy" width="20" height="14">` : `<span class="flag--text">${esc(country.code)}</span>`}
    </div>
    <div>
      <div class="country-row__name">${esc(country.name)}</div>
      <div class="country-row__meta">${esc(country.players)} jugadores · mejor puesto #${esc(country.bestRank)} · ${esc(country.top10)} en el top 10</div>
      <div class="country-row__bar" style="margin-top:7px">
        <div class="country-row__fill" style="width:${((country.points / maxPoints) * 100).toFixed(1)}%;background:${esc(country.color)}"></div>
      </div>
    </div>
    <div class="country-row__val num">${num(country.points)}<div class="country-row__meta">${esc(country.share)}%</div></div>
  </div>`;

export const empty = (message, icon = '🔍') => `
  <div class="empty">
    <div class="empty__icon" aria-hidden="true">${icon}</div>
    <p>${esc(message)}</p>
  </div>`;

export { rankBadge, shortName };
