// One account controller shared by settings and the assistant. No credentials are persisted in the UI.
export function createCodexAccount(root, { displays }) {
  const $ = (selector) => root.querySelector(selector);
  let available = false,
    loginPoll = null,
    loginExpiresAt = null,
    pollBusy = false,
    completingLogin = false;
  const listeners = new Set();
  const setStatus = (text) => {
    $('[data-account-status]').textContent = text || '';
  };
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
      for (const listener of listeners) listener(state);
      if (announce)
        setStatus(state.available ? 'Codex ist verbunden.' : state.reason);
      // Keep the return field reachable whenever the user is signed out,
      // including lost/expired pending state and unavailable status checks.
      const authVisible = !state.available && state.provider !== 'gateway';
      $('[data-auth]').hidden = !authVisible;
      $('[data-account]').hidden =
        state.provider !== 'codex' || !state.available;
      const waiting =
        state.provider === 'codex' && state.loginPending && !state.available;
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
      if (!available) {
        $('[data-auth]').hidden = false;
      }
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
    if (
      !root.closest('[hidden]') &&
      !document.hidden &&
      !completingLogin &&
      !pollBusy
    )
      refreshConnection(false);
  };
  window.addEventListener('focus', resumeLogin);
  document.addEventListener('visibilitychange', resumeLogin);
  $('[data-logout]').addEventListener('click', async () => {
    try {
      await authRequest('logout');
      await refreshConnection();
    } catch (error) {
      setStatus(error.message);
    }
  });
  return {
    refresh: refreshConnection,
    isAvailable: () => available,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
