import { PALETTE, verticalBar } from '../charts.js';
import { empty, pairCard, sectionHead } from '../components.js';
import { esc, num } from '../format.js';
import { currentRanking, state } from '../store.js';

const CHART_LIMIT = 10;

export function render() {
  const ranking = currentRanking();
  const pairs = ranking.pairs;
  const label = state.gender === 'female' ? 'femenino' : 'masculino';

  if (!pairs.length) {
    return `<section class="section">${sectionHead('Parejas activas')}${empty('No se han detectado parejas en esta categoría', '🤝')}</section>`;
  }

  const titled = pairs.filter((p) => p.titles > 0);

  return `
    <section class="section">
      ${sectionHead(`Parejas activas · circuito ${label}`, `<span class="pill">${esc(pairs.length)} duplas</span>`)}
      <p class="section__desc">
        Una dupla se da por activa cuando ambos jugadores se señalan mutuamente como compañeros: primero según
        su ficha oficial en la FIP y, si no consta, por empate exacto de puesto y puntos. Como la FIP no publica
        un ranking de parejas, se ordenan por la media de puntos de sus dos miembros.
      </p>
      <div class="grid grid--3">
        ${pairs.slice(0, 12).map((pair, i) => pairCard(pair, { top: i === 0 })).join('')}
      </div>
    </section>

    <section class="section grid grid--2">
      <div class="card">
        <div class="card__head"><h3 class="card__title">Puntos por pareja</h3></div>
        <p class="card__hint">Las ${CHART_LIMIT} duplas más fuertes, según la media de puntos de sus miembros.</p>
        <div class="chart chart--lg"><canvas id="chartPairs"></canvas></div>
      </div>
      <div class="card">
        <div class="card__head"><h3 class="card__title">Distancia hasta el liderato</h3></div>
        <p class="card__hint">Puntos que le faltan a cada pareja para alcanzar a la primera.</p>
        <div class="chart chart--lg"><canvas id="chartPairGap"></canvas></div>
      </div>
    </section>

    ${titled.length
      ? `<section class="section">
          ${sectionHead('Parejas con títulos registrados')}
          <div class="card card--flush">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Pareja</th><th>Países</th><th class="table__right">Puntos (media)</th><th class="table__right">Títulos</th></tr>
                </thead>
                <tbody>
                  ${titled.map((pair) => `
                    <tr>
                      <td style="font-weight:600">${pair.players.map((p) => esc(p.shortName)).join(' / ')}</td>
                      <td style="color:var(--text-2)">${pair.countries.map(esc).join(' · ')}</td>
                      <td class="table__right num">${num(pair.avgPoints)}</td>
                      <td class="table__right"><span class="pill pill--gold">${esc(pair.titles)}</span></td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>`
      : ''}`;
}

export function mount() {
  const pairs = currentRanking().pairs.slice(0, CHART_LIMIT);
  if (!pairs.length) return;

  const labels = pairs.map((p) => p.players.map((x) => x.shortName).join('/'));

  verticalBar('chartPairs', {
    labels,
    values: pairs.map((p) => p.avgPoints),
    colors: pairs.map((_, i) => PALETTE[i % PALETTE.length]),
    unit: 'pts',
  });

  const leaderPoints = pairs[0].avgPoints;
  verticalBar('chartPairGap', {
    labels,
    values: pairs.map((p) => leaderPoints - p.avgPoints),
    colors: pairs.map((_, i) => (i === 0 ? PALETTE[1] : 'rgba(148,163,184,.55)')),
    unit: 'pts de diferencia',
  });
}
