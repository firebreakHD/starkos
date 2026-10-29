import { InertialRing } from './ring.js';
import { DisplayApi, capability } from './display-api.js';
import { createMediaBrowser } from './media-browser.js';

const modules = [
  {
    title: 'MEDIA',
    detail: 'Eigene Bilder und Videos untersuchen',
    glyph: '◉',
    code: 'MODULE 01',
  },
  {
    title: 'INVESTIGATION',
    detail: 'Fälle, Orte und Ereignisse verbinden',
    glyph: '⌬',
    code: 'MODULE 02',
  },
  {
    title: 'WORLD',
    detail: 'Echte Cesium-Geodatenengine öffnen',
    glyph: '◎',
    code: 'MODULE 03',
  },
  {
    title: 'RECEIVER',
    detail: 'Autorisierte Bildschirme koppeln',
    glyph: '▣',
    code: 'MODULE 04',
  },
  {
    title: 'SYSTEM',
    detail: 'Quellenstatus und lokale Konfiguration',
    glyph: '◇',
    code: 'MODULE 05',
  },
];

const $ = (selector, root = document) => root.querySelector(selector);
let active = modules[0];
let lastTap = 0;
const importedMedia = [];
const displays = new DisplayApi();
const selectedDisplays = new Set();
const receiverPreviewCache = new Map();
let mediaBrowser = null;

const ring = new InertialRing($('#ring'), modules, (index, item) => {
  active = item;
  $('#coreIndex').textContent =
    `${String(index + 1).padStart(2, '0')} / ${String(modules.length).padStart(2, '0')}`;
  $('#coreGlyph').textContent = item.glyph;
  $('#coreTitle').textContent = item.title;
  $('#coreDetail').textContent = item.detail;
});

function openPanel(item = active) {
  if (item.title === 'WORLD') {
    window.location.assign('../?world=1&embed=1&stark=1');
    return;
  }
  const panel = $('#panel');
  $('#panelCode').textContent = item.code;
  $('#panelTitle').textContent = item.title;
  const body = $('#panelBody');
  body.replaceChildren();
  if (item.title === 'MEDIA') mountMedia(body);
  else if (item.title === 'INVESTIGATION') mountInvestigation(body);
  else if (item.title === 'RECEIVER') mountReceiver(body);
  else mountSystem(body);
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
}

$('#core').addEventListener('pointerup', () => {
  const now = performance.now();
  if (now - lastTap < 360) openPanel();
  lastTap = now;
});
$('#core').addEventListener('dblclick', () => openPanel());
$('#closePanel').addEventListener('click', () => {
  $('#panel').classList.remove('open');
  $('#panel').setAttribute('aria-hidden', 'true');
});

function mountMedia(body) {
  body.append($('#mediaTemplate').content.cloneNode(true));
  const input = $('#mediaInput', body);
  const zone = $('#starkBrowser', body);
  const sourcesPanel = $('#mediaSources', body);
  mediaBrowser?.destroy();
  mediaBrowser = createMediaBrowser({
    root: body,
    displays,
    library: importedMedia,
    selectedDisplays,
    pickLocal: () => input.click(),
    onExit: () => $('#closePanel').click(),
    openSources: () => {
      sourcesPanel.hidden = false;
      renderMediaSources(body);
      sourcesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
  $('#pickMedia', body).addEventListener('click', () => input.click());
  input.addEventListener('change', () => addMedia(input.files, body));
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('over');
    addMedia(event.dataTransfer.files, body);
  });
  $('#webMedia', body).addEventListener('submit', (event) => {
    event.preventDefault();
    const url = $('#webUrl', body).value;
    const media = {
      title: new URL(url).hostname,
      type: 'text/uri-list',
      data: url,
      source: 'WEBLINK · EXTERN ÖFFNEN',
    };
    importedMedia.push(media);
    mediaBrowser?.showLibrary();
    event.currentTarget.reset();
  });
  $('#toggleSourceSettings', body).addEventListener('click', () => {
    const form = $('#sourceForm', body);
    form.hidden = !form.hidden;
  });
  $('#closeSources', body).addEventListener('click', () => {
    sourcesPanel.hidden = true;
  });
  $('#sourceForm', body).addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = $('#sourceStatus', body);
    status.textContent = 'VERBINDUNG WIRD GEPRÜFT …';
    try {
      const input = {
        type: $('#sourceType', body).value,
        name: $('#sourceName', body).value,
        url: $('#sourceUrl', body).value,
      };
      const username = $('#sourceUser', body).value;
      const password = $('#sourcePassword', body).value;
      if (!event.currentTarget.dataset.sourceId || username)
        input.username = username;
      if (!event.currentTarget.dataset.sourceId || password)
        input.password = password;
      const source = event.currentTarget.dataset.sourceId
        ? await displays.updateMediaSource(
            event.currentTarget.dataset.sourceId,
            input,
          )
        : await displays.addMediaSource(input);
      await displays.testMediaSource(source.id);
      event.currentTarget.reset();
      delete event.currentTarget.dataset.sourceId;
      event.currentTarget.querySelector('button[type="submit"]').textContent =
        'QUELLE SPEICHERN';
      status.textContent = 'QUELLE VERBUNDEN';
      renderMediaSources(body);
      mediaBrowser?.refreshSources();
    } catch (error) {
      status.textContent = error.message;
      renderMediaSources(body);
    }
  });
  body.closest('.panel')?.addEventListener('transitionend', () => {
    if (body.closest('.panel')?.classList.contains('open')) return;
    mediaBrowser?.destroy();
    mediaBrowser = null;
  });
}

async function renderMediaSources(body) {
  const list = $('#sourceList', body);
  const sources = await displays.mediaSources().catch(() => []);
  list.replaceChildren(
    ...sources.map((source) => {
      const row = document.createElement('article');
      row.className = 'source-entry';
      row.innerHTML = `<div><strong></strong><small></small></div><nav></nav>`;
      row.querySelector('strong').textContent = source.name;
      row.querySelector('small').textContent =
        `WEBDAV · ${new URL(source.url).host}`;
      const nav = row.querySelector('nav');
      nav.append(
        controlButton('ÖFFNEN', () => {
          $('#mediaSources', body).hidden = true;
          mediaBrowser?.openSource(source);
        }),
        controlButton('TEST', async (event) => {
          const button = event?.currentTarget;
          try {
            await displays.testMediaSource(source.id);
            if (button) button.textContent = 'ONLINE';
          } catch (error) {
            if (button) button.textContent = error.message;
          }
        }),
        controlButton('BEARBEITEN', () => {
          const form = $('#sourceForm', body);
          form.dataset.sourceId = source.id;
          $('#sourceName', body).value = source.name;
          $('#sourceUrl', body).value = source.url;
          $('#sourceUser', body).value = '';
          $('#sourcePassword', body).value = '';
          form.querySelector('button[type="submit"]').textContent =
            'ÄNDERUNGEN SPEICHERN';
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }),
        controlButton('LÖSCHEN', async () => {
          await displays.removeMediaSource(source.id);
          renderMediaSources(body);
          mediaBrowser?.refreshSources();
        }),
      );
      return row;
    }),
  );
  if (!sources.length) {
    $('#sourceForm', body).hidden = false;
    const empty = document.createElement('p');
    empty.className = 'module-note';
    empty.textContent = 'Noch keine NAS-Medienquelle gespeichert.';
    list.append(empty);
  }
}

async function addMedia(files, body) {
  for (const file of files) {
    const media = {
      title: file.name,
      type:
        file.type ||
        (file.name.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : 'application/octet-stream'),
      data: await readDataUrl(file),
      source: `${formatBytes(file.size)} · LOCAL`,
    };
    importedMedia.push(media);
  }
  mediaBrowser?.showLibrary();
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderDisplayTargets(container) {
  const devices = await displays.list().catch(() => []);
  container.querySelectorAll('.device-target').forEach((node) => node.remove());
  for (const device of devices) {
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'device-target';
    target.dataset.id = device.id;
    target.innerHTML = `<i></i><strong></strong><small>${device.connected ? 'ONLINE' : 'OFFLINE'}</small>`;
    target.querySelector('strong').textContent = device.name;
    target.disabled = !device.connected;
    target.classList.toggle('selected', selectedDisplays.has(device.id));
    target.addEventListener('click', () => {
      selectedDisplays.has(device.id)
        ? selectedDisplays.delete(device.id)
        : selectedDisplays.add(device.id);
      target.classList.toggle('selected', selectedDisplays.has(device.id));
      refreshMediaMonitor(container.closest('.panel-body'));
      mediaBrowser?.refreshReceiver();
    });
    container.append(target);
  }
}

async function refreshMediaMonitor(body) {
  if (!body?.isConnected) return;
  const monitor = $('#displayMonitor', body);
  if (!monitor) return;
  const devices = await displays.list().catch(() => []);
  const receiver =
    devices.find(
      (device) => selectedDisplays.has(device.id) && device.connected,
    ) ||
    devices.find((device) => device.connected) ||
    devices[0];
  const header = monitor.querySelector('header');
  const screen = monitor.querySelector('.display-monitor-screen');
  const controls = monitor.querySelector('.display-monitor-controls');
  if (!receiver) {
    monitor.classList.add('empty');
    header.innerHTML =
      '<strong>AKTIVER RECEIVER</strong><span>NICHT VERBUNDEN</span>';
    screen.replaceChildren(
      Object.assign(document.createElement('span'), {
        textContent: 'KEIN RECEIVER VERBUNDEN',
      }),
    );
    controls.replaceChildren();
    return;
  }
  header.querySelector('strong').textContent = receiver.name;
  header.querySelector('span').textContent =
    `${receiver.connected ? 'ONLINE' : 'OFFLINE'} · ${receiver.state?.status || 'STANDBY'}`;
  const current = receiver.state?.current;
  if (!current) {
    monitor.classList.add('empty');
    monitor.dataset.session = '';
    screen.replaceChildren(
      Object.assign(document.createElement('span'), {
        textContent: 'KEIN MEDIUM AKTIV',
      }),
    );
    controls.replaceChildren();
    return;
  }
  monitor.classList.remove('empty');
  let preview = receiverPreviewCache.get(current.sessionId);
  if (!preview) {
    preview = await displays.preview(receiver.id).catch(() => null);
    if (preview) receiverPreviewCache.set(current.sessionId, preview);
  }
  if (monitor.dataset.session !== current.sessionId) {
    monitor.dataset.session = current.sessionId;
    screen.replaceChildren();
    const media = preview?.media;
    let visual;
    if (media?.type?.startsWith('image/')) {
      visual = document.createElement('img');
      visual.src = media.data;
      visual.alt = media.title;
      enableRemoteImageGestures(
        visual,
        [receiver.id],
        receiver.state?.transform,
      );
    } else if (media?.type?.startsWith('video/')) {
      visual = document.createElement('video');
      visual.src = media.data;
      visual.muted = true;
      visual.playsInline = true;
    } else if (media?.type === 'application/pdf') {
      visual = document.createElement('iframe');
      visual.src = media.data;
      visual.title = media.title;
    } else {
      visual = document.createElement('span');
      visual.textContent = media?.title || current.title || 'MEDIUM AKTIV';
    }
    screen.append(visual);
  }
  const image = screen.querySelector('img');
  if (image && receiver.state?.transform) {
    const value = receiver.state.transform;
    image.style.transform = `translate(${Number(value.x || 0)}px,${Number(value.y || 0)}px) rotate(${Number(value.rotation || 0)}deg) scale(${Number(value.zoom || 1)})`;
  }
  controls.replaceChildren();
  if (
    current.type?.startsWith('image/') &&
    capability(receiver, 'image.transform')
  ) {
    const transform = receiver.state?.transform || {
      zoom: 1,
      x: 0,
      y: 0,
      rotation: 0,
    };
    controls.append(
      controlButton('−', () =>
        displayCommand(receiver, 'image.transform', {
          zoom: Math.max(0.25, Number(transform.zoom || 1) - 0.25),
        }),
      ),
      controlButton('+', () =>
        displayCommand(receiver, 'image.transform', {
          zoom: Math.min(5, Number(transform.zoom || 1) + 0.25),
        }),
      ),
      controlButton('↶', () =>
        displayCommand(receiver, 'image.transform', {
          rotation: Number(transform.rotation || 0) - 90,
        }),
      ),
      controlButton('↷', () =>
        displayCommand(receiver, 'image.transform', {
          rotation: Number(transform.rotation || 0) + 90,
        }),
      ),
      controlButton('RESET', () => displayCommand(receiver, 'image.reset')),
    );
  }
  if (current.type?.startsWith('video/')) {
    if (capability(receiver, 'playback.pause'))
      controls.append(
        controlButton('PAUSE', () =>
          displayCommand(receiver, 'playback.pause'),
        ),
        controlButton('PLAY', () =>
          displayCommand(receiver, 'playback.resume'),
        ),
      );
    if (capability(receiver, 'playback.seek')) {
      const time = Number(receiver.state?.playback?.time || 0);
      controls.append(
        controlButton('−10 S', () =>
          displayCommand(receiver, 'playback.seek', {
            value: Math.max(0, time - 10),
          }),
        ),
        controlButton('+10 S', () =>
          displayCommand(receiver, 'playback.seek', { value: time + 10 }),
        ),
      );
    }
  }
}

function previewMedia(media, body) {
  body.querySelector('.media-preview')?.remove();
  const preview = document.createElement('section');
  preview.className = 'media-preview';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.ariaLabel = 'Vorschau schließen';
  close.addEventListener('click', () => preview.remove());
  let visual;
  if (media.type === 'text/uri-list') {
    visual = document.createElement('a');
    visual.href = media.data;
    visual.target = '_blank';
    visual.rel = 'noopener';
    visual.textContent = 'WEBINHALT EXTERN ÖFFNEN';
  } else if (media.type.startsWith('image/')) {
    visual = document.createElement('img');
    visual.src = media.data;
  } else if (media.type.startsWith('video/')) {
    visual = document.createElement('video');
    visual.src = media.data;
    visual.controls = true;
  } else {
    visual = document.createElement('iframe');
    visual.src = media.data;
  }
  const title = document.createElement('strong');
  title.textContent = media.title;
  preview.append(close, visual, title);
  body.append(preview);
  if (visual instanceof HTMLImageElement) enableRemoteImageGestures(visual);
}

function enableRemoteImageGestures(
  image,
  targetIds = null,
  initial = null,
  onTransmit = null,
  onTransform = null,
) {
  const pointers = new Map();
  let transform = { zoom: 1, x: 0, y: 0, rotation: 0, ...(initial || {}) };
  let baseline = null;
  let lastSent = 0;
  image.style.touchAction = 'none';
  const apply = (send = true) => {
    image.style.transform = `translate(${transform.x}px,${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.zoom})`;
    onTransform?.({ ...transform });
    if (send) sendRemoteTransform(transform, targetIds);
  };
  const snapshot = () => {
    const values = [...pointers.values()];
    if (values.length < 2) return null;
    const [a, b] = values;
    return {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  };
  image.addEventListener('pointerdown', (event) => {
    image.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      previousX: event.clientX,
      previousY: event.clientY,
    });
    baseline = pointers.size === 2 ? { ...snapshot(), ...transform } : null;
    if (pointers.size === 2) onTransmit?.();
  });
  image.addEventListener('pointermove', (event) => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    point.previousX = point.x;
    point.previousY = point.y;
    point.x = event.clientX;
    point.y = event.clientY;
    if (pointers.size === 1) {
      transform.x += point.x - point.previousX;
      transform.y += point.y - point.previousY;
    }
    if (pointers.size === 2 && baseline) {
      const current = snapshot();
      transform.zoom = Math.max(
        0.25,
        Math.min(
          5,
          (baseline.zoom * current.distance) / Math.max(1, baseline.distance),
        ),
      );
      transform.rotation = baseline.rotation + current.angle - baseline.angle;
    }
    apply(false);
    if (Date.now() - lastSent > 100) {
      lastSent = Date.now();
      sendRemoteTransform(transform, targetIds);
    }
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    baseline = pointers.size === 2 ? { ...snapshot(), ...transform } : null;
    sendRemoteTransform(transform, targetIds);
  };
  image.addEventListener('pointerup', release);
  image.addEventListener('pointercancel', release);
  apply(false);
  return {
    get: () => ({ ...transform }),
    update: (next) => {
      transform = { ...transform, ...next };
      transform.zoom = Math.max(0.25, Math.min(5, Number(transform.zoom || 1)));
      apply(true);
    },
  };
}

async function sendRemoteTransform(transform, explicitTargets = null) {
  const devices = await displays.list().catch(() => []);
  const targets = [...(explicitTargets || selectedDisplays)].filter((id) =>
    devices.some((device) => device.id === id && device.connected),
  );
  if (!targets.length) {
    const first = devices.find((device) => device.connected);
    if (first) targets.push(first.id);
  }
  if (targets.length)
    displays.command(targets, 'image.transform', transform).catch(() => {});
}

function mountInvestigation(body) {
  body.append($('#investigationTemplate').content.cloneNode(true));
  const field = $('#evidenceField', body);
  field
    .querySelectorAll('.evidence-node')
    .forEach((node) => makeDraggable(node, field));
  $('#saveCase', body).addEventListener('click', (event) => {
    const state = [...field.querySelectorAll('.evidence-node')].map((node) => ({
      x: node.style.left,
      y: node.style.top,
      text: node.textContent.trim(),
    }));
    localStorage.setItem(
      'stark-investigation',
      JSON.stringify({ savedAt: new Date().toISOString(), state }),
    );
    event.currentTarget.textContent = 'GESICHERT';
  });
}

function makeDraggable(node, field) {
  node.addEventListener('pointerdown', (event) => {
    node.setPointerCapture(event.pointerId);
    const move = (next) => {
      const box = field.getBoundingClientRect();
      node.style.left = `${Math.max(4, Math.min(96, ((next.clientX - box.left) / box.width) * 100))}%`;
      node.style.top = `${Math.max(6, Math.min(94, ((next.clientY - box.top) / box.height) * 100))}%`;
    };
    node.addEventListener('pointermove', move);
    node.addEventListener(
      'pointerup',
      () => node.removeEventListener('pointermove', move),
      { once: true },
    );
  });
}

function mountReceiver(body) {
  body.append($('#receiverTemplate').content.cloneNode(true));
  $('#receiverUrl', body).textContent = new URL(
    './receiver.html',
    location.href,
  ).href;
  $('#endAll', body).addEventListener('click', async () => {
    const devices = await displays.list().catch(() => []);
    const online = devices
      .filter((device) => device.connected)
      .map((device) => device.id);
    if (online.length) await displays.command(online, 'session.end');
    refreshReceivers(body);
  });
  refreshReceivers(body);
  const timer = setInterval(() => refreshReceivers(body), 1500);
  body.closest('.panel')?.addEventListener('transitionend', () => {
    if (!body.closest('.panel')?.classList.contains('open'))
      clearInterval(timer);
  });
}

async function refreshReceivers(body) {
  if (!body.isConnected) return;
  const [receivers, pending] = await Promise.all([
    displays.list().catch(() => []),
    displays.pending().catch(() => []),
  ]);
  const list = $('#receiverList', body);
  list.replaceChildren(
    ...pending.map((claim) => {
      const row = document.createElement('div');
      row.className = 'pair-request';
      const details = document.createElement('label');
      details.innerHTML = `<small>NEUES DISPLAY</small><input type="text" maxlength="60" autocomplete="off">`;
      const name = details.querySelector('input');
      name.value = claim.suggestedName || 'MEIN DISPLAY';
      name.setAttribute('aria-label', 'Eigener Displayname');
      const approve = document.createElement('button');
      approve.type = 'button';
      approve.textContent = 'CONNECT';
      approve.addEventListener('click', async () => {
        if (!name.value.trim()) {
          name.focus();
          return;
        }
        approve.disabled = true;
        await displays.confirm(claim.id, name.value.trim()).catch((error) => {
          approve.textContent = error.message;
        });
        refreshReceivers(body);
      });
      row.append(details, approve);
      return row;
    }),
    ...receivers.map((receiver) => {
      const row = document.createElement('div');
      row.className = 'receiver-control';
      row.innerHTML = `<header><strong></strong><span>${receiver.connected ? 'ONLINE' : 'OFFLINE'} · ${receiver.state?.status || 'STANDBY'}${receiver.state?.current?.title ? ` · ${escapeHtml(receiver.state.current.title)}` : ''}</span></header><div class="control-buttons"></div>`;
      row.querySelector('strong').textContent = receiver.name;
      const controls = row.querySelector('.control-buttons');
      controls.append(
        controlButton('BEENDEN', () => displayCommand(receiver, 'session.end')),
      );
      controls.append(
        controlButton('UMBENENNEN', async () => {
          const name = window
            .prompt('Neuer Displayname', receiver.name)
            ?.trim();
          if (!name) return;
          await displays.rename(receiver.id, name);
          refreshReceivers(body);
        }),
      );
      const revoke = controlButton('WIDERRUF', async () => {
        await displays.revoke(receiver.id);
        selectedDisplays.delete(receiver.id);
        refreshReceivers(body);
      });
      revoke.classList.add('danger');
      controls.append(revoke);
      [...controls.children].forEach((button) => {
        if (!receiver.connected && !button.classList.contains('danger'))
          button.disabled = true;
      });
      return row;
    }),
  );
}

function controlButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}
async function displayCommand(receiver, action, payload = {}) {
  await displays
    .command([receiver.id], action, {
      ...payload,
      sessionId: receiver.state?.current?.sessionId,
    })
    .catch(() => {});
}

function mountSystem(body) {
  const wrapper = document.createElement('div');
  wrapper.className = 'module system-module';
  wrapper.innerHTML = `
    <h2>KEYLESS BASELINE</h2>
    <div class="source-row"><b>GLOBE</b><span>ESRI + RE:EARTH</span><em>KEYLESS</em></div>
    <div class="source-row"><b>PLACE SEARCH</b><span>PHOTON / KOMOOT</span><em>KEYLESS</em></div>
    <div class="source-row"><b>STREET LEVEL</b><span>KARTAVIEW + PANORAMAX</span><em>KEYLESS</em></div>
    <div class="source-row"><b>AIRCRAFT</b><span>ADSB.LOL FALLBACK</span><em>KEYLESS</em></div>
    <div class="source-row muted"><b>LIVE AIS</b><span>AISSTREAM</span><em>OPTIONAL KEY</em></div>
    <div class="source-row muted"><b>LIVE TRAFFIC</b><span>TOMTOM</span><em>OPTIONAL KEY</em></div>
    <p class="module-note">Optionale Originalquellen bleiben erhalten. Fehlende Schlüssel erzeugen keine erfundenen Live-Daten.</p>`;
  body.append(wrapper);
}

function formatBytes(value) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function escapeHtml(value) {
  const span = document.createElement('span');
  span.textContent = value;
  return span.innerHTML;
}

setInterval(() => {
  $('#clock').textContent = new Date().toLocaleTimeString('de-DE', {
    hour12: false,
  });
}, 250);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $('#closePanel').click();
  if (event.key === 'ArrowRight')
    ring.snapTo((ring.selected + 1) % modules.length);
  if (event.key === 'ArrowLeft')
    ring.snapTo((ring.selected - 1 + modules.length) % modules.length);
  if (event.key === 'Enter') openPanel();
});
