import { PALETTE, verticalBar } from '../charts.js';
import { empty, eventRow, kpi, sectionHead } from '../components.js';
import { esc, num } from '../format.js';
import { data, state } from '../store.js';

/** Ranking de títulos calculado sobre el archivo de finales acumulado. */
function titleBoard(events) {
  const counts = new Map();

  for (const event of events) {
    for (const winner of event.winners) {
      const entry = counts.get(winner.playerId) ?? { name: winner.name, country: winner.country, titles: 0, finals: 0 };
      entry.titles += 1;
      entry.finals += 1;
      counts.set(winner.playerId, entry);
    }
    for (const finalist of event.finalists) {
      const entry = counts.get(finalist.playerId) ?? { name: finalist.name, country: finalist.country, titles: 0, finals: 0 };
      entry.finals += 1;
      counts.set(finalist.playerId, entry);
    }
  }

  return [...counts.entries()]
    .map(([playerId, entry]) => ({ playerId, ...entry }))
    .sort((a, b) => b.titles - a.titles || b.finals - a.finals);
}

export function render() {
  const all = data.tournaments?.events ?? [];
  const events = all.filter((e) => e.gender === state.gender);
  const label = state.gender === 'female' ? 'femenino' : 'masculino';

  if (!events.length) {
    return `<section class="section">${sectionHead('Circuito')}${empty('Aún no hay finales registradas', '🏆')}</section>`;
  }

  const board = titleBoard(events);
  const byCategory = events.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + 1 }), {});
  const premier = events.filter((e) => /premier/i.test(e.circuit)).length;

  return `
    <section class="section">
      ${sectionHead(`Circuito ${label}`, `<span class="pill">${esc(events.length)} finales en archivo</span>`)}
      <p class="section__desc">
        La FIP solo publica las finales más recientes, así que el panel las va archivando en cada actualización:
        este historial crece con el tiempo en lugar de reiniciarse.
      </p>

      <div class="grid grid--kpi" style="margin-bottom:22px">
        ${kpi({ label: 'Finales archivadas', value: num(events.length), sub: `${premier} de Premier Padel`, icon: '🏆' })}
        ${kpi({ label: 'Campeones distintos', value: num(board.filter((p) => p.titles > 0).length), sub: 'Jugadores con al menos un título', icon: '🥇' })}
        ${kpi({ label: 'Categorías', value: num(Object.keys(byCategory).length), sub: Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(' · '), icon: '📋', small: true })}
        ${kpi({ label: 'Última final', value: esc(events[0].tournament), sub: esc(events[0].city), icon: '📍', small: true })}
      </div>

      <div class="card card--flush" style="margin-bottom:22px">
        ${events.slice(0, 20).map((e) => eventRow(e)).join('')}
      </div>
    </section>

    <section class="section grid grid--2">
      <div class="card">
        <div class="card__head"><h3 class="card__title">Jugadores con más títulos</h3></div>
        <p class="card__hint">Sobre el archivo de ${esc(events.length)} finales acumuladas.</p>
        <div class="chart chart--lg"><canvas id="chartTitles"></canvas></div>
      </div>
      <div class="card card--flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Jugador</th><th>País</th><th class="table__right">Títulos</th><th class="table__right">Finales</th><th class="table__right">Efectividad</th></tr>
            </thead>
            <tbody>
              ${board.slice(0, 14).map((p) => `
                <tr>
                  <td style="font-weight:600">${esc(p.name)}</td>
                  <td style="color:var(--text-2)">${esc(p.country ?? '—')}</td>
                  <td class="table__right"><span class="pill${p.titles ? ' pill--gold' : ''}">${esc(p.titles)}</span></td>
                  <td class="table__right num">${esc(p.finals)}</td>
                  <td class="table__right num">${p.finals ? `${Math.round((p.titles / p.finals) * 100)}%` : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}

export function mount() {
  const events = (data.tournaments?.events ?? []).filter((e) => e.gender === state.gender);
  if (!events.length) return;

  const board = titleBoard(events).filter((p) => p.titles > 0).slice(0, 10);
  if (!board.length) return;

  verticalBar('chartTitles', {
    labels: board.map((p) => p.name.split(' ').slice(0, 2).join(' ')),
    values: board.map((p) => p.titles),
    colors: board.map((_, i) => PALETTE[i % PALETTE.length]),
    unit: 'títulos',
    stepSize: 1,
  });
}
