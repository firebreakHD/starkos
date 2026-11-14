// Text is an optional drawer over the default voice view. Both views use the
// same conversation; the drawer's open/gesture state is never persisted.
export function createChatDrawer(
  root,
  { onOpen = () => {}, onClose = () => {}, onHint = () => {} } = {},
) {
  const grip = root.querySelector('[data-chat-grip]');
  const dialog = root.querySelector('[data-chat]');
  const input = root.querySelector('[data-input]');
  const scroll = root.querySelector('[data-chat-scroll]');
  const log = root.querySelector('[data-chat-log]');
  const surface = root.querySelector('[data-explanation]');
  const visualSlot = root.querySelector('[data-chat-visual]');
  const anchor = document.createComment('voice explanation position');
  surface.before(anchor);
  let pointer = null,
    start = null,
    ready = false,
    timer = null,
    opened = false;
  const distance = () => Math.max(72, Math.min(120, innerWidth * 0.25));
  const layout = () => {
    if (window.visualViewport) {
      dialog.style.setProperty(
        '--chat-height',
        `${window.visualViewport.height}px`,
      );
      dialog.style.setProperty(
        '--chat-top',
        `${window.visualViewport.offsetTop}px`,
      );
    }
  };
  function resetGesture() {
    clearTimeout(timer);
    timer = null;
    const previous = pointer;
    pointer = null;
    start = null;
    ready = false;
    grip.classList.remove('is-ready');
    grip.style.removeProperty('--chat-drag');
    grip.setAttribute(
      'aria-label',
      'Textchat: kurz halten und nach rechts ziehen. Mit der Tastatur direkt öffnen.',
    );
    if (previous !== null && grip.hasPointerCapture(previous))
      grip.releasePointerCapture(previous);
  }
  function restoreVoice() {
    resetGesture();
    if (!opened) return;
    opened = false;
    anchor.after(surface);
    grip.setAttribute('aria-expanded', 'false');
    grip.hidden = false;
    root.classList.remove('jarvis-chat-open');
    onClose();
  }
  function open() {
    if (root.hidden || dialog.open) return;
    resetGesture();
    onOpen();
    opened = true;
    grip.hidden = true;
    grip.setAttribute('aria-expanded', 'true');
    root.classList.add('jarvis-chat-open');
    visualSlot.append(surface);
    layout();
    dialog.showModal();
    scroll.scrollTop = scroll.scrollHeight;
    input.focus({ preventScroll: true });
  }
  function close({ focus = true } = {}) {
    resetGesture();
    if (dialog.open) dialog.close();
    restoreVoice();
    if (focus && !root.hidden)
      root.querySelector('[data-mic]').focus({ preventScroll: true });
  }
  grip.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    start = { x: event.clientX, y: event.clientY };
    grip.setPointerCapture(pointer);
    timer = setTimeout(() => {
      if (pointer === null) return;
      ready = true;
      grip.classList.add('is-ready');
      grip.setAttribute(
        'aria-label',
        'Jetzt nach rechts ziehen, um den Textchat zu öffnen.',
      );
    }, 500);
  });
  grip.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    const x = event.clientX - start.x,
      y = event.clientY - start.y;
    if (!ready && Math.hypot(x, y) > 12) {
      resetGesture();
      return;
    }
    if (ready)
      grip.style.setProperty(
        '--chat-drag',
        `${Math.max(0, Math.min(180, x))}px`,
      );
  });
  grip.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointer) return;
    const shouldOpen =
      ready &&
      event.clientX - start.x >= distance() &&
      Math.abs(event.clientY - start.y) < 80;
    resetGesture();
    if (shouldOpen) open();
  });
  grip.addEventListener('pointercancel', resetGesture);
  grip.addEventListener('lostpointercapture', resetGesture);
  grip.addEventListener('contextmenu', (event) => event.preventDefault());
  grip.addEventListener('click', (event) => {
    if (event.detail === 0) open();
    else if (!dialog.open)
      onHint(
        'Für den Textchat den Griff links unten kurz halten und nach rechts ziehen.',
      );
  });
  root
    .querySelector('[data-chat-close]')
    .addEventListener('click', () => close());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', restoreVoice);
  const onVisibility = () => {
    if (document.hidden) close({ focus: false });
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', resetGesture);
  window.visualViewport?.addEventListener('resize', layout);
  window.visualViewport?.addEventListener('scroll', layout);
  return {
    open,
    close,
    isOpen: () => dialog.open,
    append(role, text) {
      if (!text) return;
      const follow =
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
      const message = document.createElement('article');
      message.className = `chat-message chat-${role}`;
      const label = document.createElement('small');
      label.textContent = role === 'user' ? 'DU' : 'JARVIS';
      const content = document.createElement('p');
      content.textContent = text;
      message.append(label, content);
      log.append(message);
      while (log.children.length > 80) log.firstElementChild.remove();
      if (follow) scroll.scrollTop = scroll.scrollHeight;
    },
    destroy() {
      close({ focus: false });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', resetGesture);
      window.visualViewport?.removeEventListener('resize', layout);
      window.visualViewport?.removeEventListener('scroll', layout);
    },
  };
}
