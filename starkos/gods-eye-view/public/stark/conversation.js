import { createExplanationPlayer } from './explanation-player.js';
import { CONVERSATION_DEMO } from './conversation-demo.js';

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
  const player = createExplanationPlayer($('[data-explanation]'), {
    onNarration: (text) => say(text, true),
    onChange: (state) =>
      root.classList.toggle(
        'jarvis-explaining',
        !state.closed && state.visible !== false,
      ),
  });
  function setStatus(text) {
    status.textContent = text;
  }
  function cancelSpeech() {
    speechToken++;
    speechQueue = [];
    speaking = false;
    window.speechSynthesis?.cancel();
  }
  function say(text, queue = false) {
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
        stop.hidden = !pending;
        return;
      }
      speaking = true;
      stop.hidden = false;
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
    stop.hidden = true;
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
      openModule(modules[destination]);
      return true;
    }
    return false;
  }
  async function send(text) {
    if (!text.trim()) return;
    transcript.textContent = text;
    if (localCommand(text)) return;
    if (pending) {
      setStatus('Sag „Stopp“, um den laufenden Auftrag abzubrechen.');
      return;
    }
    cancelSpeech();
    control('pause');
    if (!available) {
      setStatus(
        'Hermes ist noch nicht verbunden. Verbindung in den Home-Assistant-Optionen einrichten.',
      );
      return;
    }
    pending = true;
    stop.hidden = false;
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
        stop.hidden = !speaking;
      }
    }
  }
  mic.addEventListener('click', () => {
    if (listening) {
      recognition?.stop();
      return;
    }
    if (!Recognition || !window.isSecureContext) {
      $('[data-text-options]').open = true;
      $('[data-input]').focus();
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
      listening = true;
      mic.setAttribute('aria-pressed', 'true');
      setStatus('Ich höre zu …');
    };
    recognition.onresult = (event) => {
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
  $('[data-text-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const field = $('[data-input]');
    send(field.value);
    field.value = '';
    $('[data-text-options]').open = false;
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') interrupt();
  });
  fetch(new URL('jarvis/status', displays.base))
    .then((r) => {
      if (!r.ok) throw Error('Verbindung nicht verfügbar.');
      return r.json();
    })
    .then((state) => {
      available = state.available;
      setStatus(
        state.available ? 'Bereit. Tippe auf Jarvis und sprich.' : state.reason,
      );
      $('[data-scope]').textContent =
        state.searchScope === 'web'
          ? 'Recherche: Websuche + Originalquellen'
          : 'Recherche: Wikipedia · Websuche noch nicht konfiguriert';
    })
    .catch((error) => setStatus(error.message));
  return {
    send,
    interrupt,
    player,
    destroy() {
      interrupt();
      player.destroy();
    },
  };
}
