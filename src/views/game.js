/**
 * Ficha de un Juego (ticket 17, spec §8.5): datos compartidos consultables y
 * editables en línea más todas sus Jugadas juntas. Se renderiza dentro de la
 * superficie de Biblioteca cuando `library.gameId` está fijado; las reglas de
 * edición de datos compartidos dependen del origen: título y etiquetas propias
 * siempre editables; géneros, plataformas, carátula, descripción y capturas
 * solo si el alta fue manual (sin `igdbId`).
 */
import { html, qs, raw } from '../lib/dom.js';
import { STATUSES, STATUS_LABELS, todayFrom } from '../domain/schema.js';
import { latestPlay, gameStatus } from '../domain/selectors.js';
import {
  LibraryError,
  addPlay,
  deleteGame,
  deletePlay,
  ratePlay,
  setGameStatus,
  updateGame,
  updatePlay,
} from '../data/library.js';
import { coverHtml } from '../ui/cover.js';
import { statusPillHtml } from '../ui/pill.js';

/**
 * Estado efímero de edición de la Ficha (qué formulario está abierto, qué
 * confirmaciones pendientes, errores inline). Se reinicia al abrir otro juego
 * vía {@link openGame}; sobrevive a los re-render que dispara cada mutación.
 * @typedef {{
 *   gameId: string|null,
 *   editTitle: boolean,
 *   field: string|null,
 *   fieldError: string|null,
 *   customPlatform: string|null,
 *   confirmPlay: string|null,
 *   playError: string|null,
 *   confirmGame: boolean,
 *   error: string|null,
 * }} FichaUi
 */

/**
 * @param {string|null} gameId
 * @returns {FichaUi}
 */
function freshUi(gameId) {
  return {
    gameId,
    editTitle: false,
    field: null,
    fieldError: null,
    customPlatform: null,
    confirmPlay: null,
    playError: null,
    confirmGame: false,
    error: null,
  };
}

/** @type {FichaUi} */
let ui = freshUi(null);

/**
 * Abre la Ficha de un juego desde estantería o panel; conserva la vista y los
 * filtros para que «← Volver» regrese donde estaba el usuario.
 * @param {import('../app.js').Store} store
 * @param {string} gameId
 */
export function openGame(store, gameId) {
  ui = freshUi(gameId);
  store.set({ library: { ...store.get().library, gameId } });
}

/**
 * Cierra la Ficha volviendo a la superficie anterior (estantería o panel).
 * @param {import('../app.js').Store} store
 */
function closeGame(store) {
  store.set({ library: { ...store.get().library, gameId: null } });
}

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
 * Id numérico estable derivado del nombre (géneros/plataformas de alta manual
 * carecen de id IGDB; el esquema solo exige un number).
 * @param {string} name
 * @returns {number}
 */
function idFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return (hash % 2147483646) + 1;
}

/**
 * @param {string} s
 */
function norm(s) {
  return s.trim().toLowerCase();
}

/**
 * Lista {id,name} desde texto separado por comas; conserva el id de las
 * entradas cuyo nombre ya existía y genera uno estable para las nuevas.
 * @param {{id:number,name:string}[]} current
 * @param {string} text
 * @returns {{id:number,name:string}[]}
 */
function namedListFromText(current, text) {
  /** @type {{id:number,name:string}[]} */
  const out = [];
  for (const part of text.split(',')) {
    const name = part.trim();
    if (!name) continue;
    if (out.some((item) => norm(item.name) === norm(name))) continue;
    const existing = current.find((item) => norm(item.name) === norm(name));
    out.push(existing ? { id: existing.id, name } : { id: idFromName(norm(name)), name });
  }
  return out;
}

/**
 * URLs desde texto separado por comas.
 * @param {string} text
 * @returns {string[]}
 */
function urlsFromText(text) {
  return text
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * Lista vacía → campo ausente (spec §4: los arrays vacíos se omiten).
 * @template T
 * @param {T[]} list
 * @returns {T[]|undefined}
 */
function undefinedIfEmpty(list) {
  return list.length === 0 ? undefined : list;
}

/**
 * Mensaje español para errores de biblioteca u otros fallos.
 * @param {unknown} err
 * @returns {string}
 */
function errorMessage(err) {
  if (err instanceof LibraryError) return err.message;
  return err instanceof Error ? err.message : String(err);
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
      return html`<div class="d-status"
        >${genres.map((g) => html`<span class="chip static">${g.name}</span>`)}</div
      >`;
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
 * El error se escribe sobre [data-field-error] sin repintar (no se pierde lo
 * tecleado).
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @param {'text'|'textarea'} kind
 * @param {string} value
 * @returns {string}
 */
function fieldFormHtml(name, kind, value) {
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
    <p class="form-error" role="alert" data-field-error${
      ui.fieldError ? '' : ' hidden'
    }>${ui.fieldError ?? ''}</p>
  </div>`;
}

/**
 * Sección de dato compartido con su acceso a edición (solo altas manuales).
 * @param {import('../domain/schema.js').Game} game
 * @param {'description'|'coverUrl'|'genres'|'platforms'|'screenshots'} name
 * @returns {string}
 */
function sharedSecHtml(game, name) {
  const editing = ui.field === name;
  const inner = editing
    ? fieldFormHtml(name, SHARED_FIELDS[name].kind, fieldValueText(game, name))
    : html`<div class="d-body">${sharedBodyHtml(game, name)}</div>
        ${
          game.igdbId == null
            ? html`<button type="button" class="chip chip-xs" data-edit-field="${name}"
                  >Editar</button
                >`
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
  const stars = [1, 2, 3, 4, 5].map((i) =>
    html`<button
        type="button"
        class="${cls}${rating != null && i <= rating ? ' on' : ''}"
        data-${rateAttr}="${i}"
        ${idAttr}
        aria-label="Valorar con ${i}">★</button
      >`
  );
  const clear =
    rating != null
      ? [
          html`<button type="button" class="chip chip-xs" data-${clearAttr} ${idAttr}
              >quitar</button
            >`,
        ]
      : [];
  return html`${stars}${clear}`;
}

/**
 * Título: texto clicable que abre la edición inline, o editor activo.
 * @param {import('../domain/schema.js').Game} game
 * @returns {string}
 */
function titleHtml(game) {
  if (!ui.editTitle) {
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
    <p class="form-error" role="alert" data-title-error hidden></p>
  </div>`;
}

/**
 * Héroe: portada, píldora del Estado del juego, título y estrellas clicables
 * que valoran la jugada más reciente (spec §8.5).
 * @param {import('../domain/schema.js').Game} game
 * @returns {string}
 */
function heroHtml(game) {
  const status = gameStatus(game);
  const latest = latestPlay(game);
  return html`<div class="d-hero">
    <span class="d-cover">${coverHtml(game)}</span>
    <div class="d-head">
      ${statusPillHtml(status)}
      ${titleHtml(game)}
      <div class="d-stars" role="group" aria-label="Valoración de la jugada más reciente">
        ${starPickerHtml({
            rating: latest.rating ?? null,
            rateAttr: 'hero-rate',
            clearAttr: 'hero-rate-clear',
          })}
      </div>
      <p class="d-meta">Edita la valoración de la jugada más reciente (${latest.addedAt}).</p>
    </div>
  </div>`;
}

/**
 * Editor de etiquetas propias: chips con × más campo para añadir (Enter).
 * Siempre presente, también en juegos de IGDB (spec §8.5).
 * @param {import('../domain/schema.js').Game} game
 * @returns {string}
 */
function tagsEditorHtml(game) {
  const tags = game.tags ?? [];
  return html`<section class="d-sec" data-sec="tags">
    <h3>Etiquetas propias</h3>
    <div class="tag-edit">
      ${
        tags.length === 0
          ? raw('<span class="d-meta">Sin etiquetas todavía.</span>')
          : tags.map(
              (tag) =>
                html`<span class="tag-mini own">#${tag}
                    <button
                      type="button"
                      class="tag-x"
                      data-tag-remove="${tag}"
                      aria-label="Quitar ${tag}"
                      >×</button
                    ></span
                  >`
            )
      }
      <input
        type="text"
        class="tag-add"
        data-tag-add
        placeholder="añadir…"
        aria-label="Añadir etiqueta propia"
      />
    </div>
  </section>`;
}

/**
 * Selector de plataforma efectiva de una jugada: las plataformas del juego más
 * «Otra (propia)…», que revela un campo para el nombre propio (id: null).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Play} play
 * @returns {string}
 */
function platformSelectHtml(game, play) {
  const options = game.platforms ?? [];
  const own = play.platform != null && play.platform.id === null ? play.platform : null;
  const opts = [
    html`<option value="" ${play.platform == null ? 'selected' : ''}>Sin plataforma</option>`,
    ...options.map((o) =>
      html`<option value="${o.id}" ${play.platform?.id === o.id ? 'selected' : ''}
          >${o.name}</option
        >`
    ),
    html`<option value="__own__" ${own != null ? 'selected' : ''}
        >${own != null ? `Propia: ${own.name}` : 'Otra (propia)…'}</option
      >`,
  ];
  const customInput =
    ui.customPlatform === play.id || own != null
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
    <select data-play-platform data-play-id="${play.id}">${opts}</select>
    ${customInput}
  </label>`;
}

/**
 * Tarjeta editable de una jugada: fechas, plataforma efectiva, notas,
 * valoración propia y borrado con confirmación inline (spec §8.5).
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../domain/schema.js').Play} play
 * @returns {string}
 */
function playCardHtml(game, play) {
  const isLast = game.plays.length <= 1;
  const confirming = ui.confirmPlay === play.id;
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
      >${play.notes ?? ''}</textarea
    >
  </label>`;
  const foot = confirming
    ? html`<span class="p-confirm">¿Seguro?</span>
          <button type="button" class="chip danger" data-del-play-yes data-play-id="${play.id}"
            >Sí</button
          >
          <button type="button" class="chip" data-del-play-no data-play-id="${play.id}"
            >No</button
          >`
    : html`<button
          type="button"
          class="chip danger"
          data-del-play
          data-play-id="${play.id}"
          ${isLast ? raw(' disabled title="Un juego necesita al menos una jugada"') : ''}
          >Borrar jugada</button
        >`;
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
    ${dates}
    ${platformSelectHtml(game, play)}
    ${notes}
    <footer class="p-foot">${foot}</footer>
  </article>`;
}

/**
 * Galería de capturas: scroll horizontal, imágenes siempre online; el clic
 * abre el visor a pantalla completa ({@link openLightbox}).
 * @param {string[]} shots
 * @returns {string}
 */
function galleryHtml(shots) {
  return html`<section class="d-sec" data-sec="gallery">
    <h3>Galería</h3>
    <div class="d-gallery"
      >${shots.map(
        (url) =>
          html`<button
              type="button"
              class="d-shot"
              data-shot="${url}"
              aria-label="Ampliar captura"
              ><img loading="lazy" src="${url}" alt="" /></button
            >`
      )}</div
    >
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Visor de capturas (lightbox)                                        */
/* ------------------------------------------------------------------ */

/** Capa del visor abierta. @type {HTMLElement|null} */
let lightboxLayer = null;

/** @type {((e: KeyboardEvent) => void)|null} */
let lightboxKeyHandler = null;

/**
 * Abre el visor a pantalla completa con una captura ampliada.
 * @param {string} url
 */
export function openLightbox(url) {
  if (!url || lightboxLayer?.isConnected) return;
  lightboxLayer = document.createElement('div');
  lightboxLayer.className = 'lightbox fade';
  lightboxLayer.setAttribute('role', 'dialog');
  lightboxLayer.setAttribute('aria-modal', 'true');
  lightboxLayer.setAttribute('aria-label', 'Captura ampliada');
  lightboxLayer.innerHTML = html`<img src="${url}" alt="Captura ampliada" />
    <button type="button" class="chip lightbox-close" data-close-lightbox aria-label="Cerrar">
      ✕
    </button>`;
  document.body.appendChild(lightboxLayer);
  // Cualquier toque fuera (fondo o imagen) cierra; es un visor, no un formulario.
  lightboxLayer.addEventListener('click', () => closeLightbox());
  lightboxKeyHandler = (e) => {
    if (e.key === 'Escape' && lightboxLayer?.isConnected) {
      e.preventDefault();
      closeLightbox();
    }
  };
  document.addEventListener('keydown', lightboxKeyHandler);
}

/** Cierra el visor y retira sus listeners globales. */
export function closeLightbox() {
  if (lightboxKeyHandler) {
    document.removeEventListener('keydown', lightboxKeyHandler);
    lightboxKeyHandler = null;
  }
  lightboxLayer?.remove();
  lightboxLayer = null;
}

/**
 * Marcado completo de la Ficha.
 * @param {import('../domain/schema.js').Game} game
 * @returns {string}
 */
function fichaHtml(game) {
  const SHARED_NAMES = /** @type {const} */ ([
    'description',
    'coverUrl',
    'genres',
    'platforms',
    'screenshots',
  ]);
  const shots = game.screenshots ?? [];
  return html`<div class="fade ficha">
    <div class="toolbar">
      <button type="button" class="chip" data-back-ficha>← Volver</button>
      ${ui.error ? html`<p class="form-error" role="alert">${ui.error}</p>` : ''}
    </div>
    ${heroHtml(game)}
    ${SHARED_NAMES.filter((name) => sharedSectionVisible(game, name)).map((name) =>
      sharedSecHtml(game, name)
    )}
    ${tagsEditorHtml(game)}
    <section class="d-sec" data-sec="status">
      <h3>Estado</h3>
      <div class="d-status"
        >${STATUSES.map(
          (st) =>
            html`<button
                type="button"
                class="chip${st === gameStatus(game) ? ' on' : ''}"
                data-set-status="${st}"
                >${STATUS_LABELS[st]}</button
              >`
        )}</div
      >
    </section>
    ${shots.length > 0 ? galleryHtml(shots) : ''}
    <section class="d-sec" data-sec="plays">
      <h3>Jugadas (${game.plays.length})</h3>
      ${
        ui.playError
          ? html`<p class="form-error" role="alert" data-play-error>${ui.playError}</p>`
          : ''
      }
      <div class="plays"
        >${playsNewestFirst(game).map((play) => playCardHtml(game, play))}</div
      >
      <button type="button" class="chip" data-add-play>➕ Añadir jugada</button>
    </section>
    <section class="d-sec danger-zone" data-sec="danger">
      <h3>Zona de riesgo</h3>
      ${
        ui.confirmGame
          ? html`<p class="danger-msg"
                  >Se borrarán el juego y todas sus jugadas. Sin deshacer.</p
                >
                <span class="inline-actions">
                  <button type="button" class="chip danger" data-del-game-yes
                    >Sí, borrar juego</button
                  >
                  <button type="button" class="chip" data-del-game-no>Cancelar</button>
                </span>`
          : html`<button type="button" class="chip danger" data-del-game>Borrar juego</button>`
      }
    </section>
  </div>`;
}

/**
 * Pinta la Ficha del juego abierto; si el juego ya no existe (borrado),
 * devuelve al usuario a la estantería.
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
export function renderGame(container, store) {
  const state = store.get();
  const lib = state.library;
  const gameId = lib.gameId ?? null;
  if (ui.gameId !== gameId) ui = freshUi(gameId);
  const game = state.doc?.games.find((g) => g.id === gameId) ?? null;
  if (!game) {
    if (gameId != null) closeGame(store);
    else container.innerHTML = '';
    return;
  }
  container.innerHTML = fichaHtml(game);
  wire(container, store);
}

/**
 * Repaint local sin cambio de estado (abrir/cerrar formularios efímeros).
 * @param {Element} container
 * @param {import('../app.js').Store} store
 */
function paint(container, store) {
  renderGame(container, store);
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
 * Escribe (o limpia) un error inline sin repintar la vista: así no se pierde
 * lo tecleado en el formulario activo.
 * @param {Element} surface
 * @param {string} selector
 * @param {string|null} message
 */
function setInlineError(surface, selector, message) {
  const box = qs(selector, surface);
  if (!box) return;
  box.textContent = message ?? '';
  if (message) box.removeAttribute('hidden');
  else box.setAttribute('hidden', '');
}

/**
 * Guarda el título tras la edición inline (Guardar, Enter o blur fuera).
 * @param {Element} surface
 * @param {import('../app.js').Store} store
 */
async function commitTitle(surface, store) {
  const game = currentGame(store);
  if (!game || !ui.editTitle) return;
  const input = qs('[data-title-input]', surface);
  const value = input instanceof HTMLInputElement ? input.value.trim() : '';
  if (!value) {
    setInlineError(surface, '[data-title-error]', 'El título es obligatorio');
    return;
  }
  ui.editTitle = false;
  try {
    await updateGame(game.id, { title: value });
  } catch (err) {
    ui.editTitle = true;
    throw err;
  }
}

/**
 * Añade una etiqueta propia escrita en el campo del editor.
 * @param {HTMLInputElement} input
 * @param {import('../app.js').Store} store
 */
async function addTag(input, store) {
  const game = currentGame(store);
  const tag = input.value.trim();
  if (!game || !tag) return;
  input.value = '';
  await updateGame(game.id, { tags: [...(game.tags ?? []), tag] });
}

/**
 * Parche de actualización para un dato compartido editado como texto; null si
 * el campo es desconocido.
 * @param {import('../domain/schema.js').Game} game
 * @param {string} name
 * @param {string} value
 * @returns {Partial<import('../domain/schema.js').Game>|null}
 */
function sharedPatch(game, name, value) {
  switch (name) {
    case 'description':
      return { description: value.trim() || undefined };
    case 'coverUrl':
      return { coverUrl: value.trim() || undefined };
    case 'genres':
      return { genres: undefinedIfEmpty(namedListFromText(game.genres ?? [], value)) };
    case 'platforms':
      return { platforms: undefinedIfEmpty(namedListFromText(game.platforms ?? [], value)) };
    case 'screenshots':
      return { screenshots: undefinedIfEmpty(urlsFromText(value)) };
    default:
      return null;
  }
}

/**
 * Guarda el campo compartido cuyo formulario está abierto.
 * @param {Element} surface
 * @param {import('../app.js').Store} store
 */
async function commitField(surface, store) {
  const game = currentGame(store);
  const name = ui.field;
  if (!game || !name) return;
  const form = qs(`[data-field-form="${name}"]`, surface);
  const control = form ? qs('[data-field-input]', form) : null;
  const value =
    control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
      ? control.value
      : '';
  ui.field = null;
  ui.fieldError = null;
  const patch = sharedPatch(game, name, value);
  if (!patch) return;
  try {
    await updateGame(game.id, patch);
  } catch (err) {
    ui.field = name;
    ui.fieldError = errorMessage(err);
    throw err;
  }
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
  await updatePlay(game.id, playId, { platform: { id: null, name } });
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
      closeGame(store);
      return;
    }
    const shot = pick('[data-shot]');
    if (shot) {
      const url = shot.getAttribute('data-shot');
      if (url) openLightbox(url);
      return;
    }
    if (pick('[data-edit-title]')) {
      ui.editTitle = true;
      paint(container, store);
      const input = qs('[data-title-input]', surface.isConnected ? surface : container);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
      return;
    }
    if (pick('[data-title-cancel]')) {
      ui.editTitle = false;
      paint(container, store);
      return;
    }
    if (pick('[data-title-save]')) {
      void commitTitle(container, store).catch(() => {});
      return;
    }
    const tagRemove = pick('[data-tag-remove]');
    if (tagRemove) {
      const tag = tagRemove.getAttribute('data-tag-remove') ?? '';
      void updateGame(game.id, { tags: (game.tags ?? []).filter((t) => t !== tag) }).catch(
        () => {}
      );
      return;
    }
    const editField = pick('[data-edit-field]');
    if (editField) {
      ui.field = editField.getAttribute('data-edit-field');
      ui.fieldError = null;
      paint(container, store);
      const input = qs('[data-field-input]', container);
      if (input instanceof HTMLElement) input.focus();
      return;
    }
    if (pick('[data-field-cancel]')) {
      ui.field = null;
      ui.fieldError = null;
      paint(container, store);
      return;
    }
    if (pick('[data-field-save]')) {
      void commitField(container, store).catch(() => {});
      return;
    }
    const setStatus = pick('[data-set-status]');
    if (setStatus) {
      const status = setStatus.getAttribute('data-set-status');
      if (
        status &&
        STATUSES.includes(/** @type {import('../domain/schema.js').Status} */ (status))
      ) {
        ui.playError = null;
        void setGameStatus(
          game.id,
          /** @type {import('../domain/schema.js').Status} */ (status),
          todayFrom(new Date())
        ).catch((err) => {
          ui.playError = errorMessage(err);
          paint(container, store);
        });
      }
      return;
    }
    const heroRate = pick('[data-hero-rate]');
    if (heroRate) {
      const value = Number(heroRate.getAttribute('data-hero-rate'));
      void ratePlay(game.id, latestPlay(game).id, value).catch(() => {});
      return;
    }
    if (pick('[data-hero-rate-clear]')) {
      void ratePlay(game.id, latestPlay(game).id, null).catch(() => {});
      return;
    }
    const playRate = pick('[data-play-rate]');
    if (playRate) {
      const playId = playRate.getAttribute('data-play-id') ?? '';
      const value = Number(playRate.getAttribute('data-play-rate'));
      void ratePlay(game.id, playId, value).catch(() => {});
      return;
    }
    const playRateClear = pick('[data-play-rate-clear]');
    if (playRateClear) {
      void ratePlay(game.id, playRateClear.getAttribute('data-play-id') ?? '', null).catch(
        () => {}
      );
      return;
    }
    if (pick('[data-add-play]')) {
      const inherited = latestPlay(game).platform;
      ui.playError = null;
      void addPlay(game.id, {
        status: 'playing',
        today: todayFrom(new Date()),
        ...(inherited ? { platform: inherited } : {}),
      }).catch((err) => {
        ui.playError = errorMessage(err);
        paint(container, store);
      });
      return;
    }
    const delPlay = pick('[data-del-play]');
    if (delPlay && !delPlay.hasAttribute('disabled')) {
      ui.confirmPlay = delPlay.getAttribute('data-play-id');
      ui.playError = null;
      paint(container, store);
      return;
    }
    const delYes = pick('[data-del-play-yes]');
    if (delYes) {
      ui.confirmPlay = null;
      void deletePlay(game.id, delYes.getAttribute('data-play-id') ?? '')
        .then(() => {
          ui.playError = null;
        })
        .catch((err) => {
          ui.playError = errorMessage(err);
          paint(container, store);
        });
      return;
    }
    if (pick('[data-del-play-no]')) {
      ui.confirmPlay = null;
      paint(container, store);
      return;
    }
    if (pick('[data-del-game]')) {
      ui.confirmGame = true;
      paint(container, store);
      return;
    }
    if (pick('[data-del-game-yes]')) {
      void deleteGame(game.id)
        .then(() => {
          store.set({
            library: {
              ...store.get().library,
              view: 'shelves',
              panelStatus: null,
              gameId: null,
            },
          });
        })
        .catch((err) => {
          ui.error = errorMessage(err);
          paint(container, store);
        });
      return;
    }
    if (pick('[data-del-game-no]')) {
      ui.confirmGame = false;
      paint(container, store);
    }
  });

  surface.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const game = currentGame(store);
    if (!game) return;

    if (target.matches('input[type="date"][data-play-date]')) {
      const kind = target.getAttribute('data-play-date');
      const playId = target.getAttribute('data-play-id') ?? '';
      const value = /** @type {HTMLInputElement} */ (target).value;
      if (kind !== 'startedAt' && kind !== 'finishedAt') return;
      const patch = /** @type {Partial<import('../domain/schema.js').Play>} */ (
        { [kind]: value || undefined }
      );
      void updatePlay(game.id, playId, patch).catch(() => {});
      return;
    }
    if (target.matches('select[data-play-platform]')) {
      const playId = target.getAttribute('data-play-id') ?? '';
      const select = /** @type {HTMLSelectElement} */ (target);
      if (select.value === '') {
        ui.customPlatform = null;
        void updatePlay(game.id, playId, { platform: undefined }).catch(() => {});
        return;
      }
      if (select.value === '__own__') {
        ui.customPlatform = playId;
        paint(container, store);
        return;
      }
      const chosen = (game.platforms ?? []).find((o) => String(o.id) === select.value);
      if (chosen) {
        ui.customPlatform = null;
        void updatePlay(game.id, playId, { platform: chosen }).catch(() => {});
      }
      return;
    }
    if (target.matches('input[data-platform-name]')) {
      void commitOwnPlatform(/** @type {HTMLInputElement} */ (target), store).catch(() => {});
      return;
    }
    if (target.matches('textarea[data-play-notes]')) {
      const playId = target.getAttribute('data-play-id') ?? '';
      const value = /** @type {HTMLTextAreaElement} */ (target).value;
      void updatePlay(game.id, playId, { notes: value === '' ? undefined : value }).catch(
        () => {}
      );
    }
  });

  surface.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const game = currentGame(store);
    if (!game) return;

    if (target.matches('[data-tag-add]') && e.key === 'Enter') {
      e.preventDefault();
      void addTag(/** @type {HTMLInputElement} */ (target), store).catch(() => {});
      return;
    }
    if (target.matches('[data-platform-name]') && e.key === 'Enter') {
      e.preventDefault();
      void commitOwnPlatform(/** @type {HTMLInputElement} */ (target), store).catch(() => {});
      return;
    }
    if (target.matches('[data-title-input]')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitTitle(container, store).catch(() => {});
      } else if (e.key === 'Escape') {
        ui.editTitle = false;
        paint(container, store);
      }
      return;
    }
    if (target.closest('[data-field-form]') && e.key === 'Escape') {
      ui.field = null;
      ui.fieldError = null;
      paint(container, store);
    }
  });

  // El blur no burbujea, pero focusout sí: salir del título (salvo hacia sus
  // propios botones) confirma la edición, igual que Enter.
  surface.addEventListener('focusout', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.matches('[data-title-input]')) return;
    const form = target.closest('[data-title-form]');
    const to = e.relatedTarget;
    if (form && to instanceof HTMLElement && form.contains(to)) return;
    void commitTitle(container, store).catch(() => {});
  });
}
