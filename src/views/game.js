/**
 * Ficha de un Juego (ticket 17, spec §8.5): datos compartidos consultables y
 * editables en línea más todas sus Jugadas juntas. Se renderiza dentro de la
 * superficie de Biblioteca cuando `library.gameId` está fijado; las reglas de
 * edición de datos compartidos dependen del origen: título y etiquetas propias
 * siempre editables; géneros, plataformas, carátula, descripción y capturas
 * solo si el alta fue manual (sin `igdbId`).
 */
import { html, qs, qsa, raw } from '../lib/dom.js';
import { formatError } from '../lib/errors.js';
import { formatClock, formatRoundedHours, parseClock } from '../lib/format.js';
import { STATUSES, STATUS_LABELS } from '../domain/schema.js';
import { latestPlay, gameStatus, livePlaySeconds } from '../domain/selectors.js';
import {
  addPlay,
  commitSharedField as commitSharedFieldCommand,
  commitTitle as commitTitleCommand,
  confirmSegment,
  deleteGame,
  deletePlay,
  discardSegment,
  pauseCounter,
  rateHero,
  ratePlay,
  setPlayDate,
  setPlayNotes,
  setPlayPlatform,
  setPlayTime as setPlayTimeCommand,
  setStatus,
  startCounter,
} from '../data/ficha.js';
import { coverHtml } from '../ui/cover.js';
import { statusPillHtml } from '../ui/pill.js';
import { addTag, removeTag, tagEditorHtml } from '../ui/tags.js';
import { galleryHtml, wireGallery } from '../ui/gallery.js';
import { subscribeTick } from '../ui/tick.js';
import * as nav from '../navigation.js';
import { freshFicha } from '../app.js';

/**
 * Limpieza de la suscripción al tictac del reloj vivo: una sola a la vez
 * (módulo); se cancela en cada render y se auto-cancela sin contenedor.
 * @type {(() => void) | null}
 */
let tickOff = null;

/**
 * Jugadas ordenadas de más reciente a más antigua: desc por `addedAt`,
 * desempate por posición en el array (las nuevas se añaden al final).
 * @param {import('../domain/schema.js').Game} game
 * @returns {import('../domain/schema.js').Play[]}
 */
function playsNewestFirst(game) {
  return game.plays
    .map((play, idx) => ({ play, idx }))
    .sort((a, b) => b.play.addedAt.localeCompare(a.play.addedAt) || b.idx - a.idx)
    .map((entry) => entry.play);
}

/**
 * ¿El Contador está anclado a esta jugada?
 * @param {import('../domain/schema.js').Doc} doc
 * @param {string} gameId
 * @param {import('../domain/schema.js').Play} play
 * @returns {boolean}
 */
function countingPlay(doc, gameId, play) {
  const counter = doc.counter;
  return Boolean(counter && counter.gameId === gameId && counter.playId === play.id);
}

/**
 * Total vivo de una jugada (selector de dominio: Tiempo jugado consolidado
 * más el tramo en marcha si el Contador está anclado a ella). Cálculo
 * efímero: el Doc no se escribe por segundo.
 * @param {import('../domain/schema.js').Doc} doc
 * @param {import('../domain/schema.js').Play} play
 * @param {number} nowMs
 * @returns {number}
 */
function liveTotalSeconds(doc, play, nowMs) {
  return livePlaySeconds(play, doc.counter, new Date(nowMs));
}

/**
 * Línea «Tiempo: …» de una jugada: reloj vivo H:MM:SS mientras el Contador
 * cuenta su tramo (elemento `data-live-time`), dato histórico redondo si no y
 * el lápiz de corrección siempre visible (ADR-0012). El héroe repite la fila
 * de la jugada más reciente, así que el editor inline solo se pinta en la
 * fila ORIGEN del lápiz pulsado (`ficha.editTimeRow`): un solo campo en el
 * DOM y el otro lápiz de la misma jugada revela/foca el abierto. El editor
 * sustituye al valor de su fila (y por tanto a su reloj vivo y a su lápiz).
 * @param {import('../domain/schema.js').Doc} doc
 * @param {string} gameId
 * @param {import('../domain/schema.js').Play} play
 * @param {import('../app.js').FichaUi} ficha
 * @param {'hero'|'card'} row fila cuyo lápiz puede abrir el editor
 * @returns {string}
 */
function playTimeHtml(doc, gameId, play, ficha, row) {
  if (ficha.editTime === play.id && ficha.editTimeRow === row) {
    return timeEditHtml(ficha);
  }
  const value = countingPlay(doc, gameId, play)
    ? html`<span class="p-time-val mono" data-live-time="${play.id}"
        >${formatClock(liveTotalSeconds(doc, play, Date.now()))}</span
      >`
    : html`<span class="p-time-val">${formatRoundedHours(play.playedSeconds ?? 0)}</span>`;
  return html`<p class="p-time">
    <span class="lbl">Tiempo:</span> ${value}
    <button
      type="button"
      class="chip chip-xs p-time-edit-btn"
      data-edit-time="${play.id}"
      aria-label="Corregir tiempo jugado"
    >
      ✎
    </button>
  </p>`;
}

/**
 * Formulario inline de corrección del Tiempo jugado (ADR-0012): campo de
 * reloj prefilled, Corregir/Cancelar y aviso inline. Lo tecleado vive en el
 * DOM entre repintados; `editTimeDraft` solo repinta lo sembrado al abrir o
 * lo que haya que restaurar tras un error.
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function timeEditHtml(ficha) {
  return html`<div class="p-time-edit">
    <input
      type="text"
      class="mono"
      inputmode="numeric"
      data-time-input
      value="${ficha.editTimeDraft}"
      aria-label="Tiempo jugado en horas, minutos y segundos (H:MM:SS)"
      placeholder="H:MM:SS"
    />
    <span class="inline-actions">
      <button type="button" class="chip chip-xs" data-time-save>Corregir</button>
      <button type="button" class="chip chip-xs" data-time-cancel>Cancelar</button>
    </span>
    <p class="form-error" role="alert" data-time-error${ficha.editTimeError ? '' : ' hidden'}>
      ${ficha.editTimeError ?? ''}
    </p>
  </div>`;
}

/**
 * Botón Iniciar/Pausar del Contador (héroe y tarjeta de la jugada más
 * reciente): con el Contador de ESTE juego en marcha pausa; en caso contrario
 * inicia (el motor auto-pausa el que hubiera de otro juego).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Doc} doc
 * @returns {string}
 */
function counterToggleHtml(game, doc) {
  const running = doc.counter?.gameId === game.id;
  return html`<button type="button" class="chip" data-counter-toggle>
    ${running ? 'Pausar' : 'Iniciar'}
  </button>`;
}

/**
 * Duración + Iniciar/Pausar de la jugada que el Contador cronometra (héroe y
 * tarjeta de la más reciente); la fila decide si alberga el editor del
 * Tiempo jugado (ver playTimeHtml).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Doc} doc
 * @param {import('../domain/schema.js').Play} play
 * @param {import('../app.js').FichaUi} ficha
 * @param {'hero'|'card'} row fila cuyo lápiz puede abrir el editor
 * @returns {string}
 */
function counterRowHtml(game, doc, play, ficha, row) {
  return html`<div class="p-time-row">
    ${playTimeHtml(doc, game.id, play, ficha, row)} ${counterToggleHtml(game, doc)}
  </div>`;
}

/**
 * Consejo del Tramo (ticket 06): duración prefillada con lo contado y cuatro
 * salidas — guardar tal cual, guardar con otra duración, descartar o decidir
 * después (el Tramo queda pendiente).
 * @param {import('../domain/schema.js').Play} play
 * @param {import('../domain/schema.js').Segment} segment
 * @returns {string}
 */
function segmentAdviceHtml(play, segment) {
  return html`<div class="seg-row seg-open" data-seg-row="${segment.id}" data-play-id="${play.id}">
    <span class="seg-dur mono">${formatClock(segment.seconds)}</span>
    <div class="seg-advice">
      <label class="seg-field">
        <span class="lbl">Duración (H:MM:SS o segundos)</span>
        <input
          type="text"
          inputmode="numeric"
          class="mono"
          data-seg-input
          value="${segment.seconds}"
          aria-label="Duración del tramo (H:MM:SS o segundos)"
        />
      </label>
      <span class="inline-actions">
        <button type="button" class="chip chip-xs" data-seg-save-asis>Guardar tal cual</button>
        <button type="button" class="chip chip-xs" data-seg-save>Guardar</button>
        <button type="button" class="chip chip-xs danger" data-seg-discard="${segment.id}">
          Descartar
        </button>
        <button type="button" class="chip chip-xs" data-seg-later>Decidir después</button>
      </span>
      <p class="form-error" role="alert" data-seg-error hidden></p>
    </div>
  </div>`;
}

/**
 * Fila compacta de un Tramo pendiente; con el consejo abierto (`segmentPrompt`
 * apunta a este Tramo) la fila se expande con sus salidas.
 * @param {import('../domain/schema.js').Play} play
 * @param {import('../domain/schema.js').Segment} segment
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function segmentRowHtml(play, segment, ficha) {
  const prompt = ficha.segmentPrompt;
  if (prompt && prompt.playId === play.id && prompt.segmentId === segment.id) {
    return segmentAdviceHtml(play, segment);
  }
  return html`<div class="seg-row" data-seg-row="${segment.id}" data-play-id="${play.id}">
    <span class="seg-dur mono">${formatClock(segment.seconds)}</span>
    <span class="seg-actions">
      <button type="button" class="chip chip-xs" data-seg-decide="${segment.id}">Decidir</button>
      <button type="button" class="chip chip-xs danger" data-seg-discard="${segment.id}">
        Descartar
      </button>
    </span>
  </div>`;
}

/**
 * Tramos pendientes de la jugada más reciente: lista señalizada para decidirlos
 * uno a uno (ticket 07).
 * @param {import('../domain/schema.js').Play} play
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function pendingSegmentsHtml(play, ficha) {
  const segments = play.pendingSegments ?? [];
  if (segments.length === 0) return '';
  const count = segments.length;
  return html`<p class="seg-badge" data-pending-segments="${count}">
      ${count === 1 ? '1 tramo pendiente de revisión' : `${count} tramos pendientes de revisión`}
    </p>
    <div class="seg-list">${segments.map((segment) => segmentRowHtml(play, segment, ficha))}</div>`;
}

/** Campos compartidos editables y su presentación.
 * @type {Record<'description'|'coverUrl'|'genres'|'platforms'|'screenshots', { label: string, kind: 'text'|'textarea' }>} */
const SHARED_FIELDS = {
  description: { label: 'Descripción', kind: 'textarea' },
  coverUrl: { label: 'Carátula (URL)', kind: 'text' },
  genres: { label: 'Géneros', kind: 'text' },
  platforms: { label: 'Plataformas', kind: 'text' },
  screenshots: { label: 'Capturas (URLs)', kind: 'text' },
};

/**
 * ¿Se pinta la sección de este dato compartido? En manuales siempre (con o sin
 * valor, para poder rellenarlo); en IGDB solo si trae contenido — la galería y
 * la portada del héroe cubren capturas y carátula.
 * @param {import('../domain/schema.js').Game} game
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @returns {boolean}
 */
function sharedSectionVisible(game, name) {
  if (game.igdbId == null) return true;
  switch (name) {
    case 'description':
      return Boolean(game.description);
    case 'genres':
      return (game.genres ?? []).length > 0;
    case 'platforms':
      return (game.platforms ?? []).length > 0;
    default:
      return false;
  }
}

/**
 * Cuerpo de solo lectura de cada dato compartido.
 * @param {import('../domain/schema.js').Game} game
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @returns {string}
 */
function sharedBodyHtml(game, name) {
  switch (name) {
    case 'description':
      return game.description
        ? html`<p class="d-desc">${game.description}</p>`
        : html`<p class="d-meta">—</p>`;
    case 'coverUrl':
      return game.coverUrl
        ? html`<p class="d-meta mono wrap">${game.coverUrl}</p>`
        : html`<p class="d-meta">—</p>`;
    case 'genres': {
      const genres = game.genres ?? [];
      if (genres.length === 0) return html`<p class="d-meta">—</p>`;
      return html`<div class="d-status">
        ${genres.map((g) => html`<span class="chip static">${g.name}</span>`)}
      </div>`;
    }
    case 'platforms': {
      const platforms = game.platforms ?? [];
      if (platforms.length === 0) return html`<p class="d-meta">—</p>`;
      return html`<p class="d-meta mono wrap">${platforms.map((p) => p.name).join(', ')}</p>`;
    }
    case 'screenshots':
      return html`<p class="d-meta">—</p>`;
  }
}

/**
 * Valor actual del campo como texto plano para su formulario de edición.
 * @param {import('../domain/schema.js').Game} game
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @returns {string}
 */
function fieldValueText(game, name) {
  switch (name) {
    case 'description':
      return game.description ?? '';
    case 'coverUrl':
      return game.coverUrl ?? '';
    case 'genres':
      return (game.genres ?? []).map((g) => g.name).join(', ');
    case 'platforms':
      return (game.platforms ?? []).map((p) => p.name).join(', ');
    case 'screenshots':
      return (game.screenshots ?? []).join(', ');
  }
}

/**
 * Formulario inline genérico para un campo editable de datos compartidos.
 * El error se lee del slice ficha: cada escritura del slice re-renderiza la
 * app, así un guardado fallido pinta el error visible (antes quedaba oculto
 * en el global del módulo sin repintar).
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @param {'text'|'textarea'} kind
 * @param {string} value
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function fieldFormHtml(name, kind, value, ficha) {
  const label = SHARED_FIELDS[name].label;
  const control =
    kind === 'textarea'
      ? html`<textarea rows="4" data-field-input aria-label="${label}">${value}</textarea>`
      : html`<input
          type="text"
          data-field-input
          value="${value}"
          aria-label="${label}"
          placeholder="${label}…"
        />`;
  return html`<div class="inline-form" data-field-form="${name}">
    ${control}
    <span class="inline-actions">
      <button type="button" class="chip" data-field-save>Guardar</button>
      <button type="button" class="chip" data-field-cancel>Cancelar</button>
    </span>
    <p class="form-error" role="alert" data-field-error${ficha.fieldError ? '' : ' hidden'}>
      ${ficha.fieldError ?? ''}
    </p>
  </div>`;
}

/**
 * Sección de dato compartido con su acceso a edición (solo altas manuales).
 * @param {import('../domain/schema.js').Game} game
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function sharedSecHtml(game, name, ficha) {
  const editing = ficha.field === name;
  const inner = editing
    ? fieldFormHtml(name, SHARED_FIELDS[name].kind, fieldValueText(game, name), ficha)
    : html`<div class="d-body">${sharedBodyHtml(game, name)}</div>
        ${
          game.igdbId == null
            ? html`<button type="button" class="chip chip-xs" data-edit-field="${name}">
                Editar
              </button>`
            : ''
        }`;
  return html`<section class="d-sec" data-sec="${name}">
    <h3>${SHARED_FIELDS[name].label}</h3>
    ${inner}
  </section>`;
}

/**
 * Botones de estrellas 1–5 (+ «quitar» si hay nota). Variante grande del héroe
 * o pequeña por jugada; el clic lo resuelve la delegación del contenedor.
 * @param {{ rating: number|null, rateAttr: string, clearAttr: string, playId?: string, small?: boolean }} opts
 * @returns {string}
 */
function starPickerHtml({ rating, rateAttr, clearAttr, playId, small }) {
  const cls = small ? 'star sm' : 'star';
  const idAttr = playId != null ? html` data-play-id="${playId}"` : '';
  const stars = [1, 2, 3, 4, 5].map(
    (i) =>
      html`<button
        type="button"
        class="${cls}${rating != null && i <= rating ? ' on' : ''}"
        data-${rateAttr}="${i}"
        ${idAttr}
        aria-label="Valorar con ${i}"
      >
        ★
      </button>`
  );
  const clear =
    rating != null
      ? [
          html`<button type="button" class="chip chip-xs" data-${clearAttr} ${idAttr}>
            quitar
          </button>`,
        ]
      : [];
  return html`${stars}${clear}`;
}

/**
 * Título: texto clicable que abre la edición inline, o editor activo.
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function titleHtml(game, ficha) {
  if (!ficha.editTitle) {
    return html`<h2 class="d-title">
      <button type="button" class="d-title-btn" data-edit-title title="Editar título">
        ${game.title}
      </button>
    </h2>`;
  }
  return html`<div class="inline-form" data-title-form>
    <input type="text" data-title-input value="${game.title}" aria-label="Título" />
    <span class="inline-actions">
      <button type="button" class="chip" data-title-save>Guardar</button>
      <button type="button" class="chip" data-title-cancel>Cancelar</button>
    </span>
    <p class="form-error" role="alert" data-title-error${ficha.titleError ? '' : ' hidden'}>
      ${ficha.titleError ?? ''}
    </p>
  </div>`;
}

/**
 * Héroe: portada, píldora del Estado del juego, título y estrellas clicables
 * que valoran la jugada más reciente (spec §8.5).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../app.js').FichaUi} ficha
 * @param {import('../domain/schema.js').Doc} doc
 * @returns {string}
 */
function heroHtml(game, ficha, doc) {
  const status = gameStatus(game);
  const latest = latestPlay(game);
  return html`<div class="d-hero">
    <span class="d-cover">${coverHtml(game)}</span>
    <div class="d-head">
      ${statusPillHtml(status)} ${titleHtml(game, ficha)}
      <div class="d-stars" role="group" aria-label="Valoración de la jugada más reciente">
        ${starPickerHtml({
          rating: latest.rating ?? null,
          rateAttr: 'hero-rate',
          clearAttr: 'hero-rate-clear',
        })}
      </div>
      ${counterRowHtml(game, doc, latest, ficha, 'hero')}
      <p class="d-meta">Edita la valoración de la jugada más reciente (${latest.addedAt}).</p>
    </div>
  </div>`;
}

/**
 * Selector de plataforma efectiva de una jugada: las plataformas del juego más
 * «Otra (propia)…», que revela un campo para el nombre propio (id: null).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Play} play
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function platformSelectHtml(game, play, ficha) {
  const options = game.platforms ?? [];
  const own = play.platform != null && play.platform.id === null ? play.platform : null;
  const opts = [
    html`<option value="" ${play.platform == null ? 'selected' : ''}>Sin plataforma</option>`,
    ...options.map(
      (o) =>
        html`<option value="${o.id}" ${play.platform?.id === o.id ? 'selected' : ''}>
          ${o.name}
        </option>`
    ),
    html`<option value="__own__" ${own != null ? 'selected' : ''}>
      ${own != null ? `Propia: ${own.name}` : 'Otra (propia)…'}
    </option>`,
  ];
  const customInput =
    ficha.customPlatform === play.id || own != null
      ? html`<input
          type="text"
          data-platform-name
          data-play-id="${play.id}"
          value="${own?.name ?? ''}"
          placeholder="Nombre de tu plataforma (p. ej. emulador)…"
          aria-label="Nombre de la plataforma propia"
        />`
      : '';
  return html`<label class="p-pf">
    <span class="lbl">Plataforma efectiva</span>
    <select data-play-platform data-play-id="${play.id}">
      ${opts}
    </select>
    ${customInput}
  </label>`;
}

/**
 * Tarjeta editable de una jugada: fechas, plataforma efectiva, notas,
 * valoración propia y borrado con confirmación inline (spec §8.5).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Play} play
 * @param {import('../app.js').FichaUi} ficha
 * @param {import('../domain/schema.js').Doc} doc
 * @returns {string}
 */
function playCardHtml(game, play, ficha, doc) {
  const isLast = game.plays.length <= 1;
  const isLatest = latestPlay(game).id === play.id;
  const confirming = ficha.confirmPlay === play.id;
  const dates = html`<span class="p-dates">
    <label class="p-date">
      <span class="lbl">Inicio</span>
      <input
        type="date"
        value="${play.startedAt ?? ''}"
        data-play-date="startedAt"
        data-play-id="${play.id}"
      />
    </label>
    <label class="p-date">
      <span class="lbl">Fin</span>
      <input
        type="date"
        value="${play.finishedAt ?? ''}"
        data-play-date="finishedAt"
        data-play-id="${play.id}"
      />
    </label>
    <span class="p-added mono">Añadida ${play.addedAt}</span>
  </span>`;
  const notes = html`<label class="p-notes">
    <span class="lbl">Notas</span>
    <textarea
      rows="2"
      data-play-notes
      data-play-id="${play.id}"
      placeholder="Notas de esta jugada…"
    >
${play.notes ?? ''}</textarea>
  </label>`;
  const foot = confirming
    ? html`<span class="p-confirm">¿Seguro?</span>
        <button type="button" class="chip danger" data-del-play-yes data-play-id="${play.id}">
          Sí
        </button>
        <button type="button" class="chip" data-del-play-no data-play-id="${play.id}">No</button>`
    : html`<button
        type="button"
        class="chip danger"
        data-del-play
        data-play-id="${play.id}"
        ${isLast ? raw(' disabled title="Un juego necesita al menos una jugada"') : ''}
      >
        Borrar jugada
      </button>`;
  return html`<article class="play-card" data-play-card="${play.id}">
    <header class="p-head">
      ${statusPillHtml(play.status)}
      <span class="p-stars" role="group" aria-label="Valoración de esta jugada"
        >${starPickerHtml({
          rating: play.rating ?? null,
          rateAttr: 'play-rate',
          clearAttr: 'play-rate-clear',
          playId: play.id,
          small: true,
        })}</span
      >
    </header>
    ${
      isLatest
        ? counterRowHtml(game, doc, play, ficha, 'card')
        : playTimeHtml(doc, game.id, play, ficha, 'card')
    }
    ${isLatest ? pendingSegmentsHtml(play, ficha) : ''} ${dates}
    ${platformSelectHtml(game, play, ficha)} ${notes}
    <footer class="p-foot">${foot}</footer>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Marcado completo de la Ficha                                         */
/* ------------------------------------------------------------------ */

/**
 * Marcado completo de la Ficha.
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../app.js').FichaUi} ficha
 * @param {import('../domain/schema.js').Doc} doc
 * @returns {string}
 */
function fichaHtml(game, ficha, doc) {
  const SHARED_NAMES = /** @type {const} */ ([
    'description',
    'coverUrl',
    'genres',
    'platforms',
    'screenshots',
  ]);
  return html`<div class="fade ficha">
    <div class="toolbar">
      <button type="button" class="chip" data-back-ficha>← Volver</button>
      ${ficha.error ? html`<p class="form-error" role="alert">${ficha.error}</p>` : ''}
    </div>
    ${heroHtml(game, ficha, doc)}
    ${SHARED_NAMES.filter((name) => sharedSectionVisible(game, name)).map((name) =>
      sharedSecHtml(game, name, ficha)
    )}
    <section class="d-sec" data-sec="tags">
      <h3>Etiquetas propias</h3>
      ${tagEditorHtml(game.tags ?? [])}
    </section>
    <section class="d-sec" data-sec="status">
      <h3>Estado</h3>
      <div class="d-status">
        ${STATUSES.map(
          (st) =>
            html`<button
              type="button"
              class="chip${st === gameStatus(game) ? ' on' : ''}"
              data-set-status="${st}"
            >
              ${STATUS_LABELS[st]}
            </button>`
        )}
      </div>
    </section>
    ${galleryHtml(game.screenshots ?? [])}
    <section class="d-sec" data-sec="plays">
      <h3>Jugadas (${game.plays.length})</h3>
      ${
        ficha.playError
          ? html`<p class="form-error" role="alert" data-play-error>${ficha.playError}</p>`
          : ''
      }
      <div class="plays">
        ${playsNewestFirst(game).map((play) => playCardHtml(game, play, ficha, doc))}
      </div>
      <button type="button" class="chip" data-add-play>➕ Añadir jugada</button>
    </section>
    <section class="d-sec danger-zone" data-sec="danger">
      <h3>Zona de riesgo</h3>
      ${
        ficha.confirmGame
          ? html`<p class="danger-msg">Se borrarán el juego y todas sus jugadas. Sin deshacer.</p>
              <span class="inline-actions">
                <button type="button" class="chip danger" data-del-game-yes>
                  Sí, borrar juego
                </button>
                <button type="button" class="chip" data-del-game-no>Cancelar</button>
              </span>`
          : html`<button type="button" class="chip danger" data-del-game>Borrar juego</button>`
      }
    </section>
  </div>`;
}

/**
 * Pinta la Ficha del juego abierto; si el juego ya no existe (borrado),
 * devuelve al usuario a la estantería. El guard de re-render ante un gameId
 * distinto re-siembra el slice ficha (ADR-0006): cubre el botón atrás del
 * móvil y los cierres de Ficha — restaurar el historial nunca resucita un
 * formulario abierto ni una confirmación de borrado.
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
export function renderGame(container, store) {
  if (tickOff) {
    tickOff();
    tickOff = null;
  }
  const state = store.get();
  const gameId = state.library.gameId ?? null;
  if (state.ficha.gameId !== gameId) {
    store.set({ ficha: freshFicha(gameId) });
    return;
  }
  const doc = state.doc;
  const game = doc?.games.find((g) => g.id === gameId) ?? null;
  if (!game || !doc) {
    if (gameId != null) nav.closeGame(store);
    else container.innerHTML = '';
    return;
  }
  container.innerHTML = fichaHtml(game, state.ficha, doc);
  wire(container, store);
  // Tictac efímero del reloj vivo: repinta `data-live-time` cada segundo y
  // NUNCA re-renderiza la vista ni escribe el Doc (el store no recibe tics).
  tickOff = subscribeTick((now) => {
    if (!container.isConnected) {
      if (tickOff) {
        tickOff();
        tickOff = null;
      }
      return;
    }
    const liveDoc = store.get().doc;
    const liveGame = liveDoc?.games.find((g) => g.id === gameId);
    if (!liveDoc || !liveGame) return;
    for (const el of qsa('[data-live-time]', container)) {
      const play = liveGame.plays.find((p) => p.id === el.getAttribute('data-live-time'));
      if (!play) continue;
      el.textContent = formatClock(liveTotalSeconds(liveDoc, play, now.getTime()));
    }
  });
}

/**
 * Juego actualmente abierto según el store.
 * @param {import('../app.js').Store} store
 * @returns {import('../domain/schema.js').Game|null}
 */
function currentGame(store) {
  const { doc, library } = store.get();
  const gameId = library.gameId ?? null;
  if (gameId == null) return null;
  return doc?.games.find((g) => g.id === gameId) ?? null;
}

/**
 * Escribe campos del estado efímero de la Ficha (slice ficha, ADR-0006).
 * Cada escritura dispara el render de la app, que repinta la vista entera;
 * antes este estado era un global de módulo repintado a mano.
 * @param {import('../app.js').Store} store
 * @param {Partial<import('../app.js').FichaUi>} patch
 */
function patchFicha(store, patch) {
  store.set({ ficha: { ...store.get().ficha, ...patch } });
}

/**
 * Foca y selecciona el campo del editor del Tiempo jugado recién pintado.
 * @param {Element} surface
 */
function focusTimeInput(surface) {
  const input = qs('[data-time-input]', surface);
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
}

/**
 * Cierra el editor del Tiempo jugado limpiando su trozo del slice (ADR-0006).
 * @param {import('../app.js').Store} store
 */
function closeTimeEditor(store) {
  patchFicha(store, { editTime: null, editTimeRow: null, editTimeError: null, editTimeDraft: '' });
}

/**
 * Ejecuta un comando del motor (Promise<Result>) y, si falla, escribe el
 * error en el slot del slice que corresponda y conserva lo tecleado en el
 * formulario activo: el repinto reconstruye el formulario desde el doc, así
 * que `restore` rellena el input nuevo con lo tecleado (comportamiento
 * previo). Devuelve el Result para que el llamador pueda encadenar.
 * @param {import('../app.js').Store} store
 * @param {() => Promise<import('../data/ficha.js').Result>} command
 * @param {(message: string) => void} onError escribe el error en el slice
 * @param {() => void} [restore] restaura lo tecleado tras el repinto
 * @returns {Promise<import('../data/ficha.js').Result>}
 */
async function runCommand(store, command, onError, restore) {
  const res = await command();
  if (res.ok) return res;
  onError(formatError(res.error));
  restore?.();
  return res;
}

/**
 * Guarda el título tras la edición inline (Guardar, Enter o blur fuera). La
 * obligatoriedad la valida el motor (commitTitle): el error vive en el slice
 * `ficha.titleError`, no en un parche directo al DOM.
 * @param {Element} surface
 * @param {import('../app.js').Store} store
 */
async function commitTitle(surface, store) {
  const game = currentGame(store);
  if (!game || !store.get().ficha.editTitle) return;
  const input = qs('[data-title-input]', surface);
  const raw = input instanceof HTMLInputElement ? input.value : '';
  patchFicha(store, { editTitle: false, titleError: null });
  await runCommand(
    store,
    () => commitTitleCommand(game.id, raw),
    (message) => patchFicha(store, { editTitle: true, titleError: message }),
    () => {
      const fresh = qs('[data-title-input]', surface);
      if (fresh instanceof HTMLInputElement) {
        fresh.value = raw;
        fresh.focus();
      }
    }
  );
}

/**
 * Guarda el campo compartido cuyo formulario está abierto.
 * @param {Element} surface
 * @param {import('../app.js').Store} store
 */
async function commitField(surface, store) {
  const game = currentGame(store);
  const name = store.get().ficha.field;
  if (!game || !name) return;
  const form = qs(`[data-field-form="${name}"]`, surface);
  const control = form ? qs('[data-field-input]', form) : null;
  const raw =
    control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
      ? control.value
      : '';
  patchFicha(store, { field: null, fieldError: null });
  await runCommand(
    store,
    () =>
      commitSharedFieldCommand(
        game.id,
        /** @type {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} */ (name),
        raw
      ),
    (message) => patchFicha(store, { field: name, fieldError: message }),
    () => {
      const fresh = qs(`[data-field-form="${name}"] [data-field-input]`, surface);
      if (fresh instanceof HTMLInputElement || fresh instanceof HTMLTextAreaElement) {
        fresh.value = raw;
        fresh.focus();
      }
    }
  );
}

/**
 * Aplica la corrección del Tiempo jugado tecleada (ADR-0012): parsea el reloj
 * con el parser compartido y llama al comando setPlayTime. Lo no parseable
 * deja el campo abierto con el aviso y lo tecleado; si el parseo pasa, el
 * campo se cierra antes de correr el comando y un Result de error lo reabre
 * con lo tecleado y su aviso (mismo patrón que commitField).
 * @param {Element} surface
 * @param {import('../app.js').Store} store
 */
async function commitTime(surface, store) {
  const game = currentGame(store);
  const ficha = store.get().ficha;
  const playId = ficha.editTime;
  const row = ficha.editTimeRow;
  if (!game || !playId || !row) return;
  const input = qs('[data-time-input]', surface);
  const raw = input instanceof HTMLInputElement ? input.value : '';
  const seconds = parseClock(raw);
  if (seconds == null) {
    // El campo sigue abierto: el aviso con las formas aceptadas y lo tecleado
    // intacto (editTimeDraft re-pinta el input tras el repinto).
    patchFicha(store, {
      editTimeError: 'Escribe un tiempo válido: H:MM:SS, H:MM (horas:minutos) o segundos sueltos',
      editTimeDraft: raw,
    });
    focusTimeInput(surface);
    return;
  }
  closeTimeEditor(store);
  await runCommand(
    store,
    () => setPlayTimeCommand(game.id, playId, seconds),
    (message) =>
      patchFicha(store, {
        editTime: playId,
        editTimeRow: row,
        editTimeError: message,
        editTimeDraft: raw,
      }),
    () => {
      const fresh = qs('[data-time-input]', surface);
      if (fresh instanceof HTMLInputElement) {
        fresh.value = raw;
        fresh.focus();
      }
    }
  );
}

/**
 * Guarda la plataforma propia escrita a mano para una jugada.
 * @param {HTMLInputElement} input
 * @param {import('../app.js').Store} store
 */
async function commitOwnPlatform(input, store) {
  const game = currentGame(store);
  const playId = input.getAttribute('data-play-id');
  const name = input.value.trim();
  if (!game || !playId || !name) return;
  await setPlayPlatform(game.id, playId, { id: null, name });
}

/**
 * Guarda el Tramo del consejo con la duración escrita: vacío = guardar tal
 * cual (la prefillada); lo demás pasa por `parseClock` (H:MM:SS, H:MM
 * horas:minutos o segundos sueltos) y lo no válido se rechaza inline sin
 * llamar al motor. Cada comando con éxito deja `segmentPrompt` a null; los
 * errores van al slot `playError`.
 * @param {Element} surface
 * @param {import('../app.js').Store} store
 * @param {string|null} raw duración escrita; null = guardar tal cual
 */
async function commitPromptSegment(surface, store, raw) {
  const game = currentGame(store);
  const prompt = store.get().ficha.segmentPrompt;
  if (!game || !prompt) return;
  /** @type {number|undefined} */
  let seconds;
  if (raw != null) {
    const trimmed = raw.trim();
    if (trimmed !== '') {
      const value = parseClock(trimmed);
      if (value == null) {
        const error = qs('[data-seg-error]', surface);
        if (error) {
          error.textContent =
            'Duración no válida. Acepta H:MM:SS, H:MM (horas:minutos) o un entero de segundos';
          error.removeAttribute('hidden');
        }
        return;
      }
      seconds = value;
    }
  }
  await runCommand(
    store,
    () => confirmSegment(game.id, prompt.playId, prompt.segmentId, seconds),
    (message) => patchFicha(store, { playError: message }),
    () => {
      const fresh = qs('[data-seg-input]', surface);
      if (fresh instanceof HTMLInputElement && raw != null) fresh.value = raw;
    }
  ).then((res) => {
    if (res.ok) patchFicha(store, { segmentPrompt: null });
  });
}

/**
 * Delegación de eventos sobre la superficie recién renderizada; el wrapper es
 * nuevo en cada render, así no se acumulan listeners entre renders.
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
function wire(container, store) {
  const surface = container.firstElementChild;
  if (!(surface instanceof HTMLElement)) return;
  wireGallery(surface);

  surface.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const clicked = e.target;
    const game = currentGame(store);
    if (!game) return;
    /**
     * @param {string} sel
     */
    const pick = (sel) => clicked.closest(sel);

    if (pick('[data-back-ficha]')) {
      // Aplica el cierre al instante y consume la entrada de historial de la
      // Ficha (src/backnav.js): el botón atrás del sistema no la repite.
      nav.closeGame(store);
      return;
    }
    if (pick('[data-edit-title]')) {
      patchFicha(store, { editTitle: true, titleError: null });
      const input = qs('[data-title-input]', surface.isConnected ? surface : container);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
      return;
    }
    if (pick('[data-title-cancel]')) {
      patchFicha(store, { editTitle: false, titleError: null });
      return;
    }
    if (pick('[data-title-save]')) {
      void commitTitle(container, store);
      return;
    }
    const tagRemove = pick('[data-tag-remove]');
    if (tagRemove) {
      const tag = tagRemove.getAttribute('data-tag-remove') ?? '';
      void removeTag(game, tag);
      return;
    }
    const editField = pick('[data-edit-field]');
    if (editField) {
      patchFicha(store, { field: editField.getAttribute('data-edit-field'), fieldError: null });
      const input = qs('[data-field-input]', container);
      if (input instanceof HTMLElement) input.focus();
      return;
    }
    if (pick('[data-field-cancel]')) {
      patchFicha(store, { field: null, fieldError: null });
      return;
    }
    if (pick('[data-field-save]')) {
      void commitField(container, store);
      return;
    }
    const statusBtn = pick('[data-set-status]');
    if (statusBtn) {
      const status = statusBtn.getAttribute('data-set-status');
      if (status) {
        patchFicha(store, { playError: null });
        void runCommand(
          store,
          () => setStatus(game.id, /** @type {import('../domain/schema.js').Status} */ (status)),
          (message) => patchFicha(store, { playError: message })
        );
      }
      return;
    }
    const heroRate = pick('[data-hero-rate]');
    if (heroRate) {
      const value = Number(heroRate.getAttribute('data-hero-rate'));
      void rateHero(game.id, value);
      return;
    }
    if (pick('[data-hero-rate-clear]')) {
      void rateHero(game.id, null);
      return;
    }
    const playRate = pick('[data-play-rate]');
    if (playRate) {
      const playId = playRate.getAttribute('data-play-id') ?? '';
      const value = Number(playRate.getAttribute('data-play-rate'));
      void ratePlay(game.id, playId, value);
      return;
    }
    const playRateClear = pick('[data-play-rate-clear]');
    if (playRateClear) {
      void ratePlay(game.id, playRateClear.getAttribute('data-play-id') ?? '', null);
      return;
    }
    const editTimeBtn = pick('[data-edit-time]');
    if (editTimeBtn) {
      const playId = editTimeBtn.getAttribute('data-edit-time') ?? '';
      const play = game.plays.find((p) => p.id === playId);
      if (!play) return;
      if (store.get().ficha.editTime === playId) {
        // El otro lápiz de la misma jugada (héroe/tarjeta): revela/foca el
        // editor ya abierto, sin pisar lo tecleado.
        focusTimeInput(container);
        return;
      }
      patchFicha(store, {
        editTime: playId,
        editTimeRow: editTimeBtn.closest('.d-hero') ? 'hero' : 'card',
        editTimeError: null,
        editTimeDraft: formatClock(play.playedSeconds ?? 0),
        playError: null,
      });
      focusTimeInput(container);
      return;
    }
    if (pick('[data-time-cancel]')) {
      closeTimeEditor(store);
      return;
    }
    if (pick('[data-time-save]')) {
      void commitTime(container, store);
      return;
    }
    if (pick('[data-counter-toggle]')) {
      // El ancla se captura ANTES del comando: pauseCounter la borra del Doc y
      // hace falta para localizar la jugada anclada y su último tramo nuevo.
      const anchor = store.get().doc?.counter ?? null;
      patchFicha(store, { playError: null });
      if (anchor && anchor.gameId === game.id) {
        void runCommand(
          store,
          () => pauseCounter(),
          (message) => patchFicha(store, { playError: message })
        ).then((res) => {
          if (!res.ok) return;
          const doc = store.get().doc;
          const play = doc?.games
            .find((g) => g.id === anchor.gameId)
            ?.plays.find((p) => p.id === anchor.playId);
          const last = (play?.pendingSegments ?? []).at(-1);
          if (!play || !last) return;
          patchFicha(store, { segmentPrompt: { playId: play.id, segmentId: last.id } });
          const input = qs('[data-seg-input]', container);
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
          }
        });
        return;
      }
      void runCommand(
        store,
        () => startCounter(game.id),
        (message) => patchFicha(store, { playError: message })
      );
      return;
    }
    if (pick('[data-add-play]')) {
      patchFicha(store, { playError: null });
      void runCommand(
        store,
        () => addPlay(game.id),
        (message) => patchFicha(store, { playError: message })
      );
      return;
    }
    const delPlay = pick('[data-del-play]');
    if (delPlay && !delPlay.hasAttribute('disabled')) {
      patchFicha(store, {
        confirmPlay: delPlay.getAttribute('data-play-id'),
        playError: null,
      });
      return;
    }
    const delYes = pick('[data-del-play-yes]');
    if (delYes) {
      patchFicha(store, { confirmPlay: null });
      void runCommand(
        store,
        () => deletePlay(game.id, delYes.getAttribute('data-play-id') ?? ''),
        (message) => patchFicha(store, { playError: message })
      );
      return;
    }
    if (pick('[data-del-play-no]')) {
      patchFicha(store, { confirmPlay: null });
      return;
    }
    const segDecide = pick('[data-seg-decide]');
    if (segDecide) {
      const segmentId = segDecide.getAttribute('data-seg-decide');
      const playId = segDecide.closest('[data-seg-row]')?.getAttribute('data-play-id');
      if (segmentId && playId) patchFicha(store, { segmentPrompt: { playId, segmentId } });
      return;
    }
    if (pick('[data-seg-later]')) {
      patchFicha(store, { segmentPrompt: null });
      return;
    }
    if (pick('[data-seg-save-asis]')) {
      void commitPromptSegment(container, store, null);
      return;
    }
    const segSave = pick('[data-seg-save]');
    if (segSave) {
      const input = qs('[data-seg-input]', container);
      void commitPromptSegment(
        container,
        store,
        input instanceof HTMLInputElement ? input.value : ''
      );
      return;
    }
    const segDiscard = pick('[data-seg-discard]');
    if (segDiscard) {
      const segmentId = segDiscard.getAttribute('data-seg-discard') ?? '';
      const playId = segDiscard.closest('[data-seg-row]')?.getAttribute('data-play-id') ?? '';
      patchFicha(store, { playError: null });
      void runCommand(
        store,
        () => discardSegment(game.id, playId, segmentId),
        (message) => patchFicha(store, { playError: message })
      ).then((res) => {
        if (res.ok && store.get().ficha.segmentPrompt?.segmentId === segmentId) {
          patchFicha(store, { segmentPrompt: null });
        }
      });
      return;
    }
    if (pick('[data-del-game]')) {
      patchFicha(store, { confirmGame: true });
      return;
    }
    if (pick('[data-del-game-yes]')) {
      void runCommand(
        store,
        () => deleteGame(game.id),
        (message) => patchFicha(store, { error: message })
      ).then((res) => {
        if (res.ok) {
          // La Ficha ya no existe: su entrada de historial se sustituye por
          // la estantería (src/backnav.js); el back del sistema salta al
          // Panel previo, nunca a la Ficha borrada.
          nav.repositionAfterDelete(store);
        }
      });
      return;
    }
    if (pick('[data-del-game-no]')) {
      patchFicha(store, { confirmGame: false });
    }
  });

  surface.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const game = currentGame(store);
    if (!game) return;

    if (target.matches('select[data-play-platform]')) {
      const playId = target.getAttribute('data-play-id') ?? '';
      const select = /** @type {HTMLSelectElement} */ (target);
      if (select.value === '') {
        patchFicha(store, { customPlatform: null });
        void setPlayPlatform(game.id, playId, null);
        return;
      }
      if (select.value === '__own__') {
        patchFicha(store, { customPlatform: playId });
        return;
      }
      const chosen = (game.platforms ?? []).find((o) => String(o.id) === select.value);
      if (chosen) {
        patchFicha(store, { customPlatform: null });
        void setPlayPlatform(game.id, playId, chosen);
      }
      return;
    }
    if (target.matches('input[data-platform-name]')) {
      void commitOwnPlatform(/** @type {HTMLInputElement} */ (target), store);
      return;
    }
    if (target.matches('textarea[data-play-notes]')) {
      const playId = target.getAttribute('data-play-id') ?? '';
      const value = /** @type {HTMLTextAreaElement} */ (target).value;
      void setPlayNotes(game.id, playId, value);
    }
  });

  surface.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const game = currentGame(store);
    if (!game) return;

    if (target.matches('[data-tag-add]') && e.key === 'Enter') {
      e.preventDefault();
      void addTag(game, /** @type {HTMLInputElement} */ (target));
      return;
    }
    if (target.matches('[data-platform-name]') && e.key === 'Enter') {
      e.preventDefault();
      void commitOwnPlatform(/** @type {HTMLInputElement} */ (target), store);
      return;
    }
    if (target.matches('[data-title-input]')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitTitle(container, store);
      } else if (e.key === 'Escape') {
        patchFicha(store, { editTitle: false, titleError: null });
      }
      return;
    }
    if (target.matches('[data-time-input]')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitTime(container, store);
      } else if (e.key === 'Escape') {
        closeTimeEditor(store);
      }
      return;
    }
    if (target.closest('[data-field-form]') && e.key === 'Escape') {
      patchFicha(store, { field: null, fieldError: null });
    }
  });

  // El blur no burbujea, pero focusout sí: salir del título (salvo hacia sus
  // propios botones) confirma la edición, igual que Enter. Las fechas también
  // se confirman aquí y NO en `change`: Chrome dispara `change` en cuanto la
  // fecha queda completa, y al teclear el año cada dígito la completa — si se
  // confirmara ahí, cada dígito re-renderizaría la Ficha entera y el input se
  // reconstruiría a mitad de escritura (el usuario ve una «recarga»).
  surface.addEventListener('focusout', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('input[type="date"][data-play-date]')) {
      const game = currentGame(store);
      if (!game) return;
      const kind = target.getAttribute('data-play-date');
      const playId = target.getAttribute('data-play-id') ?? '';
      const value = /** @type {HTMLInputElement} */ (target).value;
      if (kind !== 'startedAt' && kind !== 'finishedAt') return;
      const current = game.plays.find((p) => p.id === playId)?.[kind] ?? '';
      if (value === current) return;
      void setPlayDate(game.id, playId, kind, value);
      return;
    }
    if (!target.matches('[data-title-input]')) return;
    const form = target.closest('[data-title-form]');
    const to = e.relatedTarget;
    if (form && to instanceof HTMLElement && form.contains(to)) return;
    void commitTitle(container, store);
  });
}
