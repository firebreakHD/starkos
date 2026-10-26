const PROTOCOL = 'stark-display/1';
const CAPABILITIES = [
  'media.image',
  'media.video',
  'media.pdf',
  'media.web',
  'playback.pause',
  'playback.seek',
  'playback.volume',
  'playback.queue',
  'image.transform',
  'file.transfer',
];
const form = document.querySelector('#pairForm');
const stage = document.querySelector('#receiveStage');
const status = document.querySelector('#receiverState');
const error = document.querySelector('#pairError');
let credentials = readCredentials();
let socket;
let retry = 1000;
let state = {
  status: 'standby',
  current: null,
  playback: null,
  transform: null,
};
let currentVisual = null;
const mediaQueue = [];
let queueIndex = -1;
let lastReport = 0;
let advertisement = 0;

function api(path) {
  return new URL(`../api/stark/${path}`, location.href);
}
function readCredentials() {
  try {
    return JSON.parse(localStorage.getItem('stark-receiver-device') || 'null');
  } catch {
    return null;
  }
}
function saveCredentials(value) {
  credentials = value;
  localStorage.setItem('stark-receiver-device', JSON.stringify(value));
}

async function advertise() {
  const generation = ++advertisement;
  error.textContent = '';
  const response = await fetch(api('receiver/claim'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      suggestedName: navigator.userAgent.includes('Mobile')
        ? 'TABLET DISPLAY'
        : 'EXTERNAL DISPLAY',
      capabilities: CAPABILITIES,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    error.textContent = result.error || 'Display konnte nicht gemeldet werden.';
    return;
  }
  status.textContent = 'CONNECT ON PHONE';
  error.textContent = 'Warte auf CONNECT am STARK-OS-Handy.';
  await waitForApproval(result, generation);
}

async function waitForApproval(claim, generation) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline && generation === advertisement) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    let response;
    let result;
    try {
      response = await fetch(api('receiver/claim-status'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(claim),
      });
      result = await response.json();
    } catch {
      status.textContent = 'RECONNECTING';
      continue;
    }
    if (!response.ok) {
      error.textContent = `${result.error} Erkennung wird erneuert …`;
      setTimeout(advertise, 800);
      return;
    }
    if (result.status === 'approved') {
      saveCredentials(result.device);
      connect();
      return;
    }
  }
  error.textContent = 'Erkennung wird erneuert …';
  advertise();
}

function connect() {
  if (!credentials) return;
  form.hidden = true;
  stage.hidden = false;
  status.textContent = 'CONNECTING';
  const url = api('ws');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(url);
  socket.addEventListener('open', () =>
    socket.send(
      JSON.stringify({
        v: 1,
        protocol: PROTOCOL,
        type: 'receiver.auth',
        deviceId: credentials.id,
        token: credentials.token,
      }),
    ),
  );
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'receiver.ready') {
      retry = 1000;
      status.textContent = 'SECURE LINK';
      if (
        message.desiredState?.current &&
        state.current?.sessionId !== message.desiredState.current.sessionId
      )
        state = { ...state, status: 'standby', current: null };
      reportState();
    }
    if (message.type === 'command') execute(message.command);
  });
  socket.addEventListener('close', (event) => {
    status.textContent =
      event.code === 4403 ? 'ACCESS REVOKED' : 'RECONNECTING';
    if (event.code === 4403) {
      localStorage.removeItem('stark-receiver-device');
      credentials = null;
      form.hidden = false;
      stage.hidden = true;
      advertise();
      return;
    }
    setTimeout(connect, retry);
    retry = Math.min(retry * 1.7, 15_000);
  });
}

function execute(command) {
  if (command.expiresAt < Date.now())
    return acknowledge(command, { error: 'grant-expired' });
  const { action, payload, sessionId } = command;
  if (action === 'media.show')
    showMedia(payload.media, payload.mode, sessionId);
  else if (action === 'playback.pause') controlVideo('pause');
  else if (action === 'playback.resume') controlVideo('play');
  else if (
    action === 'playback.seek' &&
    currentVisual instanceof HTMLVideoElement
  ) {
    currentVisual.currentTime = Math.max(0, Number(payload.value || 0));
    updatePlayback();
  } else if (
    action === 'playback.volume' &&
    currentVisual instanceof HTMLVideoElement
  ) {
    currentVisual.volume = Math.max(0, Math.min(1, Number(payload.value ?? 1)));
    currentVisual.muted = currentVisual.volume === 0;
    updatePlayback();
  } else if (action === 'playback.previous') showQueued(queueIndex - 1);
  else if (action === 'playback.next') showQueued(queueIndex + 1);
  else if (action === 'image.transform') transformImage(payload);
  else if (action === 'image.reset')
    transformImage({ zoom: 1, x: 0, y: 0, rotation: 0 });
  else if (action === 'session.end') standby();
  acknowledge(command);
}

function showMedia(media, mode = 'show', sessionId, fromQueue = false) {
  if (!fromQueue) {
    mediaQueue.splice(queueIndex + 1);
    mediaQueue.push({ media, mode, sessionId });
    queueIndex = mediaQueue.length - 1;
  }
  stage.replaceChildren();
  const frame = document.createElement('article');
  frame.className = 'received-media';
  if (media.type === 'text/uri-list') {
    const link = document.createElement('a');
    link.href = media.data;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'WEBINHALT EXTERN ÖFFNEN';
    currentVisual = link;
  } else if (media.type.startsWith('video/')) {
    currentVisual = document.createElement('video');
    currentVisual.src = media.data;
    currentVisual.controls = false;
    currentVisual.autoplay = true;
    currentVisual.muted = true;
    currentVisual.playsInline = true;
    currentVisual.addEventListener('timeupdate', () => {
      if (Date.now() - lastReport > 1500) {
        lastReport = Date.now();
        updatePlayback();
        reportState();
      }
    });
  } else if (media.type === 'application/pdf') {
    currentVisual = document.createElement('iframe');
    currentVisual.src = media.data;
  } else {
    currentVisual = document.createElement('img');
    currentVisual.src = media.data;
  }
  frame.append(currentVisual);
  const caption = document.createElement('div');
  const label = document.createElement('small');
  label.textContent = `${mode === 'transfer' ? 'FILE TRANSFER' : 'PRESENTATION'} // ${new Date().toLocaleTimeString()}`;
  const title = document.createElement('strong');
  title.textContent = media.title;
  caption.append(label, title);
  if (mode === 'transfer' && media.type !== 'text/uri-list') {
    const download = document.createElement('a');
    download.href = media.data;
    download.download = media.title;
    download.textContent = 'DATEI SPEICHERN';
    caption.append(download);
  }
  frame.append(caption);
  stage.append(frame);
  state = {
    status: mode === 'transfer' ? 'transfer' : 'presenting',
    current: { sessionId, title: media.title, type: media.type, mode },
    playback: media.type.startsWith('video/')
      ? { paused: false, time: 0, volume: 1 }
      : null,
    transform: media.type.startsWith('image/')
      ? { zoom: 1, x: 0, y: 0, rotation: 0 }
      : null,
  };
  status.textContent = mode === 'transfer' ? 'TRANSFER READY' : 'PRESENTING';
}

function controlVideo(action) {
  if (!(currentVisual instanceof HTMLVideoElement)) return;
  const result = currentVisual[action]();
  if (result?.catch)
    result.catch(() => {
      status.textContent = 'PLAYBACK BLOCKED';
    });
  updatePlayback();
}

function updatePlayback() {
  if (currentVisual instanceof HTMLVideoElement)
    state.playback = {
      paused: currentVisual.paused,
      time: currentVisual.currentTime,
      duration: Number.isFinite(currentVisual.duration)
        ? currentVisual.duration
        : null,
      volume: currentVisual.muted ? 0 : currentVisual.volume,
    };
}

function showQueued(index) {
  if (index < 0 || index >= mediaQueue.length) return;
  queueIndex = index;
  const entry = mediaQueue[index];
  showMedia(entry.media, entry.mode, entry.sessionId, true);
}

function transformImage(transform) {
  if (!(currentVisual instanceof HTMLImageElement)) return;
  state.transform = { ...state.transform, ...transform };
  const value = state.transform;
  currentVisual.style.transform = `translate(${Number(value.x || 0)}px,${Number(value.y || 0)}px) rotate(${Number(value.rotation || 0)}deg) scale(${Number(value.zoom || 1)})`;
}

function standby() {
  if (currentVisual instanceof HTMLVideoElement) currentVisual.pause();
  currentVisual = null;
  stage.innerHTML =
    '<div class="receiver-orbit"><i></i><i></i><i></i><strong>LINK</strong></div><p>VERBINDUNG BEREIT</p>';
  state = { status: 'standby', current: null, playback: null, transform: null };
  status.textContent = 'SECURE LINK';
}

function reportState(type = 'state.report', commandId) {
  if (socket?.readyState === WebSocket.OPEN)
    socket.send(
      JSON.stringify({ v: 1, protocol: PROTOCOL, type, commandId, state }),
    );
}
function acknowledge(command, extra = {}) {
  reportState('command.ack', command.id);
  if (extra.error) status.textContent = extra.error.toUpperCase();
}

if (credentials) connect();
else advertise();
