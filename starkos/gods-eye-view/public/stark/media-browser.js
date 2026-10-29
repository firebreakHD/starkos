/**
 * STARK OS Medienbrowser.
 *
 * Gestaltung und Bedienabläufe folgen der freigegebenen Referenzdemo: ein auf
 * Canvas gezeichnetes Wheel mit Ringen, Segmenten und Miniaturen, die feste
 * gelbe Auswahl auf zwölf Uhr, drei Ordnernamen mit großer fetter Mitte und
 * eine aufgezogene Bildansicht, die geöffnet bleibt.
 *
 * Die Simulationen der Demo sind ersetzt: Einträge kommen aus den vorhandenen
 * Medienquellen, Übertragungen laufen über die bestehende authentifizierte
 * Receiver-Steuerung, und angezeigt wird nur, was der Receiver bestätigt hat.
 */

const STEP = Math.PI / 6; // zwölf Segmente auf dem Ring
const DRAG_PER_STEP = 0.6; // Bogenmaß Fingerweg je Eintrag (langsam, kontrolliert)
const SNAP_DELAY = 160; // Stillstand bis zum Einrasten
const TAP_DELAY = 320; // Fenster zur Unterscheidung Einzel-/Doppeltipp
const PRELOAD = 4;
const CACHE_LIMIT = 24;
const MAX_ZOOM = 4;
const OPEN_THRESHOLD = 1.04; // ab hier wird die Ansicht sichtbar aufgezogen
const SEND_THRESHOLD = 1.23; // ab hier gilt die Geste als bewusst abgeschlossen
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root Panel-Body mit dem Medien-Template
 * @param {object} options.displays bestehende DisplayApi-Instanz
 * @param {Array} options.library bereits importierte lokale Medien
 * @param {Set<string>} options.selectedDisplays ausgewählte Receiver
 * @param {() => void} [options.openSources] öffnet die Quellenverwaltung
 * @param {() => void} [options.pickLocal] öffnet den Dateidialog
 * @param {() => void} [options.onExit] verlässt den Medienbrowser
 */
export function createMediaBrowser(options) {
  const { root, displays, library, selectedDisplays } = options;
  const $ = (selector) => root.querySelector(selector);

  const browser = $('#starkBrowser');
  if (!browser) return null;

  const backButton = $('#browserBack');
  const receiverThumb = $('#receiverThumb');
  const receiverName = $('#receiverName');
  const receiverShown = $('#receiverShown');
  const folderPrevious = $('#folderPrevious');
  const folderCurrent = $('#folderCurrent');
  const folderNext = $('#folderNext');
  const folderStack = $('#folderStack');
  const previewStack = $('#previewStack');
  const previewFrame = $('#previewFrame');
  const previewCanvas = $('#previewCanvas');
  const statusLine = $('#browserStatus');
  const wheel = $('#browserWheel');
  const canvas = $('#wheelCanvas');
  const context = canvas.getContext('2d');
  const hub = $('#wheelCore');
  const wheelIndex = $('#wheelIndex');
  const overlay = $('#expandedView');
  const overlayImage = $('#expandedImage');
  const castState = $('#castState');

  const state = {
    view: 'folders',
    level: null,
    collection: null,
    position: 0,
    index: 0,
    mode: 'manual', // Auto-Switch wird bewusst aktiviert
    expanded: false,
    zoom: 1,
    pan: { x: 0, y: 0 },
    sending: false,
    holdUntil: 0,
    receiver: null,
    shown: null, // bestätigter Inhalt des Receivers
    shownZoom: 1,
  };

  const fileCache = new Map(); // key -> { url, blob }
  const imageCache = new Map(); // key -> HTMLImageElement
  const pendingFiles = new Map();
  let destroyed = false;
  let receiverTimer = 0;
  let snapTimer = 0;
  let hubTimer = 0;
  let autoTimer = 0;
  let transformTimer = 0;
  let paintPending = false;

  /* ---------------------------------------------------------------- Layout */

  function applyLayout() {
    if (!browser.isConnected) return;
    const width = browser.clientWidth;
    const height = browser.clientHeight;
    if (!width || !height) return;
    const portrait = height >= width;
    browser.dataset.orientation = portrait ? 'portrait' : 'landscape';
    // Der Faktor hält das vollständige Wheel samt Rand im Container.
    const size = portrait
      ? Math.min(width - 24, (height - 120) * 0.52, 420)
      : Math.min(height - 90, (width - 36) * 0.46, 420);
    browser.style.setProperty(
      '--wheel-size',
      `${Math.max(140, Math.round(size))}px`,
    );
    schedule();
  }

  function handleViewportChange() {
    // Eine laufende Geste wird sauber beendet, damit das Drehen des Geräts
    // weder lädt noch sendet.
    cancelGestures();
    applyLayout();
  }

  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(handleViewportChange)
      : null;
  resizeObserver?.observe(browser);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', handleViewportChange);

  /* ------------------------------------------------------------- Sammlung */

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

  /* ------------------------------------------------------- Canvas-Zeichnung */

  function point(radius, angle) {
    return [Math.sin(angle) * radius, -Math.cos(angle) * radius];
  }

  function wedge(inner, outer, angle, half) {
    context.beginPath();
    const start = angle - half - Math.PI / 2;
    const end = angle + half - Math.PI / 2;
    context.arc(0, 0, outer, start, end);
    context.arc(0, 0, inner, end, start, true);
    context.closePath();
  }

  function draw() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const size = box.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
    const R = size * 0.48;
    context.clearRect(-size, -size, size * 2, size * 2);

    context.lineWidth = 0.8;
    context.strokeStyle = '#16627b';
    for (const k of [1, 0.98, 0.95, 0.69, 0.59, 0.4, 0.34]) {
      context.beginPath();
      context.arc(0, 0, R * k, 0, Math.PI * 2);
      context.stroke();
    }
    for (let j = 0; j < 120; j += 1) {
      const a = (j * Math.PI) / 60;
      const major = j % 5 === 0;
      context.strokeStyle = major ? '#39bee8' : '#16506a';
      const inner = point(R * 0.57, a);
      const innerEnd = point(R * (major ? 0.52 : 0.545), a);
      context.beginPath();
      context.moveTo(...inner);
      context.lineTo(...innerEnd);
      context.stroke();
      const outer = point(R * 0.96, a);
      const outerEnd = point(R * (major ? 0.93 : 0.945), a);
      context.beginPath();
      context.moveTo(...outer);
      context.lineTo(...outerEnd);
      context.stroke();
    }

    const total = count();
    const images = state.view === 'images';
    const base = Math.round(state.position);
    for (let j = -6; j <= 6; j += 1) {
      const n = base + j;
      if (n < 0 || n >= total) continue;
      const a = (n - state.position) * STEP;
      wedge(R * 0.69, R * 0.925, a, STEP * 0.47);
      if (images) {
        const picture = thumbnailFor(n);
        if (picture?.complete && picture.naturalWidth) {
          context.save();
          context.clip();
          const centre = point(R * 0.81, a);
          context.translate(...centre);
          context.rotate(a);
          context.drawImage(picture, -R * 0.25, -R * 0.15, R * 0.5, R * 0.3);
          context.restore();
        }
      }
      context.lineWidth = 0.8;
      context.strokeStyle = '#22677c';
      context.stroke();
    }

    if (images && total) {
      wedge(R * 0.685, R * 0.93, 0, STEP * 0.48);
      context.strokeStyle = '#ffd074';
      context.lineWidth = 2;
      context.shadowColor = '#ffbd4c';
      context.shadowBlur = 9;
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = '#ffc95d';
      context.beginPath();
      context.arc(0, -R * 0.965, 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function schedule() {
    if (paintPending) return;
    paintPending = true;
    requestAnimationFrame(() => {
      paintPending = false;
      render();
    });
    // Ausgeblendete Tabs und eingebettete Ansichten drosseln
    // requestAnimationFrame; dieser Nachlauf hält die Anzeige aktuell.
    window.setTimeout(() => {
      if (!paintPending) return;
      paintPending = false;
      render();
    }, 120);
  }

  /** Miniatur für das Wheel; wird bei Bedarf geladen und wiederverwendet. */
  function thumbnailFor(index) {
    const item = itemAt(index);
    if (!item || !item.type.startsWith('image/')) return null;
    const cached = imageCache.get(item.key);
    if (cached) return cached;
    const url = item.data || fileCache.get(item.key)?.url;
    if (!url) {
      loadFile(item)
        .then(() => schedule())
        .catch(() => {});
      return null;
    }
    const picture = new Image();
    picture.decoding = 'async';
    picture.onload = () => schedule();
    picture.src = url;
    imageCache.set(item.key, picture);
    return picture;
  }

  /* ------------------------------------------------------------- Rendering */

  function render() {
    const total = count();
    const index = Math.round(state.position);
    if (state.view === 'images') {
      folderStack.hidden = true;
      previewStack.hidden = false;
      wheelIndex.textContent = total ? `${index + 1} / ${total}` : '';
      renderPreview();
    } else {
      previewStack.hidden = true;
      folderStack.hidden = false;
      wheelIndex.textContent = '';
      folderPrevious.textContent = index > 0 ? itemAt(index - 1).name : '';
      folderCurrent.textContent = total ? itemAt(index).name : 'KEINE EINTRÄGE';
      folderNext.textContent = index + 1 < total ? itemAt(index + 1).name : '';
    }
    applyMode();
    applyBackLabel();
    draw();
  }

  function renderPreview() {
    const item = itemAt(state.index);
    if (!item) {
      previewCanvas.replaceChildren();
      previewCanvas.dataset.key = '';
      return;
    }
    if (previewCanvas.dataset.key === item.key) return;
    previewCanvas.dataset.key = item.key;
    previewCanvas.replaceChildren();
    const show = (node, apply) => {
      previewCanvas.append(node);
      loadFile(item)
        .then((url) => {
          if (previewCanvas.dataset.key === item.key) apply(url);
        })
        .catch((error) => {
          if (previewCanvas.dataset.key !== item.key) return;
          previewCanvas.replaceChildren(note(error.message));
        });
    };
    if (item.type.startsWith('image/')) {
      const picture = document.createElement('img');
      picture.alt = item.name;
      picture.draggable = false;
      show(picture, (url) => {
        picture.src = url;
      });
    } else if (item.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      show(video, (url) => {
        video.src = url;
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
      show(frame, (url) => {
        frame.src = url;
      });
    }
  }

  function note(text) {
    const element = document.createElement('span');
    element.className = 'preview-note';
    element.textContent = text;
    return element;
  }

  function setStatus(text) {
    statusLine.textContent = text;
  }

  /** Statuszeile unter der Vorschau: Receiver und tatsächlicher Zustand. */
  function receiverStatus(extra) {
    if (state.view !== 'images') return;
    if (extra) {
      setStatus(`▱  ${extra}`);
      return;
    }
    const name = state.receiver?.name || 'KEIN RECEIVER';
    const connected = Boolean(state.receiver?.connected);
    setStatus(
      `▱  ${name} · ${connected ? (state.shown ? 'AKTIV' : 'BEREIT') : 'NICHT VERBUNDEN'}`,
    );
  }

  function applyMode() {
    browser.dataset.mode = state.mode;
    if (state.view !== 'images') {
      hub.setAttribute('aria-label', 'Ausgewählten Ordner laden');
      hub.removeAttribute('aria-pressed');
      return;
    }
    hub.setAttribute(
      'aria-label',
      state.mode === 'auto'
        ? 'Auto-Switch aktiv. Einfach tippen: auf manuelle Übertragung wechseln. Doppeltippen: Ordnerauswahl.'
        : 'Manuelle Übertragung. Einfach tippen: Auto-Switch aktivieren. Doppeltippen: Ordnerauswahl.',
    );
    hub.setAttribute('aria-pressed', String(state.mode === 'auto'));
  }

  function applyBackLabel() {
    const label = state.expanded
      ? 'Vergrößerte Ansicht schließen'
      : state.view === 'images'
        ? 'Zur Ordnerauswahl'
        : state.level?.parent
          ? 'Eine Ordnerebene zurück'
          : 'Medienbrowser schließen';
    backButton.setAttribute('aria-label', label);
    backButton.title = label;
  }

  /* --------------------------------------------------------------- Drehen */

  let dragging = false;
  let lastAngle = 0;

  function pointerAngle(event) {
    const box = canvas.getBoundingClientRect();
    return Math.atan2(
      event.clientX - box.left - box.width / 2,
      -(event.clientY - box.top - box.height / 2),
    );
  }

  function move(delta) {
    if (state.expanded) return;
    const total = count();
    if (!total) return;
    state.position = clamp(state.position + delta, 0, total - 1);
    state.index = Math.round(state.position);
    hub.disabled = true;
    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => {
      if (!dragging) snap();
    }, SNAP_DELAY);
    maybeAutoSwitch();
    schedule();
  }

  function snap() {
    state.position = Math.round(state.position);
    state.index = state.position;
    hub.disabled = !count();
    maybeAutoSwitch();
    preloadNeighbours();
    render();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (state.expanded || (event.button && event.button !== 0)) return;
    dragging = true;
    lastAngle = pointerAngle(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const next = pointerAngle(event);
    let diff = next - lastAngle;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    lastAngle = next;
    move(-diff / DRAG_PER_STEP);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    snap();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      move(clamp(event.deltaY / 180, -0.55, 0.55));
    },
    { passive: false },
  );
  wheel.addEventListener('keydown', (event) => {
    if (state.expanded || !count()) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      snap();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      snap();
    }
  });

  /* ------------------------------------------------------------ Wheel-Mitte */

  hub.addEventListener('click', () => {
    if (dragging || hub.disabled) return;
    if (state.view !== 'images') {
      activate(itemAt(state.index));
      return;
    }
    // Der Einzelklick wird verzögert ausgewertet, damit ein Doppeltipp nicht
    // vorher den Modus umschaltet oder eine Übertragung auslöst.
    if (hubTimer) {
      window.clearTimeout(hubTimer);
      hubTimer = 0;
      goBack();
      return;
    }
    hubTimer = window.setTimeout(() => {
      hubTimer = 0;
      toggleMode();
    }, TAP_DELAY);
  });
  hub.addEventListener('dblclick', (event) => {
    event.preventDefault();
    if (state.view === 'images') {
      window.clearTimeout(hubTimer);
      hubTimer = 0;
      goBack();
    }
  });

  backButton.addEventListener('click', () => {
    if (state.expanded) {
      cancelGestures();
      setExpanded(false);
      return;
    }
    goBack();
  });

  /* --------------------------------------------------- Übertragungsmodi */

  function toggleMode() {
    if (state.view !== 'images') return;
    state.mode = state.mode === 'auto' ? 'manual' : 'auto';
    applyMode();
    // Beim Aktivieren wandert die aktuelle Auswahl sofort zum Receiver.
    // Beim Deaktivieren bleibt der zuletzt gezeigte Inhalt dort stehen.
    if (state.mode === 'auto') scheduleAutoSwitch(0);
    else receiverStatus();
    schedule();
  }

  let autoWanted = -1;

  function maybeAutoSwitch() {
    if (state.mode !== 'auto' || state.view !== 'images') return;
    const index = Math.round(state.position);
    if (state.shown && state.shown.index === index) return;
    scheduleAutoSwitch();
  }

  function scheduleAutoSwitch(delay = 140) {
    autoWanted = Math.round(state.position);
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(runAutoSwitch, delay);
  }

  async function runAutoSwitch() {
    if (destroyed || state.mode !== 'auto' || state.view !== 'images') return;
    if (state.sending || dragging) {
      // Veraltete Anfrage verwerfen, zuletzt gewählte Position nachziehen.
      window.clearTimeout(autoTimer);
      autoTimer = window.setTimeout(runAutoSwitch, 130);
      return;
    }
    const wanted = autoWanted;
    await present(wanted, { open: false });
    if (state.mode === 'auto' && autoWanted !== wanted) scheduleAutoSwitch(0);
  }

  /* ------------------------------------------------- Aufgezogene Ansicht */

  function setExpanded(on) {
    state.expanded = on;
    overlay.hidden = !on;
    browser.classList.toggle('zooming', on);
    overlay.style.transform = '';
    if (!on) {
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      applyZoom(false);
    }
    applyBackLabel();
  }

  function applyZoom(sync) {
    const box = overlay.getBoundingClientRect();
    const limitX = Math.max(0, ((state.zoom - 1) * (box.width || 300)) / 2);
    const limitY = Math.max(0, ((state.zoom - 1) * (box.height || 200)) / 2);
    state.pan.x = clamp(state.pan.x, -limitX, limitX);
    state.pan.y = clamp(state.pan.y, -limitY, limitY);
    overlayImage.style.transform = `translate(${Math.round(state.pan.x)}px,${Math.round(state.pan.y)}px) scale(${state.zoom})`;
    if (sync && state.shown) pushTransform();
  }

  function pushTransform() {
    window.clearTimeout(transformTimer);
    transformTimer = window.setTimeout(sendTransform, 110);
  }

  async function sendTransform() {
    const receiver = state.receiver;
    const sessionId = receiver?.state?.current?.sessionId;
    if (!receiver?.connected || !sessionId) return;
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
        state.shownZoom = payload.zoom;
        renderShown();
      }
    } catch {
      /* Kein Erfolg ohne Bestätigung; der Status kommt aus refreshReceiver. */
    }
  }

  /* ------------------------------------------------- Pinch und Tastgesten */

  const pointers = new Map();
  let baseDistance = 0;
  let baseZoom = 1;
  let maxScale = 1;
  let pinching = false;
  let wasOpen = false;
  let lastPan = null;
  let lastTap = 0;
  let tapOrigin = null;
  let tapMoved = false;

  function distance() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function cancelGestures() {
    pointers.clear();
    baseDistance = 0;
    maxScale = 1;
    pinching = false;
    lastPan = null;
    tapOrigin = null;
    tapMoved = false;
    if (dragging) {
      dragging = false;
      snap();
    }
  }

  function startGesture(event) {
    if (state.view !== 'images') return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPan = { x: event.clientX, y: event.clientY };
    if (pointers.size === 2) {
      pinching = true;
      baseDistance = Math.max(1, distance());
      baseZoom = state.zoom;
      maxScale = 1;
      wasOpen = state.expanded;
    }
  }

  function moveGesture(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const scale = distance() / baseDistance;
      maxScale = Math.max(maxScale, scale);
      if (wasOpen) {
        // In der geöffneten Ansicht zoomt jede weitere Geste nur.
        state.zoom = clamp(baseZoom * scale, 1, MAX_ZOOM);
        applyZoom(true);
      } else if (scale > OPEN_THRESHOLD) {
        showOverlayImage(state.index);
        setExpanded(true);
        overlay.style.transform = `scale(${Math.min(1, 0.88 + scale * 0.08)})`;
        castState.textContent =
          scale > SEND_THRESHOLD ? 'LOSLASSEN ZUM SENDEN' : 'AUFZIEHEN';
      }
    } else if (
      pointers.size === 1 &&
      !pinching &&
      state.expanded &&
      state.zoom > 1 &&
      lastPan
    ) {
      state.pan.x += event.clientX - lastPan.x;
      state.pan.y += event.clientY - lastPan.y;
      applyZoom(true);
    }
    lastPan = { x: event.clientX, y: event.clientY };
  }

  function endGesture(event) {
    pointers.delete(event.pointerId);
    if (pointers.size) return;
    if (pinching && !wasOpen) {
      if (maxScale > SEND_THRESHOLD) {
        overlay.style.transform = '';
        // Die öffnende Geste sendet nur im manuellen Modus; im Auto-Switch
        // liegt das Bild bereits auf dem Empfänger.
        present(state.index, { open: true, send: state.mode === 'manual' });
      } else setExpanded(false);
    }
    cancelGestures();
  }

  for (const element of [previewFrame, overlay]) {
    element.addEventListener('pointerdown', startGesture);
    element.addEventListener('pointermove', moveGesture);
    element.addEventListener('pointerup', endGesture);
    element.addEventListener('pointercancel', () => {
      if (pinching && !wasOpen) setExpanded(false);
      cancelGestures();
    });
  }
  for (const element of [previewFrame, overlay])
    element.addEventListener(
      'touchmove',
      (event) => {
        // Eigene Gesten behandeln, ohne die Home-Assistant-Oberfläche
        // mitzuzoomen; der Seitenzoom bleibt sonst unangetastet.
        if (event.touches.length > 1 || state.expanded) event.preventDefault();
      },
      { passive: false },
    );

  // Einfaches Antippen schließt die geöffnete Ansicht nicht; nur ein
  // Doppeltipp verkleinert sie zurück zur Bildauswahl.
  overlay.addEventListener('pointerdown', (event) => {
    if (pointers.size === 1) {
      tapOrigin = { x: event.clientX, y: event.clientY };
      tapMoved = false;
    } else tapMoved = true;
  });
  overlay.addEventListener('pointermove', (event) => {
    if (
      tapOrigin &&
      Math.hypot(event.clientX - tapOrigin.x, event.clientY - tapOrigin.y) > 10
    )
      tapMoved = true;
  });
  overlay.addEventListener('pointerup', () => {
    if (tapMoved || pinching) return;
    const now = Date.now();
    if (now - lastTap < 330) {
      lastTap = 0;
      setExpanded(false);
    } else lastTap = now;
  });
  overlay.addEventListener('dblclick', (event) => {
    event.preventDefault();
    cancelGestures();
    setExpanded(false);
  });
  overlay.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      state.zoom = clamp(state.zoom - event.deltaY * 0.003, 1, MAX_ZOOM);
      applyZoom(true);
    },
    { passive: false },
  );

  function showOverlayImage(index) {
    const item = itemAt(index);
    if (!item) return;
    overlayImage.alt = item.name;
    if (item.data) {
      overlayImage.src = item.data;
      return;
    }
    const cached = fileCache.get(item.key);
    if (cached) overlayImage.src = cached.url;
    else
      loadFile(item)
        .then((url) => {
          if (state.index === index) overlayImage.src = url;
        })
        .catch(() => {});
  }

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

  function preloadNeighbours() {
    if (state.view !== 'images') return;
    const total = count();
    for (let offset = -PRELOAD; offset <= PRELOAD; offset += 1) {
      const index = state.index + offset;
      if (index < 0 || index >= total) continue;
      const item = itemAt(index);
      if (item.type.startsWith('image/') && !fileCache.has(item.key))
        loadFile(item)
          .then(() => schedule())
          .catch(() => {});
    }
  }

  function protectedKeys() {
    const keys = new Set();
    const total = count();
    for (let offset = -PRELOAD - 2; offset <= PRELOAD + 2; offset += 1) {
      const index = state.index + offset;
      if (index >= 0 && index < total) keys.add(itemAt(index)?.key);
    }
    if (state.shown?.key) keys.add(state.shown.key);
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
      imageCache.delete(key);
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
      name: String(source.name || 'Quelle'),
      sourceId: source.id,
      path: '',
    }));
    if (library.length)
      entries.unshift({ kind: 'library', name: 'Importierte Medien' });
    entries.push({ kind: 'pick', name: 'Lokale Datei öffnen' });
    entries.push({ kind: 'settings', name: 'Quellen & Einstellungen' });
    showLevel({ title: 'STARK OS', entries, parent: null }, keepIndex);
    setStatus(sources.length ? '' : 'KEINE NAS-QUELLE GESPEICHERT');
  }

  function showLevel(level, index = 0) {
    setExpanded(false);
    state.view = 'folders';
    browser.dataset.view = 'folders';
    state.level = level;
    state.collection = null;
    const total = level.entries.length;
    state.index = total ? clamp(index, 0, total - 1) : 0;
    state.position = state.index;
    hub.disabled = !total;
    setStatus('');
    render();
  }

  async function activate(entry) {
    if (!entry) return;
    if (state.level) state.level.index = state.index;
    if (entry.kind === 'pick') return void options.pickLocal?.();
    if (entry.kind === 'settings') return void options.openSources?.();
    if (entry.kind === 'library') {
      showCollection({ title: entry.name, items: libraryItems() }, state.level);
      return;
    }
    await openFolder(entry);
  }

  function libraryItems() {
    return library.map((media, index) => ({
      key: `local:${index}:${media.title}`,
      name: media.title,
      type: media.type,
      data: media.data,
      source: media.source,
    }));
  }

  async function openFolder(entry) {
    const parent = state.level;
    hub.disabled = true;
    setStatus('ORDNER WIRD GELADEN …');
    let entries;
    try {
      entries = await displays.browseMediaSource(entry.sourceId, entry.path);
    } catch (error) {
      hub.disabled = false;
      setStatus(error.message || 'ORDNER NICHT ERREICHBAR');
      return;
    }
    hub.disabled = false;
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
    showLevel(level, 0);
  }

  function showCollection(collection, back) {
    setExpanded(false);
    state.view = 'images';
    browser.dataset.view = 'images';
    state.collection = { ...collection, back: back || null };
    state.index = 0;
    state.position = 0;
    hub.disabled = !collection.items.length;
    previewCanvas.dataset.key = '';
    render();
    preloadNeighbours();
    receiverStatus();
    maybeAutoSwitch();
  }

  function goBack() {
    if (state.expanded) {
      setExpanded(false);
      return;
    }
    if (state.view === 'images') {
      const back = state.collection?.back;
      if (back) showLevel(back, back.index || 0);
      else openRoot();
      return;
    }
    const parent = state.level?.parent;
    if (parent) {
      showLevel(parent, parent.index || 0);
      return;
    }
    // Auf der obersten Ebene führt Zurück aus dem Medienbrowser heraus.
    options.onExit?.();
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
    receiverName.textContent = receiver
      ? `${receiver.name} · ${receiver.connected ? 'VERBUNDEN' : 'OFFLINE'}`
      : 'KEIN RECEIVER';
    syncShownFromReceiver(receiver);
    if (state.sending || Date.now() < state.holdUntil) return;
    receiverStatus();
  }

  /**
   * Der gemeldete Zustand des Receivers hat Vorrang vor der lokalen Annahme.
   * Ohne gemeldeten Inhalt wird keine Darstellung vorgetäuscht.
   */
  function syncShownFromReceiver(receiver) {
    const current = receiver?.state?.current;
    if (!receiver?.connected || !current) {
      if (state.shown) {
        state.shown = null;
        renderShown();
      }
      return;
    }
    const zoom = Number(receiver.state?.transform?.zoom);
    if (Number.isFinite(zoom) && zoom > 0) state.shownZoom = zoom;
    if (current.title && current.title !== state.shown?.name) {
      state.shown = {
        key: state.shown?.name === current.title ? state.shown.key : null,
        name: current.title,
        folder: state.shown?.folder || '',
        index: state.shown?.name === current.title ? state.shown.index : -1,
        total: state.shown?.name === current.title ? state.shown.total : 0,
      };
    }
    renderShown();
  }

  /** Obere Anzeige: was der Receiver tatsächlich darstellt. */
  function renderShown() {
    const shown = state.shown;
    if (!shown) {
      receiverThumb.toggleAttribute('hidden', true);
      receiverThumb.removeAttribute('src');
      receiverShown.textContent = 'Noch kein Bild übertragen';
      return;
    }
    const url = shown.key
      ? fileCache.get(shown.key)?.url || shown.data || null
      : null;
    if (url) {
      if (receiverThumb.getAttribute('src') !== url)
        receiverThumb.setAttribute('src', url);
      receiverThumb.toggleAttribute('hidden', false);
    } else {
      receiverThumb.toggleAttribute('hidden', true);
      receiverThumb.removeAttribute('src');
    }
    const parts = [];
    if (shown.folder) parts.push(shown.folder);
    parts.push(shown.index >= 0 ? `Bild ${shown.index + 1}` : shown.name);
    if (shown.total) parts[parts.length - 1] += ` / ${shown.total}`;
    const zoom = Number(state.shownZoom || 1);
    if (Math.abs(zoom - 1) > 0.02) parts.push(`${Math.round(zoom * 100)} %`);
    receiverShown.textContent = parts.join(' · ');
  }

  /* -------------------------------------------------------------- Senden */

  /**
   * Überträgt das Bild an der gewünschten Position und öffnet auf Wunsch die
   * vergrößerte Ansicht. Die obere Anzeige folgt erst der Bestätigung.
   */
  async function present(index, { open = false, send = true } = {}) {
    if (state.view !== 'images') return;
    const item = itemAt(index);
    if (!item) return;
    if (open) {
      showOverlayImage(index);
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      applyZoom(false);
      setExpanded(true);
    }
    if (!send || state.sending) return;
    state.sending = true;
    castState.textContent = 'ÜBERTRAGUNG LÄUFT …';
    receiverStatus('ÜBERTRAGUNG LÄUFT …');
    try {
      const devices = await displays.list().catch(() => []);
      const online = new Set(
        devices.filter((device) => device.connected).map((device) => device.id),
      );
      let targets = [...selectedDisplays].filter((id) => online.has(id));
      if (!targets.length) {
        const fallback = devices.find((device) => device.connected);
        if (fallback) targets = [fallback.id];
      }
      if (!targets.length) {
        castState.textContent = 'KEIN RECEIVER VERBUNDEN';
        receiverStatus('KEIN RECEIVER VERBUNDEN');
        return;
      }
      const media = await mediaPayload(item);
      const result = await displays.command(targets, 'media.show', {
        media,
        mode: 'show',
      });
      const accepted = result.results.filter((entry) => entry.accepted).length;
      if (!accepted) {
        const reason = result.results[0]?.error || 'NICHT ANGENOMMEN';
        castState.textContent = reason;
        receiverStatus(reason);
        return;
      }
      state.shown = {
        key: item.key,
        data: item.data || null,
        name: item.name,
        folder: state.collection?.title || '',
        index,
        total: count(),
      };
      state.shownZoom = 1;
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      applyZoom(false);
      renderShown();
      castState.textContent = `AUF ${state.receiver?.name || 'RECEIVER'} · 100 %`;
      receiverStatus('GESENDET');
    } catch (error) {
      const reason = error.message || 'ÜBERTRAGUNG FEHLGESCHLAGEN';
      castState.textContent = reason;
      receiverStatus(reason);
    } finally {
      state.sending = false;
      state.holdUntil = Date.now() + 2600;
      window.setTimeout(() => {
        if (!state.sending) refreshReceiver();
      }, 2700);
    }
  }

  /* ----------------------------------------------------------------- Start */

  applyLayout();
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
        name: String(source.name || 'Quelle'),
        sourceId: source.id,
        path: '',
      }),
    showLibrary: () => {
      if (!library.length) return;
      showCollection(
        { title: 'Importierte Medien', items: libraryItems() },
        state.view === 'folders' ? state.level : state.collection?.back,
      );
    },
    destroy: () => {
      destroyed = true;
      window.clearInterval(receiverTimer);
      window.clearTimeout(snapTimer);
      window.clearTimeout(hubTimer);
      window.clearTimeout(autoTimer);
      window.clearTimeout(transformTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      for (const entry of fileCache.values()) URL.revokeObjectURL(entry.url);
      fileCache.clear();
      imageCache.clear();
    },
  };
}
