# FIP Analytics

Panel analítico del ranking oficial de la **Federación Internacional de Pádel**, alimentado en vivo
desde la API pública de [padelfip.com](https://www.padelfip.com/fip-rankings/).

No hay datos escritos a mano: todo lo que muestra el panel se descarga, se transforma y se valida
automáticamente.

## Qué incluye

- **200 jugadores por categoría** (masculino y femenino) con puesto, puntos y variación semanal.
- **Histórico semanal reconstruido** de toda la temporada, con gráficos de evolución de puntos y puesto.
- **Parejas activas** deducidas de la ficha oficial de cada jugador y del empate de puntos del ranking.
- **Análisis por federación**: cuota de puntos, presencia en el top 10 y media por jugador.
- **Archivo de finales** de Premier Padel y Cupra FIP Tour, que crece en cada actualización.
- **Fichas de jugador** con estadísticas reales de carrera (balance, títulos, mejor racha).
- **Comparador** de dos jugadores con radar normalizado y evolución superpuesta.
- Tema claro/oscuro, enlaces compartibles, exportación a CSV y refresco automático en segundo plano.

## Puesta en marcha

```bash
npm run update   # descarga los datos de la FIP y genera /data
npm run check    # valida que los datos son coherentes
npm run dev      # sirve el panel en http://localhost:3000
```

> El panel lee los JSON por `fetch`, así que hay que servirlo por HTTP.
> Si abres `index.html` directamente desde el disco, el navegador bloqueará la carga
> y la propia página te lo indicará.

## Cómo se actualiza

`scripts/update-data.mjs` es el único punto de entrada de datos:

1. Detecta la semana de ranking vigente en padelfip.com.
2. Descarga el ranking maestro de ambas categorías (`/wp-json/fip/v1/ranking/load-more`).
3. Completa las semanas del histórico que falten. Solo pide las nuevas, así que la
   actualización diaria son un par de peticiones en lugar de sesenta.
4. Archiva las finales recientes (`/wp-json/fip/v1/circuit-stats`) sin borrar las anteriores.
5. Refresca las fichas ampliadas del top 20 cada seis días.
6. Deriva parejas, países, tendencias e insights, y escribe `/data`.

En producción lo lanza GitHub Actions cada día a las 06:00 UTC
(`.github/workflows/update-data.yml`). El workflow valida los datos antes de publicarlos y solo
hace commit si algo ha cambiado. También se puede lanzar a mano desde la pestaña *Actions*,
con la opción de reconstruir el histórico completo.

Con la pestaña abierta, el panel consulta `data/meta.json` cada cinco minutos y se recarga solo
cuando detecta una versión nueva.

## Estructura

| Ruta | Contenido |
|------|-----------|
| `index.html` | Esqueleto de la página y barra de filtros |
| `assets/css/styles.css` | Tokens de diseño, componentes y temas |
| `assets/js/main.js` | Arranque, enrutado por pestañas y eventos |
| `assets/js/store.js` | Estado, carga de datos y refresco automático |
| `assets/js/charts.js` | Fábricas de Chart.js |
| `assets/js/views/` | Una vista por pestaña |
| `scripts/lib/fip-api.mjs` | Cliente de la API de la FIP |
| `scripts/lib/transform.mjs` | Parejas, países, tendencias e insights |
| `scripts/update-data.mjs` | ETL |
| `scripts/check-data.mjs` | Validación del dataset |
| `data/` | JSON generados (se versionan) |

## Datos generados

| Archivo | Contenido |
|---------|-----------|
| `meta.json` | Temporada, semana y sello de generación |
| `ranking-{male,female}.json` | Ranking, parejas, países, tendencias, insights |
| `history-{male,female}.json` | Serie semanal de puesto y puntos |
| `tournaments.json` | Archivo acumulado de finales |
| `profiles.json` | Fichas ampliadas del top 20 |

## Notas sobre los datos

- La FIP **no publica un ranking de parejas**. Las duplas se ordenan por la media de puntos de sus
  dos miembros, que coincide con la cifra compartida cuando han jugado toda la temporada juntos.
- `circuit-stats` solo devuelve las finales más recientes; por eso el panel las archiva en vez de
  reemplazarlas, y el recuento de títulos crece a medida que pasan las semanas.
- Algunas semanas no tienen publicación oficial. El ETL las recuerda como vacías para no volver a
  pedirlas, y los gráficos usan el número real de semana en el eje.
- Las estadísticas de carrera se leen de la ficha pública de cada jugador, que distingue entre el
  bloque de la temporada y el de la carrera completa.

## Despliegue

Es un sitio estático sin build. Sirve la carpeta tal cual, o actívala en GitHub Pages desde la rama
`main`. El workflow de datos se encarga de mantener `/data` al día.

## Fuente

Datos oficiales de la [Federación Internacional de Pádel](https://www.padelfip.com/fip-rankings/).
Proyecto sin relación oficial con la FIP ni con Premier Padel.
