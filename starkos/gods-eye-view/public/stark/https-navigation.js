// Probe from this device, not the add-on: its LAN listener being alive says
// nothing about mobile DNS, certificate trust or router/proxy reachability.
export async function checkHttpsTarget(
  target,
  { fetchImpl = fetch, timeoutMs = 4000 } = {},
) {
  try {
    const url = new URL(target);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return { reachable: false, reason: 'invalid' };
    const endpoint = new URL('../api/stark/health', url);
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { reachable: false, reason: 'service' };
    const data = await response.json();
    return {
      reachable: data?.status === 'ok' && data?.service === 'starkos',
      reason: 'service',
    };
  } catch {
    return { reachable: false, reason: 'connection' };
  }
}

// Top-level navigation avoids an insecure Home Assistant ancestor. This does
// keeps frame policies intact and never sends a session cookie or password.
export function setupHttpsNavigation({ root, base, windowRef = window } = {}) {
  let entry = null;
  function links(container) {
    const text = document.createElement('p');
    text.textContent = entry.error || 'HTTPS für Voice öffnen';
    text.classList.toggle('auth-error', Boolean(entry.error));
    const internal = document.createElement('a');
    internal.href = entry.url;
    internal.target = '_top';
    internal.textContent = 'HTTPS in dieser Ansicht öffnen';
    internal.addEventListener('click', (event) => {
      if (needsHandoff()) {
        event.preventDefault();
        navigate('_top', container);
      }
    });
    const external = document.createElement('a');
    external.href = entry.url;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    external.textContent = 'Alternativ im Browser öffnen';
    external.addEventListener('click', (event) => {
      if (needsHandoff()) {
        event.preventDefault();
        navigate('_blank', container);
      }
    });
    container.append(text, internal, external);
  }
  function needsHandoff() {
    const current = new URL(windowRef.location.href),
      target = new URL(entry.url);
    return (
      entry.requiresHandoff &&
      (current.origin !== target.origin ||
        current.pathname.replace(/\/+$/, '') !==
          target.pathname.replace(/\/+$/, ''))
    );
  }
  async function navigate(target, container) {
    if (!needsHandoff()) {
      windowRef.top.location.replace(entry.url);
      return;
    }
    let popup = null;
    const name = 'stark-https-' + Math.random().toString(36).slice(2);
    if (target === '_blank') {
      popup = windowRef.open('about:blank', name);
      if (!popup) {
        entry.error =
          'Das neue Fenster wurde blockiert. Bitte den Link für diese Ansicht verwenden.';
        container.replaceChildren();
        links(container);
        return;
      }
      popup.opener = null;
    }
    try {
      const response = await fetch(new URL('https-ticket', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('handoff');
      const data = await response.json();
      if (
        typeof data.ticket !== 'string' ||
        !/^[a-zA-Z0-9_-]{43}$/.test(data.ticket)
      )
        throw new Error('handoff');
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = new URL('/stark/https-handoff', entry.url).href;
      form.target = target === '_blank' ? name : '_top';
      form.hidden = true;
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'ticket';
      field.value = data.ticket;
      form.append(field);
      document.body.append(form);
      form.submit();
      setTimeout(() => form.remove(), 1000);
    } catch {
      popup?.close();
      entry.error =
        'Bitte STARK über die angemeldete Home-Assistant-Ansicht öffnen und den Wechsel erneut starten.';
      container.replaceChildren();
      links(container);
    }
  }
  const ready = (async () => {
    try {
      const response = await fetch(new URL('https-entry', base), {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json();
      const url = new URL(data.url);
      if (
        !data.enabled ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return;
      entry = {
        url: url.href,
        autoOpen: data.autoOpen === true,
        requiresHandoff: data.requiresHandoff === true,
      };
      root.replaceChildren();
      root.hidden = false;
      links(root);
      if (windowRef.isSecureContext || !entry.autoOpen) return;
      const current = new URL(windowRef.location.href);
      if (
        current.origin === url.origin &&
        current.pathname.replace(/\/+$/, '') ===
          url.pathname.replace(/\/+$/, '')
      )
        return;
      // Don't trap Back navigation in a repeated automatic redirect.
      const key = 'stark-https-handoff-v2';
      try {
        if (windowRef.sessionStorage.getItem(key) === entry.url) return;
        // Write the attempt only after the target is verified.
      } catch {
        // With restricted tab storage, leave the explicit link instead of
        // risking repeated navigation on reload or Back.
        return;
      }
      const result = await checkHttpsTarget(entry.url);
      if (!result.reachable) {
        entry.error =
          result.reason === 'service'
            ? 'Diese Adresse antwortet nicht als STARK. Bitte STARK-Adresse und Port prüfen.'
            : 'HTTPS-Verbindung nicht bestätigt. Bitte Adresse, Port, Zertifikat und Weiterleitung prüfen. Home Assistant bleibt geöffnet.';
        root.replaceChildren();
        links(root);
        return;
      }
      try {
        windowRef.sessionStorage.setItem(key, entry.url);
      } catch {
        return;
      }
      try {
        await navigate('_top', root);
      } catch {
        /* WebView/sandbox can require an explicit tap. Keep links reachable. */
      }
    } catch {
      /* Keep ordinary Ingress available if metadata/network is unavailable. */
    }
  })();
  return {
    ready,
    offer(container) {
      const show = () => {
        if (!entry || container.hidden || !container.isConnected) return;
        container.replaceChildren();
        links(container);
      };
      if (entry) show();
      else ready.then(show);
    },
  };
}
