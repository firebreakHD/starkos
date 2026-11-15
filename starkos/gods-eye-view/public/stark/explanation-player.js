import { validateExplanation } from './explanation-contract.js';
import {
  drawSketch,
  drawFlow,
  drawTimeline,
  drawModel,
} from './visual-canvas.js';

/** The same state machine renders on phone, desktop and passive receivers. */
export function createExplanationPlayer(
  root,
  { onNarration = () => {}, onChange = () => {} } = {},
) {
  let explanation = null,
    sceneIndex = 0,
    windowIndex = 0,
    paused = false,
    visible = true,
    timer = null,
    closed = false;
  let visualDisposers = [];
  const disposeVisuals = () => {
    visualDisposers.forEach((dispose) => dispose());
    visualDisposers = [];
  };
  const narrow = {
    get matches() {
      return root.getBoundingClientRect().width < 1050;
    },
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  function cancel() {
    clearTimeout(timer);
    timer = null;
  }
  function schedule() {
    cancel();
    if (!explanation || paused || closed) return;
    const scene = explanation.scenes[sceneIndex];
    timer = setTimeout(
      () => advance(),
      Math.max(
        scene.seconds * 1000,
        scene.narration.length * 65,
        narrow.matches
          ? scene.windows[windowIndex].text.length * 45
          : Math.max(...scene.windows.map((w) => w.text.length)) * 35,
      ),
    );
  }
  function drawWindow(win) {
    const article = element('article', `explain-window explain-${win.kind}`);
    article.dataset.windowKind = win.kind;
    const bar = element('header', 'explain-window-bar');
    bar.append(
      element(
        'small',
        'explain-kind',
        {
          source: 'QUELLE',
          diagram: 'VERBINDUNGEN',
          drawing: 'ZEICHNUNG',
          model: '3D · SCHEMA',
          timeline: 'ZEITLINIE',
          calculation: 'RECHENWEG',
          note: 'EINORDNUNG',
        }[win.kind],
      ),
    );
    bar.append(
      element('span', 'explain-window-title', win.title),
      element('i', 'window-signal'),
    );
    article.append(bar);
    // Drag a window by its title bar on larger screens; phone swipes keep
    // their existing scene/window navigation semantics.
    let drag = null;
    bar.addEventListener('pointerdown', (event) => {
      if (narrow.matches || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      const rect = article.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rect };
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = Math.max(
        -drag.rect.left + 8,
        Math.min(innerWidth - drag.rect.right - 8, event.clientX - drag.x),
      );
      const dy = Math.max(
        -drag.rect.top + 8,
        Math.min(
          Math.max(0, innerHeight - drag.rect.bottom - 140),
          event.clientY - drag.y,
        ),
      );
      // Each drag starts from the current translated position.
      article.style.translate = `${(Number(article.dataset.dragX) || 0) + dx}px ${(Number(article.dataset.dragY) || 0) + dy}px`;
    });
    const endDrag = () => {
      if (!drag) return;
      const values = article.style.translate.split(' ').map(parseFloat);
      article.dataset.dragX = String(values[0] || 0);
      article.dataset.dragY = String(values[1] || 0);
      drag = null;
    };
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
    bar.addEventListener('lostpointercapture', endDrag);

    if (win.kind === 'drawing') article.append(drawSketch(win));
    if (win.kind === 'model') {
      const model = drawModel(win, {
        isPaused: () => paused || !visible || closed,
      });
      visualDisposers.push(model.dispose);
      article.append(model.node);
    }
    if (win.kind === 'timeline') article.append(drawTimeline(win));
    if (win.kind === 'diagram') article.append(drawFlow(win));
    const entries =
      win.kind === 'model'
        ? win.model.parts.map((part) => ({
            label: part.label,
            tone: part.tone,
          }))
        : win.kind === 'drawing'
          ? win.drawing.elements
              .filter((item) => item.text)
              .map((item) => ({ label: item.text, tone: item.tone }))
          : win.kind === 'diagram'
            ? win.nodes.map((label) => ({ label }))
            : win.kind === 'timeline'
              ? win.entries
              : [];
    if (entries.length) {
      const legend = element('ol', 'visual-legend');
      legend.setAttribute('aria-label', 'Beschriftungen der Darstellung');
      entries.forEach((entry, index) => {
        const item = element('li', 'visual-legend-item');
        item.dataset.tone = entry.tone || 'cyan';
        const copy = element('span', 'visual-legend-copy', entry.label);
        if (entry.detail) copy.append(element('small', '', entry.detail));
        item.append(
          element('span', 'visual-reference', String(index + 1)),
          copy,
        );
        legend.append(item);
      });
      article.append(legend);
    }
    const text = element(
      win.kind === 'source' ? 'blockquote' : 'p',
      'explain-text',
    );
    const start = win.highlight ? win.text.indexOf(win.highlight) : -1;
    if (start >= 0) {
      text.append(
        document.createTextNode(win.text.slice(0, start)),
        element('mark', '', win.highlight),
        document.createTextNode(win.text.slice(start + win.highlight.length)),
      );
    } else text.textContent = win.text;
    article.append(text);
    if (win.kind === 'source') {
      const link = element('a', 'explain-source', 'Originalquelle öffnen ↗');
      link.href = win.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      article.append(
        link,
        element('small', 'explain-attribution', win.attribution),
      );
    }
    return article;
  }
  function render(animate = false) {
    disposeVisuals();
    root.replaceChildren();
    root.hidden = !explanation || !visible || closed;
    if (!explanation || closed) {
      onChange({ closed: true });
      return;
    }
    root.classList.toggle('explain-enter', animate);
    root.classList.toggle('explain-paused', paused);
    const scene = explanation.scenes[sceneIndex];
    const header = element('header', 'explain-header');
    header.append(
      element('span', '', scene.title),
      element(
        'small',
        '',
        `${sceneIndex + 1}/${explanation.scenes.length}${narrow.matches ? ' · Fenster ' + (windowIndex + 1) + '/' + scene.windows.length : ''}${paused ? ' · angehalten' : ''}`,
      ),
    );
    const windows = element('div', 'explain-windows');
    windows.dataset.count = String(scene.windows.length);
    windows.classList.toggle(
      'has-visual',
      scene.windows.some((win) =>
        ['drawing', 'model', 'diagram'].includes(win.kind),
      ),
    );
    const shown = narrow.matches ? [scene.windows[windowIndex]] : scene.windows;
    shown.forEach((win) => windows.append(drawWindow(win)));
    const caption = element('p', 'explain-caption', scene.narration);
    caption.setAttribute('aria-live', 'polite');
    root.append(header, windows, caption);
    root.scrollTop = 0;
    onChange({ sceneIndex, windowIndex, paused, visible, title: scene.title });
  }
  function advance() {
    if (!explanation || closed) return;
    if (
      narrow.matches &&
      windowIndex < explanation.scenes[sceneIndex].windows.length - 1
    ) {
      windowIndex++;
      render(true);
      schedule();
      return;
    }
    if (sceneIndex < explanation.scenes.length - 1) {
      sceneIndex++;
      windowIndex = 0;
      render(true);
      onNarration(explanation.scenes[sceneIndex].narration);
      schedule();
    } else {
      closed = true;
      cancel();
      render();
      onChange({ closed: true });
    }
  }
  function control(command) {
    if (command === 'close') {
      closed = true;
      cancel();
      render();
      return;
    }
    if (command === 'pause') {
      paused = true;
      cancel();
    }
    if (command === 'resume') {
      paused = false;
      schedule();
    }
    if (command === 'next') {
      cancel();
      advance();
      return;
    }
    if (command === 'previous' && explanation) {
      closed = false;
      sceneIndex = Math.max(0, sceneIndex - 1);
      windowIndex = 0;
      render(true);
      onNarration(explanation.scenes[sceneIndex].narration);
      schedule();
      return;
    }
    if (command === 'pause' || command === 'resume') {
      root.classList.toggle('explain-paused', paused);
      const count = root.querySelector('.explain-header small');
      if (count && explanation)
        count.textContent = `${sceneIndex + 1}/${explanation.scenes.length}${narrow.matches ? ' · Fenster ' + (windowIndex + 1) + '/' + explanation.scenes[sceneIndex].windows.length : ''}${paused ? ' · angehalten' : ''}`;
      return;
    }
    render();
  }
  const onResize = () => {
    if (!explanation) return;
    windowIndex = Math.min(
      windowIndex,
      explanation.scenes[sceneIndex].windows.length - 1,
    );
    render();
    schedule();
  };
  let previousWidth = root.getBoundingClientRect().width;
  const observer = new ResizeObserver(() => {
    const width = root.getBoundingClientRect().width;
    if (width && width !== previousWidth) {
      previousWidth = width;
      onResize();
    }
  });
  observer.observe(root);
  const onHidden = () => {
    if (document.hidden) control('pause');
  };
  document.addEventListener('visibilitychange', onHidden);
  // Source reading pauses the scene rather than removing it behind the reader.
  root.addEventListener('click', (e) => {
    if (e.target.closest('a')) control('pause');
  });
  let down = null;
  root.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  root.addEventListener('pointerup', (e) => {
    if (
      down &&
      narrow.matches &&
      Math.abs(e.clientX - down.x) > 65 &&
      Math.abs(e.clientY - down.y) < 45
    )
      control(e.clientX < down.x ? 'next' : 'previous');
    down = null;
  });
  return {
    show(input) {
      explanation = validateExplanation(input);
      sceneIndex = 0;
      windowIndex = 0;
      paused = false;
      closed = false;
      render(true);
      onNarration(explanation.scenes[0].narration);
      schedule();
    },
    control,
    setVisible(value) {
      visible = value;
      if (!value) {
        cancel();
        paused = true;
      }
      render();
    },
    followNarration(text, index) {
      const caption = root.querySelector('.explain-caption');
      if (
        !caption?.firstChild ||
        caption.textContent !== text ||
        !Number.isFinite(index)
      )
        return;
      if (caption.scrollHeight <= caption.clientHeight) return;
      const offset = Math.max(0, Math.min(text.length - 1, index));
      const range = document.createRange();
      range.setStart(caption.firstChild, offset);
      range.setEnd(caption.firstChild, offset + 1);
      const word = range.getBoundingClientRect();
      caption.scrollTop += word.top - caption.getBoundingClientRect().top - 16;
    },
    getState() {
      return { explanation, sceneIndex, windowIndex, paused, closed };
    },
    destroy() {
      cancel();
      disposeVisuals();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onHidden);
      root.replaceChildren();
    },
  };
}
