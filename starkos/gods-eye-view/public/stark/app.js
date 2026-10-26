import { InertialRing } from './ring.js';
import { DisplayApi, capability } from './display-api.js';

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
    window.location.assign('../world?embed=1&stark=1');
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
  const zone = $('#dropZone', body);
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
    };
    const card = document.createElement('article');
    card.innerHTML = `<div class="file-glyph">↗</div><div><strong>${escapeHtml(media.title)}</strong><span>WEBLINK · EXTERN ÖFFNEN</span></div>`;
    prepareMediaCard(card, media, body);
    $('#mediaStrip', body).append(card);
    importedMedia.push(media);
    event.currentTarget.reset();
  });
  const sourcesPanel = $('#mediaSources', body);
  $('#openSources', body).addEventListener('click', () => {
    sourcesPanel.hidden = false;
    renderMediaSources(body);
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
    } catch (error) {
      status.textContent = error.message;
      renderMediaSources(body);
    }
  });
  renderDisplayTargets($('#deviceTargets', body));
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
        controlButton('ÖFFNEN', () => browseMediaSource(source, '', body)),
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
        }),
      );
      return row;
    }),
  );
  if (!sources.length) {
    const empty = document.createElement('p');
    empty.className = 'module-note';
    empty.textContent = 'Noch keine NAS-Medienquelle gespeichert.';
    list.append(empty);
  }
}

async function browseMediaSource(source, path, body) {
  const browser = $('#sourceBrowser', body);
  browser.hidden = false;
  browser.replaceChildren();
  const header = document.createElement('header');
  const back = controlButton('←', () => {
    if (!path) {
      browser.hidden = true;
      return;
    }
    const parent = path.replace(/\/$/, '').split('/').slice(0, -1).join('/');
    browseMediaSource(source, parent ? `${parent}/` : '', body);
  });
  const title = document.createElement('strong');
  title.textContent = `${source.name} / ${path}`;
  header.append(back, title);
  browser.append(header);
  try {
    const entries = await displays.browseMediaSource(source.id, path);
    for (const entry of entries) {
      const row = document.createElement('article');
      row.className = `source-file${entry.directory ? ' directory' : ''}`;
      row.innerHTML = `<div><strong></strong><small></small></div>`;
      row.querySelector('strong').textContent = entry.name;
      row.querySelector('small').textContent = entry.directory
        ? 'ORDNER'
        : `${entry.type || 'DATEI'} · ${formatBytes(entry.size || 0)}`;
      const button = controlButton(entry.directory ? 'ÖFFNEN' : 'LADEN', () =>
        entry.directory
          ? browseMediaSource(source, entry.path, body)
          : addNasMedia(source, entry, body, button),
      );
      row.append(button);
      browser.append(row);
    }
  } catch (error) {
    const message = document.createElement('p');
    message.className = 'module-note';
    message.textContent = error.message;
    browser.append(message);
  }
}

async function addNasMedia(source, entry, body, button) {
  button.disabled = true;
  button.textContent = 'LÄDT …';
  try {
    const blob = await displays.mediaSourceFile(source.id, entry.path);
    const type = blob.type || entry.type || mediaTypeFromName(entry.name);
    if (!/^(image\/|video\/|application\/pdf$)/.test(type))
      throw new Error('Dieser Dateityp kann nicht angezeigt werden.');
    const media = {
      title: entry.name,
      type,
      data: await readDataUrl(blob),
    };
    const card = document.createElement('article');
    card.innerHTML = type.startsWith('image/')
      ? `<img src="${media.data}" alt=""><div><strong>${escapeHtml(entry.name)}</strong><span>NAS · ${escapeHtml(source.name)}</span></div>`
      : `<div class="file-glyph">${type.startsWith('video/') ? '▶' : '▤'}</div><div><strong>${escapeHtml(entry.name)}</strong><span>NAS · ${escapeHtml(source.name)}</span></div>`;
    importedMedia.push(media);
    prepareMediaCard(card, media, body);
    $('#mediaStrip', body).prepend(card);
    $('#mediaSources', body).hidden = true;
  } catch (error) {
    button.textContent = error.message;
    button.disabled = false;
  }
}

function mediaTypeFromName(name) {
  const extension = String(name).split('.').pop().toLowerCase();
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
      pdf: 'application/pdf',
    }[extension] || 'application/octet-stream'
  );
}

async function addMedia(files, body) {
  const strip = $('#mediaStrip', body);
  for (const file of files) {
    const card = document.createElement('article');
    const url = URL.createObjectURL(file);
    card.innerHTML = file.type.startsWith('image/')
      ? `<img src="${url}" alt=""><div><strong>${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)} · LOCAL</span></div>`
      : `<div class="file-glyph">${file.type.startsWith('video/') ? '▶' : '▤'}</div><div><strong>${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)} · LOCAL</span></div>`;
    const media = {
      title: file.name,
      type:
        file.type ||
        (file.name.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : 'application/octet-stream'),
      data: await readDataUrl(file),
    };
    importedMedia.push(media);
    prepareMediaCard(card, media, body);
    strip.append(card);
  }
}

function prepareMediaCard(card, media, body) {
  card.title =
    'Antippen: Vorschau · Doppeltippen: Anzeigen · Ziehen: Ziel wählen';
  const transfer = document.createElement('button');
  transfer.type = 'button';
  transfer.className = 'file-transfer';
  transfer.textContent = 'DATEI';
  transfer.title = 'Datei übertragen, nicht präsentieren';
  for (const name of ['pointerdown', 'pointerup', 'click'])
    transfer.addEventListener(name, (event) => {
      event.stopPropagation();
      if (name === 'click') transmit(media, card, undefined, 'transfer');
    });
  if (media.type !== 'text/uri-list') card.append(transfer);
  bindMediaGestures(card, media, body);
}

function bindMediaGestures(card, media, body) {
  let firstTap = 0;
  let singleTimer = 0;
  let dragging = false;
  let origin = null;
  card.addEventListener('pointerdown', (event) => {
    origin = { x: event.clientX, y: event.clientY };
    dragging = false;
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointermove', (event) => {
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 14) {
      dragging = true;
      card.classList.add('media-dragging');
    }
  });
  card.addEventListener('pointerup', (event) => {
    card.classList.remove('media-dragging');
    if (dragging) {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('.device-target');
      if (target) transmit(media, card, [target.dataset.id]);
      origin = null;
      return;
    }
    const now = performance.now();
    if (now - firstTap < 330) {
      clearTimeout(singleTimer);
      firstTap = 0;
      transmit(media, card);
    } else {
      firstTap = now;
      singleTimer = setTimeout(() => {
        firstTap = 0;
        previewMedia(media, body);
      }, 350);
    }
  });
}

async function transmit(media, card, explicitTargets, mode = 'show') {
  try {
    const available = await displays.list();
    const targets = explicitTargets?.length
      ? explicitTargets
      : [...selectedDisplays];
    if (!targets.length) {
      const fallback = available.find((item) => item.connected);
      if (fallback) targets.push(fallback.id);
    }
    if (!targets.length) {
      showCardStatus(card, 'KEIN ONLINE-ZIEL');
      return;
    }
    const result = await displays.command(targets, 'media.show', {
      media,
      mode,
    });
    const accepted = result.results.filter((item) => item.accepted).length;
    showCardStatus(
      card,
      accepted
        ? `${mode === 'transfer' ? 'ÜBERTRAGEN' : 'ANGEZEIGT'} // ${accepted} DISPLAY${accepted > 1 ? 'S' : ''}`
        : result.results[0]?.error || 'NICHT GESENDET',
    );
  } catch (error) {
    showCardStatus(card, error.message);
  }
}

function showCardStatus(card, text) {
  let status = card.querySelector('.transfer-status');
  if (!status) {
    status = document.createElement('em');
    status.className = 'transfer-status';
    card.append(status);
  }
  status.textContent = text;
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
    });
    container.append(target);
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

function enableRemoteImageGestures(image) {
  const pointers = new Map();
  let transform = { zoom: 1, x: 0, y: 0, rotation: 0 };
  let baseline = null;
  let lastSent = 0;
  image.style.touchAction = 'none';
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
    image.style.transform = `translate(${transform.x}px,${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.zoom})`;
    if (Date.now() - lastSent > 100) {
      lastSent = Date.now();
      sendRemoteTransform(transform);
    }
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    baseline = pointers.size === 2 ? { ...snapshot(), ...transform } : null;
    sendRemoteTransform(transform);
  };
  image.addEventListener('pointerup', release);
  image.addEventListener('pointercancel', release);
}

async function sendRemoteTransform(transform) {
  const devices = await displays.list().catch(() => []);
  const targets = [...selectedDisplays].filter((id) =>
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
      if (capability(receiver, 'playback.pause')) {
        controls.append(
          controlButton('PAUSE', () =>
            displayCommand(receiver, 'playback.pause'),
          ),
          controlButton('PLAY', () =>
            displayCommand(receiver, 'playback.resume'),
          ),
        );
      }
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
      if (capability(receiver, 'playback.volume')) {
        controls.append(
          controlButton('VOL 0', () =>
            displayCommand(receiver, 'playback.volume', { value: 0 }),
          ),
          controlButton('VOL 50', () =>
            displayCommand(receiver, 'playback.volume', { value: 0.5 }),
          ),
          controlButton('VOL 100', () =>
            displayCommand(receiver, 'playback.volume', { value: 1 }),
          ),
        );
      }
      if (capability(receiver, 'playback.queue')) {
        controls.append(
          controlButton('VORHERIGES', () =>
            displayCommand(receiver, 'playback.previous'),
          ),
          controlButton('NÄCHSTES', () =>
            displayCommand(receiver, 'playback.next'),
          ),
        );
      }
      if (capability(receiver, 'image.transform')) {
        const transform = receiver.state?.transform || {
          zoom: 1,
          x: 0,
          y: 0,
          rotation: 0,
        };
        controls.append(
          controlButton('ZOOM −', () =>
            displayCommand(receiver, 'image.transform', {
              zoom: Math.max(0.25, Number(transform.zoom || 1) - 0.25),
            }),
          ),
          controlButton('ZOOM +', () =>
            displayCommand(receiver, 'image.transform', {
              zoom: Math.min(5, Number(transform.zoom || 1) + 0.25),
            }),
          ),
          controlButton('←', () =>
            displayCommand(receiver, 'image.transform', {
              x: Number(transform.x || 0) - 40,
            }),
          ),
          controlButton('→', () =>
            displayCommand(receiver, 'image.transform', {
              x: Number(transform.x || 0) + 40,
            }),
          ),
          controlButton('↑', () =>
            displayCommand(receiver, 'image.transform', {
              y: Number(transform.y || 0) - 40,
            }),
          ),
          controlButton('↓', () =>
            displayCommand(receiver, 'image.transform', {
              y: Number(transform.y || 0) + 40,
            }),
          ),
          controlButton('ROTATE', () =>
            displayCommand(receiver, 'image.transform', {
              rotation: Number(transform.rotation || 0) + 90,
            }),
          ),
          controlButton('RESET', () => displayCommand(receiver, 'image.reset')),
        );
      }
      const other = receivers.find(
        (candidate) => candidate.id !== receiver.id && candidate.connected,
      );
      if (other && receiver.state?.current) {
        controls.append(
          controlButton(`COPY → ${other.name}`, () =>
            displays.tool('move_content', {
              source_display_id: receiver.id,
              target_display_ids: [other.id],
              move: false,
            }),
          ),
          controlButton(`MOVE → ${other.name}`, () =>
            displays.tool('move_content', {
              source_display_id: receiver.id,
              target_display_ids: [other.id],
              move: true,
            }),
          ),
        );
      }
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
