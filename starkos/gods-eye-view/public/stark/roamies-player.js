// AGPL-3.0. Mobile/desktop host for the original Roamies Ink renderer.
const CARDS = new Set([
  'card',
  'note',
  'list',
  'mindmap',
  'clip',
  'sources',
  'photo',
  'graph',
  'legend',
  'timeline',
  'molecule',
  'model',
  'flow',
  'table',
  'bars',
  'map',
  'math',
  'geometry',
  'quiz',
  'ticket',
  'medal',
]);
export function createRoamiesPlayer(
  root,
  { onNarration = () => {}, onChange = () => {}, onError = () => {} } = {},
) {
  let drawing = null,
    pages = [],
    index = 0,
    frame = null,
    ready = false,
    paused = false,
    timer = null,
    pageDone = false,
    spokenKey = null,
    hidden = false;
  const shell = document.createElement('section');
  shell.className = 'roamies-workspace';
  const viewport = document.createElement('div');
  viewport.className = 'roamies-viewport';
  const caption = document.createElement('p');
  caption.className = 'roamies-narration';
  caption.setAttribute('aria-live', 'polite');
  const sources = document.createElement('nav');
  sources.className = 'roamies-sources';
  sources.setAttribute('aria-label', 'Originalquellen');
  const position = document.createElement('output');
  position.className = 'roamies-position';
  position.setAttribute('aria-label', 'Zeichnungsschritt');
  const readable = document.createElement('div');
  readable.className = 'visually-hidden';
  readable.setAttribute('aria-label', 'Inhalt der Zeichnung');
  shell.append(viewport, position, sources, caption, readable);
  const mobile = () => root.getBoundingClientRect().width < 1050;
  const post = (data) =>
    frame?.contentWindow?.postMessage(
      { channel: 'stark-roamies', ...data },
      location.origin,
    );
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  function split(input) {
    if (!mobile()) return [input.beats];
    const result = [];
    for (const beat of input.beats) {
      const cards = beat.marks.filter((m) => CARDS.has(m.kind)),
        marks = beat.marks.filter((m) => !CARDS.has(m.kind));
      if (!cards.length && result.length) {
        result.at(-1).push(beat);
        continue;
      }
      if (cards.length > 1)
        cards.forEach((card, i) =>
          result.push([
            {
              ...beat,
              say: i ? card.title || card.heading || beat.say : beat.say,
              caption: i
                ? card.title || card.heading || beat.caption
                : beat.caption,
              marks: [card, ...(i ? [] : marks)],
            },
          ]),
        );
      else result.push([beat]);
    }
    return result.length ? result : [[]];
  }
  function render() {
    cancel();
    pageDone = false;
    ready = false;
    viewport.replaceChildren();
    root.replaceChildren(shell);
    root.hidden = hidden;
    root.classList.add('roamies-active');
    frame = document.createElement('iframe');
    frame.className = 'roamies-frame';
    frame.title = 'Roamies – gezeichnete Erklärung';
    frame.src = new URL('./roamies/frame.html', import.meta.url).href;
    frame.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-popups',
    );
    const marks = pages[index]?.flatMap((b) => b.marks) || [];
    // Wide technical structures remain readable at native text scale and can be panned;
    // ordinary cards reflow into the phone's width in the upstream renderer adapter.
    const wide = marks.some((m) =>
      ['mindmap', 'table', 'flow', 'geometry'].includes(m.kind),
    );
    if (mobile() && wide) frame.dataset.wide = 'true';
    viewport.append(frame);
    metadata();
  }
  function metadata() {
    const marks = pages[index]?.flatMap((b) => b.marks) || [];
    position.textContent =
      pages.length > 1 ? `${index + 1} / ${pages.length}` : '';
    caption.hidden = !mobile();
    caption.textContent = pages[index]?.[0]?.caption || '';
    sources.replaceChildren();
    for (const source of marks.flatMap((m) =>
      m.kind === 'clip' && m.url
        ? [{ name: m.title, url: m.url }]
        : m.sources || [],
    )) {
      const link = document.createElement('a');
      link.textContent = source.name;
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      sources.append(link);
    }
    sources.hidden = !sources.childElementCount;
    readable.textContent = marks
      .map((m) =>
        [m.title, m.heading, m.text, ...(m.items || [])]
          .filter(Boolean)
          .join(' · '),
      )
      .join('\n');
    onChange({
      closed: false,
      visible: !hidden,
      sceneIndex: index,
      roamies: true,
    });
  }

  function move(direction) {
    cancel();
    if (direction === 'next' && index < pages.length - 1) {
      index++;
      render();
    } else if (direction === 'previous' && index > 0) {
      index--;
      render();
    }
  }
  function message(e) {
    if (
      e.source !== frame?.contentWindow ||
      e.origin !== location.origin ||
      e.data?.channel !== 'stark-roamies'
    )
      return;
    const data = e.data;
    if (data.type === 'ready') {
      ready = true;
      post({
        type: 'show',
        ...drawing,
        beats: pages[index],
        phone: mobile(),
        wide: frame.dataset.wide === 'true',
      });
    }
    if (data.type === 'narration') {
      caption.textContent = data.text;
      const key = [data.id, index, data.beat, data.text].join(':');
      if (key !== spokenKey && !paused && !hidden) {
        spokenKey = key;
        onNarration(data.text);
      }
    }
    if (data.type === 'question')
      root.dispatchEvent(
        new CustomEvent('roamies-question', {
          bubbles: true,
          detail: data.text,
        }),
      );
    if (data.type === 'layout' && mobile() && Number.isFinite(data.width)) {
      const width = Math.min(
        4000,
        Math.max(viewport.clientWidth, Math.ceil(data.width)),
      );
      if (width > viewport.clientWidth + 1) {
        frame.style.minWidth = width + 'px';
        frame.dataset.wide = 'true';
        post({ type: 'pan-mode', wide: true });
      }
    }
    if (data.type === 'focus' && Array.isArray(data.rect)) {
      const [x, , w] = data.rect;
      if (
        x < viewport.scrollLeft + 8 ||
        x + w > viewport.scrollLeft + viewport.clientWidth - 8
      )
        viewport.scrollLeft = Math.max(0, x - 16);
    }
    if (data.type === 'pan') viewport.scrollLeft += data.dx;
    if (data.type === 'navigate') move(data.direction);
    if (data.type === 'error') {
      caption.textContent = data.message;
      onError(data.message);
    }
    if (data.type === 'done') pageDone = true;
    if (
      data.type === 'done' &&
      !paused &&
      mobile() &&
      index < pages.length - 1
    ) {
      const text = pages[index].map((b) => b.caption || b.say || '').join(' ');
      const reading = pages[index]
        .flatMap((b) => b.marks)
        .map((m) =>
          [m.text, ...(m.items || []), ...(m.rows || []).flat()]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ');
      timer = setTimeout(
        () => move('next'),
        Math.max(8000, text.length * 65, reading.length * 45),
      );
    }
    if (
      data.type === 'event' &&
      ['ink_pinned', 'ink_closed', 'ink_cleared'].includes(data.event?.type)
    )
      root.dispatchEvent(
        new CustomEvent('roamies-feedback', {
          bubbles: true,
          detail: { drawingId: drawing.id, event: data.event },
        }),
      );
    if (
      data.type === 'event' &&
      data.event?.type === 'card_image' &&
      typeof data.event.data === 'string' &&
      data.event.data.length < 12000000 &&
      /^[A-Za-z0-9+/=]+$/.test(data.event.data)
    ) {
      const link = document.createElement('a');
      link.href = 'data:image/png;base64,' + data.event.data;
      link.download =
        String(data.event.title || 'Roamies')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 60) + '.png';
      link.click();
    }
    if (data.type === 'event' && data.event?.type === 'open_link') {
      // Explicit user click only; source URLs have already passed server validation.
      const url = new URL(data.event.url);
      if (url.protocol === 'https:' && !url.username && !url.password)
        window.open(url.href, '_blank', 'noopener,noreferrer');
    }
  }
  addEventListener('message', message);
  const keyboard = (e) => {
    if (e.key === 'ArrowRight') move('next');
    if (e.key === 'ArrowLeft') move('previous');
  };
  shell.addEventListener('keydown', keyboard);
  shell.tabIndex = 0;
  let previousMobile = mobile(),
    previousBox = root.getBoundingClientRect();
  const observer = new ResizeObserver(() => {
    const box = root.getBoundingClientRect();
    if (!drawing || (!box.width && !box.height)) return;
    if (!ready) {
      previousBox = box;
      return;
    }
    if (
      Math.abs(box.width - previousBox.width) < 1 &&
      Math.abs(box.height - previousBox.height) < 1
    )
      return;
    previousBox = box;
    if (!previousMobile && !mobile()) return;
    if (previousMobile !== mobile()) {
      previousMobile = mobile();
      pages = split(drawing);
      index = Math.min(index, pages.length - 1);
    }
    render();
  });
  observer.observe(root);
  return {
    show(input) {
      hidden = false;
      root.hidden = false;
      if (!input || !Array.isArray(input.beats))
        throw new Error('Zeichnungsdaten fehlen.');
      paused = false;
      post({ type: 'resume' });
      if (input.edits?.length && drawing && frame && ready) {
        for (const edit of input.edits) {
          if (edit.do === 'clear') drawing.beats = [];
          for (const beat of drawing.beats) {
            if (edit.do === 'erase')
              beat.marks = beat.marks.filter((m) => m.part !== edit.part);
            for (const mark of beat.marks)
              if (mark.part === edit.part) {
                if (edit.do === 'recolor') mark.tone = edit.tone;
                if (edit.do === 'move')
                  mark._starkOffset = [
                    (mark._starkOffset?.[0] || 0) + (edit.dx || 0),
                    (mark._starkOffset?.[1] || 0) + (edit.dy || 0),
                  ];
              }
          }
        }
        if (input.beats?.length)
          drawing.beats.push(...structuredClone(input.beats));
        pages = split(drawing);
        index = Math.min(index, pages.length - 1);
        post({
          type: 'append',
          ...input,
          phone: mobile(),
          wide: frame.dataset.wide === 'true',
        });
        return;
      }
      if (!mobile() && drawing && frame && ready) {
        drawing = structuredClone(input);
        pages = split(drawing);
        index = 0;
        paused = false;
        metadata();
        post({ type: 'show', ...drawing, beats: pages[0], phone: false });
        return;
      }
      drawing = structuredClone(input);
      pages = split(drawing);
      index = 0;
      paused = false;
      render();
    },
    control(command) {
      if (command === 'close') {
        cancel();
        post({ type: 'stop' });
        root.hidden = true;
        onChange({ closed: true, roamies: true });
        return;
      }
      if (command === 'pause') {
        paused = true;
        post({ type: 'pause' });
        cancel();
      }
      if (command === 'resume') {
        paused = false;
        post({ type: 'resume' });
        if (pageDone && index < pages.length - 1)
          timer = setTimeout(() => move('next'), 8000);
      }
      if (['next', 'previous'].includes(command)) move(command);
    },
    setVisible(value) {
      hidden = !value;
      root.hidden = hidden;
      if (hidden) {
        paused = true;
        cancel();
      }
    },
    followNarration() {},
    getState() {
      return { drawing, index, paused, roamies: true };
    },
    destroy() {
      cancel();
      post({ type: 'stop' });
      removeEventListener('message', message);
      observer.disconnect();
      root.classList.remove('roamies-active');
      root.replaceChildren();
    },
  };
}
