/**
 * Ficha de un Juego (ticket 17, spec §8.5): datos compartidos consultables y
 * editables en línea más todas sus Jugadas juntas. Se renderiza dentro de la
 * superficie de Biblioteca cuando `library.gameId` está fijado; las reglas de
 * edición de datos compartidos dependen del origen: título y etiquetas propias
 * siempre editables; géneros, plataformas, carátula, descripción y capturas
 * solo si el alta fue manual (sin `igdbId`).
 */
import { html, qs, raw } from '../lib/dom.js';
import { formatError } from '../lib/errors.js';
import { STATUSES, STATUS_LABELS } from '../domain/schema.js';
import { latestPlay, gameStatus } from '../domain/selectors.js';
import {
  addPlay,
  commitSharedField as commitSharedFieldCommand,
  commitTitle as commitTitleCommand,
  deleteGame,
  deletePlay,
  rateHero,
  ratePlay,
  setPlayDate,
  setPlayNotes,
  setPlayPlatform,
  setStatus,
} from '../data/ficha.js';
import { coverHtml } from '../ui/cover.js';
import { statusPillHtml } from '../ui/pill.js';
import { addTag, removeTag, tagEditorHtml } from '../ui/tags.js';
import { openLightbox } from '../ui/lightbox.js';
import * as nav from '../navigation.js';
import { freshFicha } from '../app.js';

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
 * @returns {string}
 */
function heroHtml(game, ficha) {
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
 * @returns {string}
 */
function playCardHtml(game, play, ficha) {
  const isLast = game.plays.length <= 1;
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
    ${dates} ${platformSelectHtml(game, play, ficha)} ${notes}
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
    <div class="d-gallery">
      ${shots.map(
        (url) =>
          html`<button type="button" class="d-shot" data-shot="${url}" aria-label="Ampliar captura">
            <img loading="lazy" src="${url}" alt="" />
          </button>`
      )}
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Marcado completo de la Ficha                                         */
/* ------------------------------------------------------------------ */

/**
 * Marcado completo de la Ficha.
 * @param {import('../domain/schema.js').Game} game
 * @param {import('../app.js').FichaUi} ficha
 * @returns {string}
 */
function fichaHtml(game, ficha) {
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
      ${ficha.error ? html`<p class="form-error" role="alert">${ficha.error}</p>` : ''}
    </div>
    ${heroHtml(game, ficha)}
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
    ${shots.length > 0 ? galleryHtml(shots) : ''}
    <section class="d-sec" data-sec="plays">
      <h3>Jugadas (${game.plays.length})</h3>
      ${
        ficha.playError
          ? html`<p class="form-error" role="alert" data-play-error>${ficha.playError}</p>`
          : ''
      }
      <div class="plays">${playsNewestFirst(game).map((play) => playCardHtml(game, play, ficha))}</div>
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
  const state = store.get();
  const gameId = state.library.gameId ?? null;
  if (state.ficha.gameId !== gameId) {
    store.set({ ficha: freshFicha(gameId) });
    return;
  }
  const game = state.doc?.games.find((g) => g.id === gameId) ?? null;
  if (!game) {
    if (gameId != null) nav.closeGame(store);
    else container.innerHTML = '';
    return;
  }
  container.innerHTML = fichaHtml(game, state.ficha);
  wire(container, store);
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
      // Aplica el cierre al instante y consume la entrada de historial de la
      // Ficha (src/backnav.js): el botón atrás del sistema no la repite.
      nav.closeGame(store);
      return;
    }
    const shot = pick('[data-shot]');
    if (shot) {
      const url = shot.getAttribute('data-shot');
      if (url) openLightbox(url);
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
    if (pick('[data-add-play]')) {
      patchFicha(store, { playError: null });
      void runCommand(store, () => addPlay(game.id), (message) =>
        patchFicha(store, { playError: message })
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
    if (pick('[data-del-game]')) {
      patchFicha(store, { confirmGame: true });
      return;
    }
    if (pick('[data-del-game-yes]')) {
      void runCommand(store, () => deleteGame(game.id), (message) =>
        patchFicha(store, { error: message })
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

    if (target.matches('input[type="date"][data-play-date]')) {
      const kind = target.getAttribute('data-play-date');
      const playId = target.getAttribute('data-play-id') ?? '';
      const value = /** @type {HTMLInputElement} */ (target).value;
      if (kind !== 'startedAt' && kind !== 'finishedAt') return;
      void setPlayDate(game.id, playId, kind, value);
      return;
    }
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
    if (target.closest('[data-field-form]') && e.key === 'Escape') {
      patchFicha(store, { field: null, fieldError: null });
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
    void commitTitle(container, store);
  });
}
