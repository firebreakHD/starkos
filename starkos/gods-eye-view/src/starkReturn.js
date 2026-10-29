// STARK OS opens God's Eye View with `?world=1&stark=1`. The engine then runs
// with its own interface; this file only adds the way back to the STARK ring,
// so nothing of the upstream app is hidden or replaced.
//
// The link is relative, so it resolves correctly both on direct LAN access and
// below Home Assistant's per-session Ingress path. In the engine's clean view
// it steps aside, because that mode is meant to show the globe alone.

const STARK_RETURN_ID = 'stark-return';

/** Whether this page was opened from the STARK OS shell. */
export function cameFromStark(location = globalThis.location) {
  return new URLSearchParams(location?.search || '').get('stark') === '1';
}

/** Where the ring lives, relative to the running engine page. */
export function starkShellUrl(location = globalThis.location) {
  return new URL('stark/', location?.href || '/').href;
}

export function installStarkReturn({
  documentRef = globalThis.document,
  location = globalThis.location,
} = {}) {
  if (!documentRef || !cameFromStark(location)) return () => {};
  if (documentRef.getElementById(STARK_RETURN_ID)) return () => {};

  const style = documentRef.createElement('style');
  style.textContent = `
    #${STARK_RETURN_ID} {
      position: fixed;
      z-index: 2147483000;
      top: max(10px, env(safe-area-inset-top));
      left: max(10px, env(safe-area-inset-left));
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 38px;
      padding: 0 13px;
      border: 1px solid rgba(105, 235, 255, 0.55);
      border-radius: 7px;
      background: rgba(2, 11, 16, 0.82);
      color: #d9fbff;
      font: 600 11px/1 system-ui, sans-serif;
      letter-spacing: 0.16em;
      text-decoration: none;
      backdrop-filter: blur(6px);
    }
    #${STARK_RETURN_ID}:hover,
    #${STARK_RETURN_ID}:focus-visible {
      border-color: #69ebff;
      background: rgba(6, 26, 34, 0.92);
    }
    #${STARK_RETURN_ID} b {
      font-size: 15px;
      line-height: 1;
    }
    body.ui-clean-view #${STARK_RETURN_ID} {
      display: none;
    }
  `;
  documentRef.head.append(style);

  const link = documentRef.createElement('a');
  link.id = STARK_RETURN_ID;
  link.href = starkShellUrl(location);
  link.rel = 'noopener';
  link.innerHTML = '<b>‹</b><span></span>';
  link.querySelector('span').textContent = 'STARK OS';
  link.setAttribute('aria-label', 'Zurück zum STARK OS Auswahlring');
  documentRef.body.append(link);

  return () => {
    link.remove();
    style.remove();
  };
}
