import { countryDoughnut, verticalBar } from '../charts.js';
import { countryRow, empty, sectionHead } from '../components.js';
import { esc, num } from '../format.js';
import { currentRanking, state } from '../store.js';

const CHART_LIMIT = 12;

export function render() {
  const ranking = currentRanking();
  const countries = ranking.countries;
  const label = state.gender === 'female' ? 'femenino' : 'masculino';

  if (!countries.length) {
    return `<section class="section">${sectionHead('Análisis por país')}${empty('Sin datos de países', '🌍')}</section>`;
  }

  const maxPoints = countries[0].points;
  const totalPlayers = countries.reduce((sum, c) => sum + c.players, 0);

  return `
    <section class="section">
      ${sectionHead(`Análisis por país · circuito ${label}`, `<span class="pill">${esc(countries.length)} federaciones</span>`)}
      <p class="section__desc">
        Reparto de los ${esc(totalPlayers)} jugadores seguidos entre federaciones. El porcentaje mide la cuota de
        puntos, no el número de jugadores: un país puede tener pocos representantes y mucho peso si están arriba.
      </p>

      <div class="grid grid--wide">
        <div class="card card--flush">
          ${countries.map((country, i) => countryRow(country, i, maxPoints)).join('')}
        </div>
        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card">
            <div class="card__head"><h3 class="card__title">Cuota de puntos</h3></div>
            <div class="chart"><canvas id="chartCountryShare"></canvas></div>
          </div>
          <div class="card">
            <div class="card__head"><h3 class="card__title">Jugadores en el top 10</h3></div>
            <p class="card__hint">Presencia de cada federación en la élite.</p>
            <div class="chart chart--sm"><canvas id="chartCountryTop10"></canvas></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section grid grid--2">
      <div class="card">
        <div class="card__head"><h3 class="card__title">Jugadores por federación</h3></div>
        <div class="chart"><canvas id="chartCountryPlayers"></canvas></div>
      </div>
      <div class="card">
        <div class="card__head"><h3 class="card__title">Puntos medios por jugador</h3></div>
        <p class="card__hint">Indica la calidad media del grupo, al margen de cuántos jugadores aporte cada país.</p>
        <div class="chart"><canvas id="chartCountryAvg"></canvas></div>
      </div>
    </section>`;
}

export function mount() {
  const countries = currentRanking().countries;
  if (!countries.length) return;

  countryDoughnut('chartCountryShare', countries);

  const top10 = countries.filter((c) => c.top10 > 0).slice(0, CHART_LIMIT);
  if (top10.length) {
    verticalBar('chartCountryTop10', {
      labels: top10.map((c) => c.code),
      values: top10.map((c) => c.top10),
      colors: top10.map((c) => c.color),
      unit: 'jugadores',
      stepSize: 1,
    });
  }

  const byPlayers = [...countries].sort((a, b) => b.players - a.players).slice(0, CHART_LIMIT);
  verticalBar('chartCountryPlayers', {
    labels: byPlayers.map((c) => c.code),
    values: byPlayers.map((c) => c.players),
    colors: byPlayers.map((c) => c.color),
    unit: 'jugadores',
    stepSize: 5,
  });

  // Con un solo jugador la media es su propia puntuación y distorsiona la lectura.
  const byAvg = countries.filter((c) => c.players >= 2).sort((a, b) => b.avgPoints - a.avgPoints).slice(0, CHART_LIMIT);
  verticalBar('chartCountryAvg', {
    labels: byAvg.map((c) => c.code),
    values: byAvg.map((c) => c.avgPoints),
    colors: byAvg.map((c) => c.color),
    unit: 'pts de media',
  });
}
