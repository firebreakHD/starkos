import { createExplanationPlayer } from './explanation-player.js';
import { CONVERSATION_DEMO } from './conversation-demo.js';
import { USB_DEMO } from './visual-demo.js';
import { createChatDrawer } from './chat-drawer.js';
import { allowsPresentation } from './presentation-policy.js';

export function createConversation(
  root,
  { displays, openModule, account } = {},
) {
  const $ = (s) => root.querySelector(s);
  const mic = $('[data-mic]'),
    status = $('[data-status]'),
    transcript = $('[data-transcript]'),
    answer = $('[data-answer]'),
    stop = $('[data-stop]');
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null,
    pending = false,
    abort = null,
    conversationId = null,
    visuals = true,
    targets = [],
    speechToken = 0,
    speechQueue = [],
    speaking = false,
    available = false;
  const chat = createChatDrawer(root, {
    onOpen() {
      cancelSpeech();
      cancelRecording();
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
      utterance.onboundary = (event) => {
        if (token === speechToken)
          player.followNarration(utterance.text, event.charIndex);
      };
      utterance.onend = utterance.onerror = () => {
        if (token === speechToken) {
          player.followNarration(utterance.text, utterance.text.length - 1);
          next();
        }
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
    cancelRecording();
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
      /^(demo|usb demo|demo usb|zeig (mir )?(die |eine )?demo|starte (die )?demo)$/.test(
        plain,
      )
    ) {
      interrupt();
      targets = [];
      visuals = true;
      player.setVisible(true);
      chat.close({ focus: false });
      answer.hidden = true;
      player.show(plain.includes('usb') ? USB_DEMO : CONVERSATION_DEMO);
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
      karte: 'Gods Eye',
      welt: 'Gods Eye',
      'gods eye': 'Gods Eye',
      "god's eye": 'Gods Eye',
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
  async function send(text, { mode = chat.isOpen() ? 'chat' : 'voice' } = {}) {
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
    if (!available) await account.refresh(false);
    if (!available) {
      openModule('SYSTEM');
      setStatus('Bitte zuerst mit deinem ChatGPT-Konto bei Codex anmelden.');
      return;
    }
    pending = true;
    showStop(true);
    answer.textContent = '';
    answer.hidden = true;
    $('[data-notice]').hidden = true;
    const present = allowsPresentation({ mode, text, visuals });
    setStatus('Ich kümmere mich darum …');
    const requestAbort = new AbortController();
    abort = requestAbort;
    try {
      const response = await fetch(new URL('jarvis/turn', displays.base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, conversationId, visuals: present, mode }),
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
        if (message.type === 'explanation' && present) {
          chat.close({ focus: false });
          player.setVisible(true);
          hasExplanation = true;
          targets = message.targets || [];
          player.show(message.explanation);
          setStatus('Ich zeige dir die Fundstellen.');
        }
        if (message.type === 'control') player.control(message.command);
        if (message.type === 'answer') {
          complete = true;
          if (mode === 'voice' || hasExplanation) {
            answer.textContent = message.text;
            answer.hidden = hasExplanation || !message.text;
          }
          chat.append('assistant', message.text);
          if (!hasExplanation && mode === 'voice') say(message.text);
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
        if (mode === 'voice' || !chat.isOpen()) notice(error.message);
      }
    } finally {
      if (abort === requestAbort) {
        abort = null;
        pending = false;
        showStop(speaking);
      }
    }
  }
  // One recording per hold. Interim/final text is buffered until release;
  // cancellations, hidden tabs and late permission grants cannot send a turn.
  let recording = null;
  function notice(text) {
    const element = $('[data-notice]');
    element.textContent = text;
    element.hidden = !text;
  }
  function cancelRecording() {
    const session = recording;
    recording = null;
    if (session) {
      clearTimeout(session.timer);
      session.cancelled = true;
      session.recognition.abort();
    }
    mic.setAttribute('aria-pressed', 'false');
  }
  function beginRecording() {
    if (recording || root.hidden || chat.isOpen()) return;
    if (!Recognition || !window.isSecureContext) {
      chat.open();
      setStatus(
        'Sprache braucht einen unterstützten Browser und HTTPS. Du kannst hier schreiben.',
      );
      return;
    }
    if (pending) interrupt();
    cancelSpeech();
    player.control('pause');
    notice('');
    recognition = new Recognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = true;
    recognition.continuous = true;
    const session = {
      recognition,
      held: true,
      ended: false,
      cancelled: false,
      parts: [],
      timer: null,
    };
    recording = session;
    mic.setAttribute('aria-pressed', 'true');
    const finish = () => {
      if (recording !== session || session.held) return;
      clearTimeout(session.timer);
      recording = null;
      mic.setAttribute('aria-pressed', 'false');
      const text = session.parts.join(' ').trim();
      if (!session.cancelled && !root.hidden && !chat.isOpen() && text)
        send(text, { mode: 'voice' });
    };
    session.finish = finish;
    recognition.onstart = () => {
      if (
        recording !== session ||
        !session.held ||
        root.hidden ||
        chat.isOpen()
      ) {
        session.recognition.abort();
        return;
      }
      setStatus('Ich höre zu …');
    };
    recognition.onresult = (event) => {
      if (recording !== session || session.cancelled) return;
      for (let i = event.resultIndex; i < event.results.length; i++)
        session.parts[i] = event.results[i][0].transcript;
      transcript.textContent = session.parts.join(' ');
    };
    recognition.onerror = (event) => {
      if (recording !== session) return;
      session.cancelled = true;
      const message =
        event.error === 'not-allowed'
          ? 'Mikrofon nicht freigegeben. Bitte die Browserfreigabe ändern oder schreiben.'
          : `Spracheingabe: ${event.error}. Schreiben ist weiterhin möglich.`;
      notice(message);
      setStatus(message);
      cancelRecording();
    };
    recognition.onend = () => {
      session.ended = true;
      finish();
    };
    try {
      recognition.start();
    } catch {
      notice('Mikrofon konnte nicht gestartet werden. Bitte schreiben.');
      cancelRecording();
    }
  }
  function releaseRecording() {
    const session = recording;
    if (!session) return;
    session.held = false;
    mic.setAttribute('aria-pressed', 'false');
    if (session.ended) {
      session.finish();
      return;
    }
    // onend normally delivers final results. A bounded fallback handles stalled engines.
    session.timer = setTimeout(() => {
      session.recognition.abort();
      session.finish();
    }, 2000);
    try {
      session.recognition.stop();
    } catch {
      session.finish();
    }
  }
  let micPointer = null;
  mic.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || micPointer !== null) return;
    event.preventDefault();
    micPointer = event.pointerId;
    mic.setPointerCapture(micPointer);
    beginRecording();
  });
  mic.addEventListener('pointerup', (event) => {
    if (event.pointerId !== micPointer) return;
    micPointer = null;
    releaseRecording();
  });
  mic.addEventListener('pointercancel', () => {
    micPointer = null;
    cancelRecording();
  });
  mic.addEventListener('lostpointercapture', () => {
    if (micPointer !== null) {
      micPointer = null;
      cancelRecording();
    }
  });
  mic.addEventListener('contextmenu', (event) => event.preventDefault());
  mic.addEventListener('keydown', (event) => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) beginRecording();
    }
  });
  mic.addEventListener('keyup', (event) => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      releaseRecording();
    }
  });
  const suspendRecording = () => {
    micPointer = null;
    cancelRecording();
  };
  const visibility = () => {
    if (document.hidden) suspendRecording();
  };
  window.addEventListener('blur', suspendRecording);
  document.addEventListener('visibilitychange', visibility);
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
  const unsubscribe = account.subscribe((state) => {
    if (available && !state.available) {
      interrupt();
      conversationId = null;
    }
    available = state.available;
  });
  available = account.isAvailable();
  return {
    send,
    interrupt,
    showVoice() {
      chat.close({ focus: false });
      interrupt();
      player.control('close');
      answer.textContent = '';
      answer.hidden = true;
      notice('');
      account.refresh(false);
    },
    player,
    destroy() {
      unsubscribe();
      window.removeEventListener('blur', suspendRecording);
      document.removeEventListener('visibilitychange', visibility);
      interrupt();
      chat.destroy();
      player.destroy();
    },
  };
}
