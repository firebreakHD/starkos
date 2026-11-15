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

// Top-level navigation avoids an insecure Home Assistant ancestor.
// Opening HTTPS never requires a login handoff from the current view.
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
    const external = document.createElement('a');
    external.href = entry.url;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    external.textContent = 'Alternativ im Browser öffnen';
    container.append(text, internal, external);
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
        windowRef.top.location.replace(entry.url);
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
