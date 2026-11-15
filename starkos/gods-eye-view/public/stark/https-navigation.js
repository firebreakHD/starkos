// Top-level navigation avoids an insecure Home Assistant ancestor. This does
// not loosen frame policies or send a session/password to another origin.
export function setupHttpsNavigation({ root, base, windowRef = window } = {}) {
  let entry = null;
  function links(container) {
    const text = document.createElement('p');
    text.textContent = 'HTTPS für Voice öffnen';
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
      entry = { url: url.href, autoOpen: data.autoOpen === true };
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
      const key = 'stark-https-handoff';
      try {
        if (windowRef.sessionStorage.getItem(key) === entry.url) return;
        windowRef.sessionStorage.setItem(key, entry.url);
      } catch {
        // With restricted tab storage, leave the explicit link instead of
        // risking repeated navigation on reload or Back.
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
