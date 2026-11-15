import { createExplanationPlayer } from './explanation-player.js';
import { CONVERSATION_DEMO } from './conversation-demo.js';
import { createChatDrawer } from './chat-drawer.js';

export function createConversation(root, { displays, openModule } = {}) {
  const $ = (s) => root.querySelector(s);
  const mic = $('[data-mic]'),
    status = $('[data-status]'),
    transcript = $('[data-transcript]'),
    answer = $('[data-answer]'),
    stop = $('[data-stop]');
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null,
    listening = false,
    pending = false,
    abort = null,
    conversationId = null,
    visuals = true,
    targets = [],
    speechToken = 0,
    speechQueue = [],
    speaking = false,
    available = false;
  let loginPoll = null,
    loginExpiresAt = null,
    pollBusy = false,
    completingLogin = false;
  const chat = createChatDrawer(root, {
    onOpen() {
      cancelSpeech();
      recognition?.abort();
      listening = false;
      mic.setAttribute('aria-pressed', 'false');
      showStop(pending);
    },
    onClose() {
      showStop(pending || speaking);
    },
    onHint: setStatus,
  });
  const player = createExplanationPlayer($('[data-explanation]'), {
    onNarration: (text) => {
      chat.append('assistant', text);
      say(text, true);
    },
    onChange: (state) =>
      root.classList.toggle(
        'jarvis-explaining',
        !state.closed && state.visible !== false,
      ),
  });
  function setStatus(text) {
    status.textContent = text;
    $('[data-chat-status]').textContent = text;
  }
  function showStop(value) {
    stop.hidden = !value;
    $('[data-chat-stop]').hidden = !value;
  }
  function cancelSpeech() {
    speechToken++;
    speechQueue = [];
    speaking = false;
    window.speechSynthesis?.cancel();
  }
  function say(text, queue = false) {
    if (chat.isOpen()) return;
    if (!window.speechSynthesis || !text) return;
    if (queue) {
      speechQueue.push(text);
      if (speaking) return;
    } else {
      cancelSpeech();
      speechQueue = [text];
    }
    function next() {
      if (!speechQueue.length) {
        speaking = false;
        showStop(pending);
        return;
      }
      speaking = true;
      showStop(true);
      const token = speechToken;
      const utterance = new SpeechSynthesisUtterance(speechQueue.shift());
      utterance.lang = 'de-DE';
      utterance.onend = utterance.onerror = () => {
        if (token === speechToken) next();
      };
      window.speechSynthesis.speak(utterance);
    }
    next();
  }
  async function control(command) {
    if (['pause', 'close', 'next', 'previous'].includes(command))
      cancelSpeech();
    player.control(command);
    if (targets.length) {
      try {
        const result = await displays.tool('control_explanation', {
          display_ids: targets,
          command,
        });
        const rejected = result.results?.find((r) => !r.accepted);
        if (rejected) setStatus(rejected.error);
      } catch (error) {
        setStatus(error.message);
      }
    }
  }
  function interrupt() {
    abort?.abort();
    abort = null;
    recognition?.abort();
    listening = false;
    pending = false;
    cancelSpeech();
    control('pause');
    showStop(false);
    mic.setAttribute('aria-pressed', 'false');
    setStatus('Angehalten. Ich höre auf deinen nächsten Auftrag.');
  }
  function localCommand(text) {
    const plain = text
      .toLowerCase()
      .replace(/[.!?,]/g, '')
      .replace(/^(hey\s+)?jarvis\s*/, '')
      .trim();
    if (
      /^(demo|zeig (mir )?(die |eine )?demo|starte (die )?demo)$/.test(plain)
    ) {
      interrupt();
      targets = [];
      visuals = true;
      player.setVisible(true);
      player.show(CONVERSATION_DEMO);
      setStatus('Demo mit festen Beispieldaten · keine Live-Recherche');
      return true;
    }
    if (/^(stopp?|abbrechen|ruhe|hör auf)$/.test(plain)) {
      interrupt();
      return true;
    }
    if (/^(weiter|nächste[rs]?|zeig weiter)$/.test(plain)) {
      control('next');
      return true;
    }
    if (/^(bleib hier|warte|pause|halte?n?)$/.test(plain)) {
      control('pause');
      return true;
    }
    if (/^(fortsetzen|mach weiter)$/.test(plain)) {
      control('resume');
      return true;
    }
    if (/^(zurück|vorherige[rs]?)$/.test(plain)) {
      control('previous');
      return true;
    }
    if (/^(fenster schließen|alles schließen)$/.test(plain)) {
      control('close');
      return true;
    }
    if (/^(ohne fenster|nur sprechen|keine fenster)$/.test(plain)) {
      visuals = false;
      player.setVisible(false);
      control('close');
      setStatus('Nur Sprache. Mit „mit Fenstern“ wieder einschalten.');
      return true;
    }
    if (/^(mit fenstern|zeig fenster|visuell erklären)$/.test(plain)) {
      visuals = true;
      player.setVisible(true);
      setStatus('Visuelle Erklärungen sind eingeschaltet.');
      return true;
    }
    const modules = {
      medien: 'MEDIA',
      media: 'MEDIA',
      karte: 'WORLD',
      welt: 'WORLD',
      receiver: 'RECEIVER',
      bildschirme: 'RECEIVER',
      system: 'SYSTEM',
    };
    const destination = plain.replace(/^(öffne|zeige|zeig)\s+/, '');
    if (modules[destination]) {
      chat.close({ focus: false });
      openModule(modules[destination]);
      return true;
    }
    return false;
  }
  async function send(text) {
    if (!text.trim()) return;
    transcript.textContent = text;
    chat.append('user', text);
    if (localCommand(text)) return;
    if (pending) {
      setStatus('Sag „Stopp“, um den laufenden Auftrag abzubrechen.');
      return;
    }
    cancelSpeech();
    control('pause');
    if (!available) {
      setStatus('Bitte zuerst mit deinem ChatGPT-Konto bei Codex anmelden.');
      return;
    }
    pending = true;
    showStop(true);
    answer.textContent = '';
    setStatus('Ich kümmere mich darum …');
    const requestAbort = new AbortController();
    abort = requestAbort;
    try {
      const response = await fetch(new URL('jarvis/turn', displays.base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, conversationId, visuals }),
        signal: requestAbort.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Verbindung: HTTP ${response.status}`);
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        hasExplanation = false,
        complete = false;
      const event = (message) => {
        if (message.type === 'conversation')
          conversationId = message.conversationId;
        if (message.type === 'tool') setStatus(message.label + ' …');
        if (message.type === 'explanation' && visuals) {
          hasExplanation = true;
          targets = message.targets || [];
          player.show(message.explanation);
          setStatus('Ich zeige dir die Fundstellen.');
        }
        if (message.type === 'control') player.control(message.command);
        if (message.type === 'answer') {
          complete = true;
          answer.textContent = message.text;
          chat.append('assistant', message.text);
          if (!hasExplanation) say(message.text);
          setStatus('Bereit. Sag mir, was du genauer wissen möchtest.');
        }
        if (message.type === 'error') {
          complete = true;
          if (/abgelaufen/.test(message.message)) conversationId = null;
          throw new Error(message.message);
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 250000) throw new Error('Antwort ist zu groß.');
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (line.trim()) event(JSON.parse(line));
        }
      }
      if (buffer.trim()) event(JSON.parse(buffer));
      if (!complete)
        throw new Error('Verbindung unterbrochen. Bitte erneut versuchen.');
    } catch (error) {
      if (!requestAbort.signal.aborted) {
        requestAbort.abort();
        setStatus(error.message);
      }
    } finally {
      if (abort === requestAbort) {
        abort = null;
        pending = false;
        showStop(speaking);
      }
    }
  }
  mic.addEventListener('click', () => {
    if (listening) {
      recognition?.stop();
      return;
    }
    if (!Recognition || !window.isSecureContext) {
      chat.open();
      setStatus(
        'Sprache braucht einen unterstützten Browser und HTTPS. Du kannst hier schreiben.',
      );
      return;
    }
    cancelSpeech();
    player.control('pause');
    recognition = new Recognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      if (chat.isOpen() || root.hidden) {
        recognition?.abort();
        return;
      }
      listening = true;
      mic.setAttribute('aria-pressed', 'true');
      setStatus('Ich höre zu …');
    };
    recognition.onresult = (event) => {
      if (chat.isOpen() || root.hidden) return;
      let final = '';
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const words = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += words;
        else partial += words;
      }
      transcript.textContent = final || partial;
      if (final) send(final);
    };
    recognition.onerror = (event) =>
      setStatus(
        event.error === 'not-allowed'
          ? 'Mikrofon nicht freigegeben. Bitte schreiben oder die Browserfreigabe ändern.'
          : `Spracheingabe: ${event.error}. Schreiben ist weiterhin möglich.`,
      );
    recognition.onend = () => {
      listening = false;
      mic.setAttribute('aria-pressed', 'false');
    };
    try {
      recognition.start();
    } catch {
      setStatus('Mikrofon konnte nicht gestartet werden. Bitte schreiben.');
    }
  });
  stop.addEventListener('click', interrupt);
  $('[data-chat-stop]').addEventListener('click', interrupt);
  $('[data-text-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const field = $('[data-input]');
    send(field.value);
    field.value = '';
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (chat.isOpen()) {
        event.preventDefault();
        chat.close();
      } else interrupt();
    }
  });
  function authProgress(text, error = false) {
    $('[data-auth-progress]').textContent = text;
    $('[data-auth-progress]').classList.toggle('auth-error', error);
  }
  function stopLoginPolling() {
    clearInterval(loginPoll);
    loginPoll = null;
  }
  function pollLogin(expiresAt) {
    loginExpiresAt = expiresAt;
    if (loginPoll) return;
    loginPoll = setInterval(async () => {
      if (document.hidden || pollBusy || completingLogin) return;
      if (loginExpiresAt && Date.now() > loginExpiresAt) {
        stopLoginPolling();
        authProgress(
          'Anmeldung abgelaufen. Bitte mit ChatGPT neu anmelden.',
          true,
        );
        setStatus('Anmeldung abgelaufen. Bitte neu starten.');
        return;
      }
      pollBusy = true;
      try {
        await refreshConnection(false);
      } finally {
        pollBusy = false;
      }
    }, 2500);
  }
  async function refreshConnection(announce = true) {
    try {
      const response = await fetch(new URL('jarvis/status', displays.base), {
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          'Der Anmeldestatus konnte nicht geladen werden. Bitte STARK über Home Assistant öffnen.',
        );
      const state = await response.json();
      available = state.available;
      if (announce)
        setStatus(
          state.available
            ? 'Bereit. Tippe auf Jarvis und sprich.'
            : state.reason,
        );
      $('[data-auth]').hidden =
        state.provider !== 'codex' || state.available || !state.loginAvailable;
      $('[data-account]').hidden =
        state.provider !== 'codex' || !state.available;
      const waiting =
        state.provider === 'codex' && state.loginPending && !state.available;
      root.classList.toggle('jarvis-signing-in', Boolean(waiting));
      $('[data-remote]').hidden = !waiting;
      $('[data-login]').textContent = waiting
        ? 'Browseranmeldung erneut öffnen'
        : 'Mit ChatGPT anmelden';
      if (state.available) {
        const wasWaiting = Boolean(loginPoll || loginExpiresAt);
        stopLoginPolling();
        loginExpiresAt = null;
        $('[data-auth-link]').hidden = true;
        authProgress('');
        if (wasWaiting)
          setStatus('Codex ist verbunden. Du kannst mit Jarvis sprechen.');
      } else if (waiting) {
        pollLogin(
          state.loginExpiresAt || loginExpiresAt || Date.now() + 600000,
        );
      } else if (state.provider === 'codex') {
        stopLoginPolling();
        if (state.loginError) authProgress(state.loginError, true);
      }
      $('[data-scope]').textContent =
        state.searchScope === 'web'
          ? 'Recherche: Websuche + Originalquellen'
          : 'Recherche: Wikipedia · Websuche noch nicht konfiguriert';
      return state;
    } catch (error) {
      setStatus(error.message);
      return null;
    }
  }
  async function authRequest(path, body = {}) {
    let response;
    try {
      response = await fetch(new URL(`jarvis/${path}`, displays.base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new Error(
        'Verbindung unterbrochen. Bitte zu STARK zurückkehren und erneut versuchen.',
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        'Home Assistant hat keine lesbare Antwort geliefert. Bitte STARK über die Seitenleiste erneut öffnen.',
      );
    }
    if (!response.ok)
      throw new Error(result.error || 'Codex-Anmeldung fehlgeschlagen.');
    return result;
  }
  $('[data-login]').addEventListener('click', async () => {
    const button = $('[data-login]');
    button.disabled = true;
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      authProgress('Browseranmeldung wird gestartet …');
      const login = await authRequest('login');
      const url = new URL(login.authUrl);
      if (url.origin !== 'https://auth.openai.com')
        throw new Error('Ungültige Codex-Anmeldeadresse.');
      const link = $('[data-auth-link]');
      link.href = url.href;
      link.hidden = false;
      $('[data-remote]').hidden = false;
      root.classList.add('jarvis-signing-in');
      pollLogin(login.expiresAt);
      button.textContent = 'Browseranmeldung erneut öffnen';
      authProgress(
        'Nach der Anmeldung hierher zurückkehren und den Link aus der Browser-Adresszeile einfügen.',
      );
      setStatus(
        'Browseranmeldung läuft. Der zweite Schritt steht direkt darunter.',
      );
      if (popup) popup.location.replace(url.href);
    } catch (error) {
      popup?.close();
      authProgress(error.message, true);
      setStatus(error.message);
    } finally {
      button.disabled = false;
    }
  });
  $('[data-callback-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (completingLogin) return;
    const field = $('[data-callback]');
    const callbackUrl = field.value;
    field.value = '';
    const button = $('[data-callback-submit]');
    completingLogin = true;
    button.disabled = true;
    $('[data-login]').disabled = true;
    button.textContent = 'Wird verbunden …';
    authProgress('Weiterleitung wird an Codex übergeben …');
    try {
      await authRequest('login/complete', { callbackUrl });
      const state = await refreshConnection(false);
      if (!state?.available)
        throw new Error(
          'Die Rückgabe ist angekommen. Bitte kurz warten; der Status wird weiter automatisch geprüft.',
        );
      setStatus('Codex ist verbunden. Du kannst mit Jarvis sprechen.');
    } catch (error) {
      authProgress(error.message, true);
      setStatus(error.message);
    } finally {
      completingLogin = false;
      button.disabled = false;
      $('[data-login]').disabled = false;
      button.textContent = 'Anmeldung abschließen';
    }
  });
  const resumeLogin = () => {
    if (!root.hidden && !document.hidden && !completingLogin && !pollBusy)
      refreshConnection(false);
  };
  window.addEventListener('focus', resumeLogin);
  document.addEventListener('visibilitychange', resumeLogin);
  $('[data-logout]').addEventListener('click', async () => {
    interrupt();
    try {
      await authRequest('logout');
      conversationId = null;
      await refreshConnection();
    } catch (error) {
      setStatus(error.message);
    }
  });
  refreshConnection();
  return {
    send,
    interrupt,
    showVoice: () => chat.close({ focus: false }),
    player,
    destroy() {
      stopLoginPolling();
      window.removeEventListener('focus', resumeLogin);
      document.removeEventListener('visibilitychange', resumeLogin);
      interrupt();
      chat.destroy();
      player.destroy();
    },
  };
}
