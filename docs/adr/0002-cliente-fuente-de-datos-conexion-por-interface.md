# El cliente de la Fuente de datos recibe su Conexión por la interface

Contexto: `igdb.js` leía `doc.connection.workerUrl` desde el store global dentro de sus propias funciones, así que la interface `searchGames(query)` escondía una dependencia (los tests necesitaban sembrar el doc para poder probar el cliente). Decisión: factory `createDataSource(readConnection)` que devuelve `{ workerUrl, isConfigured, searchGames, fetchNovedades }`; la instancia de producción (`igdb`) lee del doc, y las pruebas construyen clientes con URL fija. Rechazada la alternativa de un parámetro opcional al final de cada función: habría dejado oculta la dependencia en el caso por defecto.

## Consequences

- El módulo ya no importa nada del estado de la app salvo el adapter de producción; `tests/support/connection.js` sobrevive como único fijador del estado de Conexión para los flujos de vista, pero los tests unitarios del cliente no lo necesitan.
- Cualquier futuro consumidor que no sea una vista pasa explícitamente su propia conexión o usa el adapter `igdb`, sin estados globales intermedios.
