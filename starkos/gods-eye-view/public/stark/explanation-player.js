import { validateExplanation } from './explanation-contract.js';

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
  const narrow = matchMedia('(max-width: 700px)');
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
    const article = element('article', 'explain-window');
    article.append(
      element(
        'small',
        'explain-kind',
        {
          source: 'QUELLE',
          diagram: 'ZUSAMMENHANG',
          calculation: 'RECHENWEG',
          note: 'EINORDNUNG',
        }[win.kind],
      ),
    );
    article.append(element('h3', '', win.title));
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
    if (win.kind === 'diagram') {
      const diagram = element('div', 'explain-flow');
      diagram.setAttribute('aria-label', 'Zusammenhang in Leserichtung');
      win.nodes.forEach((label, i) => {
        if (i) {
          const arrow = element('div', 'explain-arrow', '↓');
          arrow.setAttribute('aria-hidden', 'true');
          diagram.append(arrow);
        }
        diagram.append(element('div', 'explain-node', label));
      });
      article.append(diagram);
    }
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
    root.replaceChildren();
    root.hidden = !explanation || !visible || closed;
    if (!explanation || closed) {
      onChange({ closed: true });
      return;
    }
    root.classList.toggle('explain-enter', animate);
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
    const shown = narrow.matches ? [scene.windows[windowIndex]] : scene.windows;
    shown.forEach((win) => windows.append(drawWindow(win)));
    root.append(header, windows);
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
  narrow.addEventListener('change', onResize);
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
    getState() {
      return { explanation, sceneIndex, windowIndex, paused, closed };
    },
    destroy() {
      cancel();
      narrow.removeEventListener('change', onResize);
      document.removeEventListener('visibilitychange', onHidden);
      root.replaceChildren();
    },
  };
}
