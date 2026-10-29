/**
 * STARK OS Medienbrowser.
 *
 * Ordnerauswahl (maximal drei Namen), Bilder-Wheel mit fester Auswahl auf
 * zwölf Uhr, gerahmte Vorschau und Pinch-Sendegeste. Der Browser verwendet
 * ausschließlich die bestehende Display- und Medienquellen-API.
 */

const STEP = 30; // Grad pro Eintrag auf dem Wheel
const SLOTS = 12; // wiederverwendete Segmente, füllen den Ring genau einmal
const PRELOAD = 4; // Miniaturen links und rechts der Auswahl
const CACHE_LIMIT = 24;
const MEDIA_PATTERN = /^(image\/|video\/|application\/pdf$)/;
const TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
};

export function typeFromName(name) {
  const extension = String(name).split('.').pop().toLowerCase();
  return TYPE_BY_EXTENSION[extension] || 'application/octet-stream';
}

function entryType(entry) {
  return entry.type && entry.type !== 'application/octet-stream'
    ? entry.type
    : typeFromName(entry.name);
}

function shortAngle(value) {
  let delta = value;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root Panel-Body mit dem Medien-Template
 * @param {object} options.displays bestehende DisplayApi-Instanz
 * @param {Array} options.library bereits importierte lokale Medien
 * @param {Set<string>} options.selectedDisplays ausgewählte Receiver
 * @param {() => void} options.openSources öffnet die bestehende Quellenverwaltung
 * @param {() => void} options.pickLocal öffnet den bestehenden Dateidialog
 */
export function createMediaBrowser(options) {
  const { root, displays, library, selectedDisplays } = options;
  const $ = (selector) => root.querySelector(selector);

  const browser = $('#starkBrowser');
  const stage = $('#browserStage');
  const folderStack = $('#folderStack');
  const folderPrevious = $('#folderPrevious');
  const folderCurrent = $('#folderCurrent');
  const folderNext = $('#folderNext');
  const previewStack = $('#previewStack');
  const previewFrame = $('#previewFrame');
  const previewCanvas = $('#previewCanvas');
  const browserTop = $('#browserTop');
  const receiverName = $('#receiverName');
  const receiverState = $('#receiverState');
  const receiverChip = $('#receiverChip');
  const receiverThumb = $('#receiverThumb');
  const receiverMedia = $('#receiverMedia');
  const receiverZoom = $('#receiverZoom');
  const backButton = $('#browserBack');
  const transferButton = $('#browserTransfer');
  const wheel = $('#browserWheel');
  const dial = $('#wheelDial');
  const segmentLayer = $('#wheelSegments');
  const marker = $('#wheelMarker');
  const core = $('#wheelCore');
  const status = $('#browserStatus');

  if (!browser) return null;

  const state = {
    view: 'folders',
    level: null, // { title, entries, sourceId, path, parent }
    collection: null, // { title, items, back }
    position: 0,
    index: 0,
    rotating: false,
    settling: false,
    sending: false,
    holdUntil: 0,
    receiver: null,
    mode: 'manual', // 'manual' | 'auto'; Auto-Switch wird bewusst aktiviert
    opened: false, // aufgezogene Bildansicht
    openScale: 1,
    zoom: 1,
    pan: { x: 0, y: 0 },
    // Was der Receiver tatsächlich bestätigt hat, getrennt von der Auswahl.
    confirmed: null, // { key, name, index, total, url, sessionId }
    confirmedZoom: 1,
  };

  const fileCache = new Map(); // key -> { url, blob }
  const pendingFiles = new Map();
  const segments = [];
  let animation = 0;
  let settleTimer = 0;
  let destroyed = false;
  let receiverTimer = 0;

  /* ---------------------------------------------------------------- Layout */

  function applyLayout() {
    if (!stage.isConnected) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const portrait = height >= width;
    browser.dataset.orientation = portrait ? 'portrait' : 'landscape';
    const gap = 16;
    // Der Faktor hält das vollständige Wheel samt Rand im Container.
    const size = portrait
      ? Math.min(width * 0.96, (height - gap) * 0.56, 460)
      : Math.min(height * 0.96, (width - gap) * 0.5, 460);
    browser.style.setProperty(
      '--wheel-size',
      `${Math.max(132, Math.round(size))}px`,
    );
    // Die aufgezogene Ansicht bleibt beim Ausrichtungswechsel geöffnet und
    // wird nur neu eingepasst.
    if (state.opened) {
      state.openScale = openableScale();
      clampPan();
      applyOpenTransform();
    }
  }

  // Eine laufende Geste wird bei jeder Größenänderung sauber beendet, damit
  // ein Drehen des Geräts weder lädt noch sendet.
  function handleViewportChange() {
    cancelGestures();
    applyLayout();
  }

  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(handleViewportChange)
      : null;
  resizeObserver?.observe(stage);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', handleViewportChange);

  /* ---------------------------------------------------------------- Status */

  function setStatus(text = '') {
    status.textContent = text;
  }

  function setReceiverState(text, busy = false) {
    receiverState.textContent = text;
    browserTop.dataset.busy = busy ? 'yes' : 'no';
  }

  /** Merkt sich, was der Receiver bestätigt angenommen hat. */
  function markConfirmed(item, index) {
    state.confirmed = {
      key: item.key,
      name: item.name,
      index,
      total: count(),
      url: fileCache.get(item.key)?.url || item.data || null,
    };
    state.confirmedZoom = 1;
    renderTop();
  }

  function renderTop() {
    const shown = state.confirmed;
    if (!shown) {
      receiverThumb.toggleAttribute('hidden', true);
      receiverThumb.removeAttribute('src');
      receiverMedia.textContent = '—';
      receiverZoom.toggleAttribute('hidden', true);
      return;
    }
    if (shown.url) {
      if (receiverThumb.getAttribute('src') !== shown.url)
        receiverThumb.setAttribute('src', shown.url);
      receiverThumb.toggleAttribute('hidden', false);
    } else {
      receiverThumb.toggleAttribute('hidden', true);
      receiverThumb.removeAttribute('src');
    }
    receiverMedia.textContent = shown.total
      ? `${shown.name} · ${String(shown.index + 1).padStart(2, '0')} / ${shown.total}`
      : shown.name;
    const zoom = Number(state.confirmedZoom || 1);
    receiverZoom.textContent = `ZOOM ${Math.round(zoom * 100)}%`;
    receiverZoom.toggleAttribute('hidden', Math.abs(zoom - 1) < 0.02);
  }

  /* ----------------------------------------------------------------- Wheel */

  for (let slot = 0; slot < SLOTS; slot += 1) {
    const segment = document.createElement('span');
    segment.className = 'wheel-segment';
    segment.hidden = true;
    segmentLayer.append(segment);
    segments.push(segment);
  }

  function count() {
    return state.view === 'images'
      ? (state.collection?.items.length ?? 0)
      : (state.level?.entries.length ?? 0);
  }

  function itemAt(index) {
    return state.view === 'images'
      ? state.collection?.items[index]
      : state.level?.entries[index];
  }

  function renderWheel() {
    const total = count();
    dial.style.setProperty('--spin', `${-state.position * STEP}deg`);
    const base = Math.round(state.position);
    const showImages = state.view === 'images';
    // SVGElement kennt keine hidden-Eigenschaft, daher das Attribut setzen.
    marker.toggleAttribute('hidden', !showImages || !total);
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const segment = segments[slot];
      const index = base + slot - Math.floor(SLOTS / 2);
      if (!showImages || index < 0 || index >= total) {
        segment.hidden = true;
        segment.style.removeProperty('--a');
        segment.replaceChildren();
        segment.dataset.key = '';
        continue;
      }
      segment.hidden = false;
      segment.style.setProperty('--a', `${(index - state.position) * STEP}deg`);
      const item = itemAt(index);
      if (segment.dataset.key !== item.key) {
        segment.dataset.key = item.key;
        segment.replaceChildren(thumbnail(item));
      }
    }
  }

  function thumbnail(item) {
    if (item.type.startsWith('image/')) {
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.loading = 'lazy';
      const cached = fileCache.get(item.key);
      if (cached) image.src = cached.url;
      else {
        image.dataset.pending = '1';
        loadFile(item)
          .then((url) => {
            if (image.isConnected) image.src = url;
          })
          .catch(() => {
            if (image.isConnected) image.replaceWith(glyphFor(item));
          });
      }
      return image;
    }
    return glyphFor(item);
  }

  function glyphFor(item) {
    const glyph = document.createElement('b');
    glyph.className = 'segment-glyph';
    glyph.textContent = item.type.startsWith('video/')
      ? '▶'
      : item.type === 'text/uri-list'
        ? '↗'
        : item.type === 'application/pdf'
          ? '▤'
          : '◉';
    return glyph;
  }

  function renderPrimary() {
    if (state.view === 'images') {
      folderStack.hidden = true;
      previewStack.hidden = false;
      renderPreview();
    } else {
      previewStack.hidden = true;
      folderStack.hidden = false;
      renderFolderNames();
    }
  }

  function renderFolderNames() {
    const total = count();
    const index = state.index;
    folderPrevious.textContent = index > 0 ? itemAt(index - 1).name : '';
    folderCurrent.textContent = total ? itemAt(index).name : 'KEINE EINTRÄGE';
    folderNext.textContent = index + 1 < total ? itemAt(index + 1).name : '';
    const drift = shortAngle((state.position - index) * STEP) / STEP;
    folderStack.style.setProperty('--drift', String(clamp(drift, -1, 1)));
    core.disabled = !total;
  }

  function renderPreview() {
    const item = itemAt(state.index);
    if (!item) {
      previewCanvas.replaceChildren();
      return;
    }
    if (previewCanvas.dataset.key === item.key) return;
    previewCanvas.dataset.key = item.key;
    previewCanvas.replaceChildren();
    if (item.type.startsWith('image/')) {
      const image = document.createElement('img');
      image.alt = item.name;
      previewCanvas.append(image);
      loadFile(item)
        .then((url) => {
          if (previewCanvas.dataset.key === item.key) image.src = url;
        })
        .catch((error) => {
          if (previewCanvas.dataset.key !== item.key) return;
          previewCanvas.replaceChildren(message(error.message));
        });
    } else if (item.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      previewCanvas.append(video);
      loadFile(item)
        .then((url) => {
          if (previewCanvas.dataset.key === item.key) video.src = url;
        })
        .catch((error) => {
          if (previewCanvas.dataset.key !== item.key) return;
          previewCanvas.replaceChildren(message(error.message));
        });
    } else if (item.type === 'text/uri-list') {
      const link = document.createElement('a');
      link.className = 'preview-link';
      link.href = item.data;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'WEBINHALT EXTERN ÖFFNEN';
      previewCanvas.append(link);
    } else {
      const frame = document.createElement('iframe');
      frame.title = item.name;
      previewCanvas.append(frame);
      loadFile(item)
        .then((url) => {
          if (previewCanvas.dataset.key === item.key) frame.src = url;
        })
        .catch((error) => {
          if (previewCanvas.dataset.key !== item.key) return;
          previewCanvas.replaceChildren(message(error.message));
        });
    }
  }

  function message(text) {
    const note = document.createElement('span');
    note.className = 'preview-note';
    note.textContent = text;
    return note;
  }

  function preloadNeighbours() {
    if (state.view !== 'images') return;
    const total = count();
    for (let offset = -PRELOAD; offset <= PRELOAD; offset += 1) {
      const index = state.index + offset;
      if (index < 0 || index >= total) continue;
      const item = itemAt(index);
      if (item.type.startsWith('image/') && !fileCache.has(item.key))
        loadFile(item).catch(() => {});
    }
  }

  function setIndex(index, { render = true } = {}) {
    const total = count();
    const next = total ? clamp(Math.round(index), 0, total - 1) : 0;
    const changed = next !== state.index;
    state.index = next;
    if (render) {
      if (state.view === 'images') renderPreview();
      else renderFolderNames();
    }
    if (changed && state.view === 'images') {
      preloadNeighbours();
      // Nur ein tatsächlich gewechseltes Bild löst eine Übertragung aus.
      if (state.mode === 'auto') scheduleAutoSwitch();
    }
    return changed;
  }

  function setPosition(value) {
    const total = count();
    state.position = total ? clamp(value, 0, total - 1) : 0;
    setIndex(state.position, { render: false });
    renderWheel();
    if (state.view === 'images') renderPreview();
    else renderFolderNames();
  }

  function animateTo(target, duration = 260) {
    cancelAnimationFrame(animation);
    window.clearTimeout(settleTimer);
    const from = state.position;
    const to = clamp(target, 0, Math.max(0, count() - 1));
    const finish = () => {
      cancelAnimationFrame(animation);
      window.clearTimeout(settleTimer);
      state.settling = false;
      setPosition(to);
      preloadNeighbours();
    };
    if (Math.abs(to - from) < 0.0005) {
      finish();
      return;
    }
    state.settling = true;
    const started = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        setPosition(from + (to - from) * eased);
        animation = requestAnimationFrame(tick);
      } else finish();
    };
    animation = requestAnimationFrame(tick);
    // Ausgeblendete Tabs und eingebettete Ansichten drosseln
    // requestAnimationFrame. Ohne diesen Nachlauf bliebe das Wheel im
    // Einrast-Zustand und die Mitte dauerhaft gesperrt.
    settleTimer = window.setTimeout(() => {
      if (state.settling) finish();
    }, duration + 90);
  }

  /* ----------------------------------------------------- Drehen und Rasten */

  let rotatePointer = null;
  let rotateAngle = 0;
  let rotateMoved = 0;
  let rotateVelocity = 0;
  let rotateTime = 0;

  function pointerAngle(event) {
    const box = dial.getBoundingClientRect();
    return (
      (Math.atan2(
        event.clientY - box.top - box.height / 2,
        event.clientX - box.left - box.width / 2,
      ) *
        180) /
      Math.PI
    );
  }

  dial.addEventListener('pointerdown', (event) => {
    if (event.target === core || rotatePointer !== null) return;
    if (!count()) return;
    cancelAnimationFrame(animation);
    state.settling = false;
    rotatePointer = event.pointerId;
    rotateAngle = pointerAngle(event);
    rotateMoved = 0;
    rotateVelocity = 0;
    rotateTime = performance.now();
    dial.setPointerCapture(event.pointerId);
  });

  dial.addEventListener('pointermove', (event) => {
    if (event.pointerId !== rotatePointer) return;
    const next = pointerAngle(event);
    const delta = shortAngle(next - rotateAngle);
    rotateAngle = next;
    rotateMoved += Math.abs(delta);
    if (!state.rotating && rotateMoved > 4) {
      state.rotating = true;
      browser.dataset.rotating = 'on';
    }
    if (!state.rotating) return;
    const now = performance.now();
    const steps = delta / STEP;
    rotateVelocity = steps / Math.max(8, now - rotateTime);
    rotateTime = now;
    setPosition(state.position + steps);
  });

  function endRotation(event) {
    if (event.pointerId !== rotatePointer) return;
    rotatePointer = null;
    if (!state.rotating) return;
    // Nur eine leichte Gewichtung der Rundung, kein freier Nachlauf.
    const carry = clamp(rotateVelocity * 45, -0.5, 0.5);
    const target = Math.round(state.position + carry);
    animateTo(target);
    window.setTimeout(() => {
      state.rotating = false;
      delete browser.dataset.rotating;
    }, 90);
  }

  dial.addEventListener('pointerup', endRotation);
  dial.addEventListener('pointercancel', endRotation);

  dial.addEventListener(
    'wheel',
    (event) => {
      if (!count()) return;
      event.preventDefault();
      cancelAnimationFrame(animation);
      animateTo(state.index + (event.deltaY > 0 ? 1 : -1), 200);
    },
    { passive: false },
  );

  wheel.addEventListener('keydown', (event) => {
    if (!count()) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      animateTo(state.index + 1, 180);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      animateTo(state.index - 1, 180);
    }
  });

  // In der Bildauswahl unterscheidet die Mitte zwischen Einzel- und
  // Doppeltipp. Der Einzelklick wird daher verzögert ausgewertet, damit ein
  // Doppeltipp nicht vorher den Modus umschaltet.
  let coreTapTimer = 0;
  core.addEventListener('click', () => {
    if (state.rotating || state.settling) return;
    if (state.view !== 'images') {
      activate(itemAt(state.index));
      return;
    }
    if (coreTapTimer) {
      window.clearTimeout(coreTapTimer);
      coreTapTimer = 0;
      goBack();
      return;
    }
    coreTapTimer = window.setTimeout(() => {
      coreTapTimer = 0;
      if (state.rotating || state.settling) return;
      toggleMode();
    }, 290);
  });

  backButton.addEventListener('click', () => goBack());
  transferButton?.addEventListener('click', () =>
    sendCurrent(null, 'transfer'),
  );

  /* ------------------------------------------------------------- Dateien */

  function loadFile(item) {
    if (item.data) return Promise.resolve(item.data);
    const cached = fileCache.get(item.key);
    if (cached) return Promise.resolve(cached.url);
    const running = pendingFiles.get(item.key);
    if (running) return running;
    const request = displays
      .mediaSourceFile(item.sourceId, item.path)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        fileCache.set(item.key, { url, blob });
        trimCache();
        return url;
      })
      .finally(() => pendingFiles.delete(item.key));
    pendingFiles.set(item.key, request);
    return request;
  }

  function protectedKeys() {
    const keys = new Set();
    const total = count();
    for (let offset = -PRELOAD - 2; offset <= PRELOAD + 2; offset += 1) {
      const index = state.index + offset;
      if (index >= 0 && index < total) keys.add(itemAt(index)?.key);
    }
    return keys;
  }

  function trimCache() {
    if (fileCache.size <= CACHE_LIMIT) return;
    const keep = protectedKeys();
    for (const key of [...fileCache.keys()]) {
      if (fileCache.size <= CACHE_LIMIT) break;
      if (keep.has(key)) continue;
      URL.revokeObjectURL(fileCache.get(key).url);
      fileCache.delete(key);
    }
  }

  function readDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('DATEI NICHT LESBAR'));
      reader.readAsDataURL(blob);
    });
  }

  async function mediaPayload(item) {
    if (item.data)
      return {
        title: item.name,
        type: item.type,
        data: item.data,
        source: item.source || 'LOKAL',
      };
    await loadFile(item);
    const cached = fileCache.get(item.key);
    if (!cached) throw new Error('DATEI NICHT GELADEN');
    return {
      title: item.name,
      type: item.type,
      data: await readDataUrl(cached.blob),
      source: item.source || 'NAS',
    };
  }

  /* --------------------------------------------------------- Navigation */

  async function openRoot(keepIndex = 0) {
    setStatus('QUELLEN WERDEN GELESEN …');
    const sources = await displays.mediaSources().catch(() => []);
    const entries = sources.map((source) => ({
      kind: 'source',
      name: String(source.name || 'QUELLE').toUpperCase(),
      sourceId: source.id,
      path: '',
    }));
    if (library.length)
      entries.unshift({ kind: 'library', name: 'IMPORTIERTE MEDIEN' });
    entries.push({ kind: 'pick', name: 'LOKALE DATEI ÖFFNEN' });
    entries.push({ kind: 'settings', name: 'QUELLEN & EINSTELLUNGEN' });
    setStatus(sources.length ? '' : 'KEINE NAS-QUELLE GESPEICHERT');
    showLevel({ title: 'STARK OS', entries, parent: null }, keepIndex);
  }

  function showLevel(level, index = 0) {
    closePreview();
    state.view = 'folders';
    browser.dataset.view = 'folders';
    state.level = level;
    state.collection = null;
    applyMode();
    core.disabled = !level.entries.length;
    const total = level.entries.length;
    state.index = total ? clamp(index, 0, total - 1) : 0;
    state.position = state.index;
    renderPrimary();
    renderWheel();
  }

  async function activate(entry) {
    if (!entry) return;
    if (state.level) state.level.index = state.index;
    if (entry.kind === 'pick') {
      options.pickLocal?.();
      return;
    }
    if (entry.kind === 'settings') {
      options.openSources?.();
      return;
    }
    if (entry.kind === 'library') {
      showCollection(
        {
          title: 'IMPORTIERTE MEDIEN',
          items: library.map((media, index) => ({
            key: `local:${index}:${media.title}`,
            name: media.title,
            type: media.type,
            data: media.data,
            source: media.source,
          })),
        },
        state.level,
      );
      return;
    }
    await openFolder(entry);
  }

  async function openFolder(entry) {
    const parent = state.level;
    core.disabled = true;
    setStatus('ORDNER WIRD GELADEN …');
    let entries;
    try {
      entries = await displays.browseMediaSource(entry.sourceId, entry.path);
    } catch (error) {
      core.disabled = false;
      setStatus(error.message || 'ORDNER NICHT ERREICHBAR');
      return;
    }
    core.disabled = false;
    const folders = entries
      .filter((item) => item.directory)
      .map((item) => ({
        kind: 'folder',
        name: item.name,
        sourceId: entry.sourceId,
        path: item.path,
      }));
    const files = entries
      .filter((item) => !item.directory && MEDIA_PATTERN.test(entryType(item)))
      .map((item) => ({
        key: `${entry.sourceId}:${item.path}`,
        name: item.name,
        type: entryType(item),
        sourceId: entry.sourceId,
        path: item.path,
        source: `NAS · ${entry.name}`,
      }));
    const level = {
      title: entry.name,
      entries: folders,
      sourceId: entry.sourceId,
      path: entry.path,
      parent,
    };
    if (files.length) {
      setStatus('');
      showCollection(
        { title: entry.name, items: files },
        folders.length ? level : parent,
      );
      return;
    }
    if (!folders.length) {
      setStatus('LEERER ORDNER');
      return;
    }
    setStatus('');
    showLevel(level, 0);
  }

  function showCollection(collection, back) {
    closePreview();
    state.view = 'images';
    browser.dataset.view = 'images';
    state.collection = { ...collection, back: back || null };
    applyMode();
    core.disabled = !collection.items.length;
    state.index = 0;
    state.position = 0;
    previewCanvas.dataset.key = '';
    renderPrimary();
    renderWheel();
    preloadNeighbours();
    refreshReceiver();
  }

  function goBack() {
    if (state.view === 'images') {
      const back = state.collection?.back;
      setStatus('');
      if (back) showLevel(back, back.index || 0);
      else openRoot();
      return;
    }
    const parent = state.level?.parent;
    if (parent) showLevel(parent, parent.index || 0);
    else openRoot();
  }

  /* ------------------------------------------------------------ Receiver */

  async function refreshReceiver() {
    if (destroyed) return;
    const devices = await displays.list().catch(() => []);
    const receiver =
      devices.find(
        (device) => selectedDisplays.has(device.id) && device.connected,
      ) ||
      devices.find((device) => device.connected) ||
      null;
    state.receiver = receiver;
    receiverName.textContent = receiver ? receiver.name : 'KEIN RECEIVER';
    receiverChip.dataset.online = receiver ? 'yes' : 'no';
    syncConfirmedFromReceiver(receiver);
    // Die Rückmeldung einer Übertragung bleibt kurz stehen, damit der
    // Statuslauf sie nicht sofort überschreibt.
    if (state.sending || Date.now() < state.holdUntil) return;
    setReceiverState(
      receiver
        ? receiver.state?.current
          ? 'AKTIV'
          : 'BEREIT'
        : 'NICHT VERBUNDEN',
    );
  }

  /**
   * Der gemeldete Zustand des Receivers hat Vorrang vor der lokalen Annahme;
   * ohne gemeldeten Inhalt wird keine Darstellung vorgetäuscht.
   */
  function syncConfirmedFromReceiver(receiver) {
    const current = receiver?.state?.current;
    if (!receiver || !receiver.connected || !current) {
      if (state.confirmed) {
        state.confirmed = null;
        renderTop();
      }
      return;
    }
    const zoom = Number(receiver.state?.transform?.zoom);
    if (Number.isFinite(zoom) && zoom > 0) state.confirmedZoom = zoom;
    if (current.title && current.title !== state.confirmed?.name) {
      state.confirmed = {
        key: state.confirmed?.key || null,
        name: current.title,
        index: state.confirmed?.index ?? -1,
        total:
          state.confirmed?.name === current.title ? state.confirmed.total : 0,
        url:
          state.confirmed?.name === current.title ? state.confirmed.url : null,
      };
    }
    renderTop();
  }

  /* -------------------------------------------------------------- Senden */

  async function sendCurrent(explicitTargets, mode = 'show', options = {}) {
    if (state.sending || state.view !== 'images') return;
    const index = options.index ?? state.index;
    const item = itemAt(index);
    if (!item) return;
    state.sending = true;
    setReceiverState(mode === 'transfer' ? 'ÜBERTRÄGT …' : 'SENDET …', true);
    try {
      const devices = await displays.list().catch(() => []);
      const online = new Set(
        devices.filter((device) => device.connected).map((device) => device.id),
      );
      let targets = (
        explicitTargets?.length ? explicitTargets : [...selectedDisplays]
      ).filter((id) => online.has(id));
      if (!targets.length && !explicitTargets?.length) {
        const fallback = devices.find((device) => device.connected);
        if (fallback) targets = [fallback.id];
      }
      if (!targets.length) {
        setReceiverState('KEIN RECEIVER ONLINE');
        return;
      }
      const media = await mediaPayload(item);
      const result = await displays.command(targets, 'media.show', {
        media,
        mode,
      });
      const accepted = result.results.filter((entry) => entry.accepted).length;
      const done = mode === 'transfer' ? 'ÜBERTRAGEN' : 'GESENDET';
      if (accepted) {
        setReceiverState(
          accepted > 1 ? `${done} · ${accepted} DISPLAYS` : done,
        );
        // Erst die bestätigte Übertragung aktualisiert die obere Anzeige.
        if (mode !== 'transfer') markConfirmed(item, index);
      } else setReceiverState(result.results[0]?.error || 'NICHT ANGENOMMEN');
    } catch (error) {
      setReceiverState(error.message || 'ÜBERTRAGUNG FEHLGESCHLAGEN');
    } finally {
      state.sending = false;
      state.holdUntil = Date.now() + 2600;
      window.setTimeout(() => {
        if (!state.sending) refreshReceiver();
      }, 2700);
    }
  }

  /* --------------------------------------------------- Übertragungsmodi */

  function applyMode() {
    browser.dataset.mode = state.mode;
    if (state.view !== 'images') {
      core.setAttribute('aria-label', 'Ordner laden');
      core.removeAttribute('aria-pressed');
      return;
    }
    core.setAttribute(
      'aria-label',
      state.mode === 'auto'
        ? 'Übertragungsmodus Auto-Switch aktiv. Einmal tippen schaltet auf manuelle Übertragung, zweimal tippen führt zurück zur Ordnerauswahl.'
        : 'Übertragungsmodus manuell. Einmal tippen aktiviert Auto-Switch, zweimal tippen führt zurück zur Ordnerauswahl.',
    );
    core.setAttribute('aria-pressed', String(state.mode === 'auto'));
  }

  function toggleMode() {
    if (state.view !== 'images') return;
    state.mode = state.mode === 'auto' ? 'manual' : 'auto';
    applyMode();
    setStatus(
      state.mode === 'auto' ? 'AUTO-SWITCH AKTIV' : 'MANUELLE ÜBERTRAGUNG',
    );
    window.setTimeout(() => {
      if (!state.rotating) setStatus('');
    }, 2200);
    // Beim Aktivieren wandert die aktuelle Auswahl sofort zum Receiver.
    // Beim Deaktivieren bleibt der zuletzt gezeigte Inhalt dort stehen.
    if (state.mode === 'auto') scheduleAutoSwitch(0);
  }

  // Schnelle Auswahlwechsel werden zusammengefasst; eine veraltete Anfrage
  // wird verworfen, die zuletzt gewählte Position aber nachgezogen.
  let autoTimer = 0;
  let autoWanted = -1;

  function scheduleAutoSwitch(delay = 140) {
    autoWanted = state.index;
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(runAutoSwitch, delay);
  }

  async function runAutoSwitch() {
    if (destroyed || state.mode !== 'auto' || state.view !== 'images') return;
    if (state.sending || state.rotating) {
      window.clearTimeout(autoTimer);
      autoTimer = window.setTimeout(runAutoSwitch, 130);
      return;
    }
    const wanted = autoWanted;
    await sendCurrent(null, 'show', { index: wanted, silent: true });
    if (state.mode === 'auto' && autoWanted !== wanted) scheduleAutoSwitch(0);
  }

  /* --------------------------------------------- Aufgezogene Bildansicht */

  /**
   * Die Vorschau wächst um ihre eigene Mitte. Der größtmögliche Faktor ergibt
   * sich deshalb aus dem Abstand jeder Kante zum Containerrand, nicht aus dem
   * Größenverhältnis. So bleibt auch vergrößert auf allen vier Seiten Abstand.
   */
  function openableScale() {
    const applied = previewFrame.style.transform;
    previewFrame.style.transform = 'none';
    const frame = previewFrame.getBoundingClientRect();
    previewFrame.style.transform = applied;
    const area = browser.getBoundingClientRect();
    const margin = 12;
    const halfWidth = Math.max(1, frame.width / 2);
    const halfHeight = Math.max(1, frame.height / 2);
    const centerX = frame.left + frame.width / 2;
    const centerY = frame.top + frame.height / 2;
    return clamp(
      Math.min(
        (centerX - (area.left + margin)) / halfWidth,
        (area.right - margin - centerX) / halfWidth,
        (centerY - (area.top + margin)) / halfHeight,
        (area.bottom - margin - centerY) / halfHeight,
      ),
      1,
      2.4,
    );
  }

  function applyOpenTransform() {
    previewFrame.style.transform = state.opened
      ? `scale(${state.openScale.toFixed(3)})`
      : '';
    previewFrame.style.setProperty('--zoom', String(state.zoom.toFixed(3)));
    previewFrame.style.setProperty('--pan-x', `${Math.round(state.pan.x)}px`);
    previewFrame.style.setProperty('--pan-y', `${Math.round(state.pan.y)}px`);
  }

  function clampPan() {
    const image = previewCanvas.querySelector('img');
    const width = image ? image.clientWidth : previewFrame.offsetWidth;
    const height = image ? image.clientHeight : previewFrame.offsetHeight;
    const maxX = Math.max(
      0,
      (width * state.zoom - previewFrame.offsetWidth) / 2,
    );
    const maxY = Math.max(
      0,
      (height * state.zoom - previewFrame.offsetHeight) / 2,
    );
    state.pan.x = clamp(state.pan.x, -maxX, maxX);
    state.pan.y = clamp(state.pan.y, -maxY, maxY);
  }

  function openPreview() {
    if (state.opened || state.view !== 'images') return;
    state.opened = true;
    state.openScale = openableScale();
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    browser.dataset.opened = 'on';
    browser.style.setProperty('--pinch', '1');
    applyOpenTransform();
  }

  // Zurück zur Bildauswahl: der Empfänger behält seinen Inhalt samt
  // Darstellung, nur die lokale Ansicht verkleinert sich.
  function closePreview() {
    if (!state.opened) return;
    state.opened = false;
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    delete browser.dataset.opened;
    browser.style.setProperty('--pinch', '0');
    applyOpenTransform();
  }

  let transformTimer = 0;
  let transformSentAt = 0;

  function pushTransform(immediate = false) {
    const wait = immediate ? 0 : 110;
    window.clearTimeout(transformTimer);
    const elapsed = Date.now() - transformSentAt;
    transformTimer = window.setTimeout(
      sendTransform,
      Math.max(0, wait - elapsed),
    );
  }

  async function sendTransform() {
    const receiver = state.receiver;
    if (!receiver?.connected) return;
    // Nur für die laufende Medien- und Empfängersitzung.
    const sessionId = receiver.state?.current?.sessionId;
    if (!sessionId) return;
    transformSentAt = Date.now();
    const payload = {
      zoom: Number(state.zoom.toFixed(3)),
      x: Math.round(state.pan.x),
      y: Math.round(state.pan.y),
      rotation: 0,
      sessionId,
    };
    try {
      const result = await displays.command(
        [receiver.id],
        'image.transform',
        payload,
      );
      if (result.results?.some((entry) => entry.accepted)) {
        state.confirmedZoom = payload.zoom;
        renderTop();
      }
    } catch {
      /* Fehler bleiben ohne Erfolgsmeldung; der Status kommt aus refreshReceiver. */
    }
  }

  /* ------------------------------------------------- Pinch und Tastgesten */

  const pointers = new Map();
  const PINCH_SPREAD = 1.28; // bewusst auseinandergezogene Finger
  const MAX_ZOOM = 4;
  let pinchBase = 0;
  let pinchMax = 1;
  let pinchPeak = 1;
  let pinchRawPeak = 1;
  let pinchArmed = false;
  let zoomBase = 1;
  let panOrigin = null;
  let panActive = false; // erst eine echte Bewegung gilt als Verschieben
  let tapTime = 0;
  let tapOrigin = null;
  let tapDragging = false;

  function pointerDistance() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function cancelTap() {
    tapOrigin = null;
    tapDragging = false;
    panOrigin = null;
    panActive = false;
    previewFrame.classList.remove('is-dragging');
  }

  function beginPinch() {
    cancelTap();
    pinchBase = pointerDistance();
    pinchPeak = 1;
    pinchRawPeak = 1;
    previewFrame.style.transition = 'none';
    if (state.opened) {
      // In der geöffneten Ansicht zoomt jede weitere Zwei-Finger-Geste nur.
      zoomBase = state.zoom;
      pinchArmed = false;
      return;
    }
    pinchMax = openableScale();
    pinchArmed = true;
    browser.dataset.pinch = 'on';
  }

  function updatePinch() {
    if (!pinchBase) return;
    const raw = pointerDistance() / pinchBase;
    if (state.opened) {
      state.zoom = clamp(zoomBase * raw, 1, MAX_ZOOM);
      clampPan();
      applyOpenTransform();
      pushTransform();
      return;
    }
    if (!pinchArmed) return;
    pinchRawPeak = Math.max(pinchRawPeak, raw);
    const scale = clamp(raw, 1, pinchMax);
    pinchPeak = Math.max(pinchPeak, scale);
    previewFrame.style.transform = `scale(${scale.toFixed(3)})`;
    browser.style.setProperty(
      '--pinch',
      String(clamp((scale - 1) / Math.max(0.0001, pinchMax - 1), 0, 1)),
    );
  }

  function finishPinch(complete) {
    previewFrame.style.transition = '';
    pinchBase = 0;
    if (state.opened) {
      pushTransform(true);
      return;
    }
    if (!pinchArmed) return;
    // Die Finger müssen bewusst auseinandergezogen werden; zusätzlich muss die
    // Vorschau den erreichbaren Spielraum deutlich ausnutzen.
    const reached =
      pinchRawPeak >= PINCH_SPREAD && pinchPeak >= 1 + (pinchMax - 1) * 0.5;
    pinchArmed = false;
    if (!complete || !reached) {
      previewFrame.style.transform = '';
      browser.style.setProperty('--pinch', '0');
      delete browser.dataset.pinch;
      return;
    }
    delete browser.dataset.pinch;
    openPreview();
    // Die öffnende Geste sendet nur im manuellen Modus; im Auto-Switch liegt
    // das Bild bereits auf dem Empfänger.
    if (state.mode === 'manual') sendCurrent();
  }

  previewFrame.addEventListener('pointerdown', (event) => {
    if (state.view !== 'images') return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previewFrame.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      beginPinch();
      return;
    }
    if (pointers.size > 2) return;
    tapOrigin = { x: event.clientX, y: event.clientY };
    tapDragging = false;
    if (state.opened && state.zoom > 1) {
      panOrigin = { x: state.pan.x, y: state.pan.y };
      panActive = false;
    }
  });

  previewFrame.addEventListener('pointermove', (event) => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (pointers.size === 2) {
      updatePinch();
      return;
    }
    if (!tapOrigin) return;
    const dx = event.clientX - tapOrigin.x;
    const dy = event.clientY - tapOrigin.y;
    if (panOrigin) {
      if (!panActive && Math.hypot(dx, dy) < 5) return;
      panActive = true;
      // Verschieben im vergrößerten Bild, umgerechnet auf die Rahmengröße.
      state.pan.x = panOrigin.x + dx / state.openScale;
      state.pan.y = panOrigin.y + dy / state.openScale;
      clampPan();
      applyOpenTransform();
      pushTransform();
      return;
    }
    if (Math.hypot(dx, dy) > 16) {
      tapDragging = true;
      if (!state.opened) previewFrame.classList.add('is-dragging');
    }
  });

  function releasePointer(event, complete) {
    if (!pointers.has(event.pointerId)) return;
    const wasPinch = pointers.size === 2;
    pointers.delete(event.pointerId);
    if (wasPinch) {
      finishPinch(complete);
      return;
    }
    if (pointers.size) return;
    if (panActive) {
      pushTransform(true);
      cancelTap();
      return;
    }
    panOrigin = null;
    const dragging = tapDragging;
    const origin = tapOrigin;
    cancelTap();
    if (!complete || !origin) return;
    if (state.opened) {
      // Einfaches Antippen schließt nichts; nur der Doppeltipp verkleinert.
      if (dragging) return;
      const now = performance.now();
      if (now - tapTime < 330) {
        tapTime = 0;
        closePreview();
      } else tapTime = now;
      return;
    }
    if (dragging) {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('.device-target');
      if (target && !target.disabled) sendCurrent([target.dataset.id]);
      return;
    }
    const now = performance.now();
    if (now - tapTime < 330) {
      tapTime = 0;
      sendCurrent();
    } else tapTime = now;
  }

  previewFrame.addEventListener('pointerup', (event) =>
    releasePointer(event, true),
  );
  previewFrame.addEventListener('pointercancel', (event) =>
    releasePointer(event, false),
  );
  previewFrame.addEventListener(
    'touchmove',
    (event) => {
      // Eigene Gesten behandeln, ohne die Home-Assistant-Oberfläche mitzuzoomen.
      if (event.touches.length > 1 || state.opened) event.preventDefault();
    },
    { passive: false },
  );

  function cancelGestures() {
    if (pointers.size || pinchArmed || panOrigin) {
      pointers.clear();
      if (pinchArmed) finishPinch(false);
      panOrigin = null;
      pinchBase = 0;
    }
    cancelTap();
    if (rotatePointer !== null) {
      rotatePointer = null;
      state.rotating = false;
      delete browser.dataset.rotating;
      animateTo(Math.round(state.position), 160);
    }
  }
  /* ----------------------------------------------------------------- Start */

  applyLayout();
  applyMode();
  renderTop();
  openRoot();
  refreshReceiver();
  receiverTimer = window.setInterval(() => {
    if (!browser.isConnected) {
      window.clearInterval(receiverTimer);
      return;
    }
    refreshReceiver();
  }, 2500);

  return {
    refreshReceiver,
    refreshSources: () => {
      if (state.view === 'folders' && !state.level?.parent)
        openRoot(state.index);
    },
    openSource: (source) =>
      activate({
        kind: 'source',
        name: String(source.name || 'QUELLE').toUpperCase(),
        sourceId: source.id,
        path: '',
      }),
    showLibrary: () => {
      if (!library.length) return;
      showCollection(
        {
          title: 'IMPORTIERTE MEDIEN',
          items: library.map((media, index) => ({
            key: `local:${index}:${media.title}`,
            name: media.title,
            type: media.type,
            data: media.data,
            source: media.source,
          })),
        },
        state.view === 'folders' ? state.level : state.collection?.back,
      );
    },
    destroy: () => {
      destroyed = true;
      window.clearInterval(receiverTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(autoTimer);
      window.clearTimeout(transformTimer);
      window.clearTimeout(coreTapTimer);
      cancelAnimationFrame(animation);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      for (const entry of fileCache.values()) URL.revokeObjectURL(entry.url);
      fileCache.clear();
    },
  };
}
