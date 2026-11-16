// AGPL-3.0. STARK browser host for Roamies' unchanged mark vocabulary.
(() => {
  const R = window.Roamie;
  let frozenAt = null,
    clockOffset = 0;
  R.clock = () => (frozenAt ?? performance.now()) / 1000 - clockOffset;
  const send = (message) =>
    parent.postMessage(
      { channel: 'stark-roamies', ...message },
      location.origin,
    );
  let token = 0,
    currentId = null,
    paused = false,
    actions = new Map();
  const cursor = document.createElement('canvas');
  cursor.width = 64;
  cursor.height = 64;
  Object.assign(cursor.style, {
    position: 'fixed',
    width: '48px',
    height: '48px',
    pointerEvents: 'none',
    zIndex: '8',
    display: 'none',
  });
  document.body.append(cursor);
  const cc = cursor.getContext('2d');
  const pen = {
    held: false,
    tip: [0, 0],
    speed: 1,
    take() {
      this.held = true;
      cursor.style.display = '';
    },
    release() {
      this.held = false;
      cursor.style.display = 'none';
    },
    move(x, y) {
      this.tip = [x, y];
      paint();
    },
    rest(x, y) {
      this.move(x, y);
    },
    tap(x, y) {
      this.move(x, y);
    },
    park() {},
    async trace(points, seconds, update) {
      const start = R.clock(),
        gen = token;
      while (gen === token) {
        while (paused && gen === token)
          await new Promise((r) => setTimeout(r, 50));
        const u = matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 1
          : Math.min(1, (R.clock() - start) / (seconds / this.speed));
        const at = Math.min(
          points.length - 1,
          Math.floor(u * (points.length - 1)),
        );
        this.move(...points[at]);
        update(u);
        if (u === 1) break;
        await new Promise(requestAnimationFrame);
      }
    },
  };
  function paint() {
    cc.clearRect(0, 0, 64, 64);
    const colors = ['#051214', '#0e5c60', '#28c4b8', '#78ffe2', '#e6fffa'];
    R.jarvis.cursor(
      {
        L: 4,
        put(x, y, l) {
          cc.fillStyle = colors[Math.max(0, Math.min(4, l))];
          cc.fillRect(Math.round(x) * 2, Math.round(y) * 2, 2, 2);
        },
      },
      16,
      16,
      16,
      16,
      {
        t: performance.now() / 1000,
        dt: 0.016,
        mode: 'think',
        open: 1,
        sleepy: 0,
      },
    );
    cursor.style.transform = `translate(${pen.tip[0] - 24}px,${pen.tip[1] - 24}px)`;
  }
  R.tiles = [{ creature: { agent: { pen } } }];
  R.onCard = (size) => send({ type: 'layout', ...size });
  R.onBeat = (b) =>
    send({
      type: 'narration',
      id: currentId,
      text: b.caption || b.say || '',
      beat: b.n,
    });
  R.ink.send = (event) => {
    if (event.type === 'ink_action') {
      const action = actions.get(event.part);
      if (action?.do === 'open')
        window.open(action.value, '_blank', 'noopener,noreferrer');
      else if (action?.do === 'copy')
        navigator.clipboard?.writeText(action.value).catch(() =>
          send({
            type: 'error',
            message: 'Kopieren ist in diesem Browser nicht verfügbar.',
          }),
        );
      else if (action?.do === 'ask')
        send({ type: 'question', text: action.value });
    }
    send({ type: 'event', event });
  };
  function target(t, reference) {
    if (!t) return null;
    if (t.text) {
      const hits = textHits(t, reference);
      if (!hits.length)
        throw new Error(
          'Text ist in der Darstellung nicht sichtbar: ' + t.text,
        );
      send({ type: 'focus', rect: hits[0] });
      return { rect: hits[0] };
    }
    if (t.rect) return t;
    if (Number.isFinite(t.x) && Number.isFinite(t.y)) {
      const sx = innerWidth / reference.width,
        sy = innerHeight / reference.height;
      return {
        rect: [
          (t.x - (t.w || 28) / 2) * sx,
          (t.y - (t.h || 28) / 2) * sy,
          (t.w || 28) * sx,
          (t.h || 28) * sy,
        ],
      };
    }
    throw new Error(
      'Dieses Ziel benötigt eine sichtbare Textstelle oder Koordinaten in STARK.',
    );
  }
  function textHits(t, reference) {
    const hits = R.ink.textBounds(t.text);
    if (!t.within) return hits;
    const box = t.within,
      sx = innerWidth / reference.width,
      sy = innerHeight / reference.height;
    return hits.filter(
      ([x, y, w, h]) =>
        x + w / 2 >= (box.x - box.w / 2) * sx &&
        x + w / 2 <= (box.x + box.w / 2) * sx &&
        y + h / 2 >= (box.y - box.h / 2) * sy &&
        y + h / 2 <= (box.y + box.h / 2) * sy,
    );
  }
  function expandMark(input, reference) {
    if (input.at?.text && input.at.every) {
      const hits = textHits(input.at, reference);
      if (!hits.length)
        throw new Error('Text ist nicht sichtbar: ' + input.at.text);
      return hits.map((rect) => mark({ ...input, at: { rect } }, reference));
    }
    return [mark(input, reference)];
  }
  function mark(input, reference) {
    const m = structuredClone(input);
    for (const key of ['at', 'to', 'tie'])
      if (m[key]) m[key] = target(m[key], reference);
    if (m.points)
      m.points = m.points.map(([x, y]) => [
        (x / reference.width) * innerWidth,
        (y / reference.height) * innerHeight,
      ]);
    if (
      m._starkOffset &&
      ![
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
      ].includes(m.kind)
    ) {
      const [dx, dy] = m._starkOffset;
      for (const target of [m.at, m.to, m.tie])
        if (target?.rect) {
          target.rect[0] += dx;
          target.rect[1] += dy;
        }
      if (m.points) m.points = m.points.map(([x, y]) => [x + dx, y + dy]);
    }
    return m;
  }
  addEventListener('message', async (e) => {
    if (
      e.source !== parent ||
      e.origin !== location.origin ||
      e.data?.channel !== 'stark-roamies'
    )
      return;
    const data = e.data;
    if (data.type === 'pan-mode') {
      wide = !!data.wide;
      return;
    }
    if (data.type === 'pause') {
      if (frozenAt === null) frozenAt = performance.now();
      paused = true;
      return;
    }
    if (data.type === 'resume') {
      if (frozenAt !== null) {
        clockOffset += (performance.now() - frozenAt) / 1000;
        frozenAt = null;
      }
      paused = false;
      return;
    }
    if (data.type === 'stop') {
      token++;
      R.ink.clear({ all: true, stop: true });
      pen.release();
      return;
    }
    if (data.type === 'edit') {
      R.ink.play({
        id: currentId,
        seg: 0,
        beats: [],
        edits: data.edits,
        last: true,
      });
      return;
    }
    if (data.type !== 'show' && data.type !== 'append') return;
    if (frozenAt !== null) {
      clockOffset += (performance.now() - frozenAt) / 1000;
      frozenAt = null;
    }
    paused = false;
    const gen = ++token;
    if (data.type === 'show') R.ink.clear({ all: true, stop: true });
    if (data.type === 'append') {
      const live = new Set(R.ink.snapshot().map((m) => m.part));
      for (const edit of data.edits || [])
        if (edit.do !== 'clear' && !live.has(edit.part)) {
          send({
            type: 'error',
            message: 'Der Zeichnungsteil ist hier nicht sichtbar: ' + edit.part,
          });
          return;
        }
    }
    R.phone = !!data.phone;
    wide = !!data.wide;
    document.body.dataset.phone = String(R.phone);
    currentId = data.id;
    actions = new Map(
      data.beats.flatMap((b) =>
        b.marks.filter((m) => m.action).map((m) => [m.part, m.action]),
      ),
    );
    try {
      for (const [i, b] of data.beats.entries()) {
        if (gen !== token) break;
        const until = R.clock() + 10;
        for (const input of b.marks)
          for (const key of ['at', 'to', 'tie'])
            if (input[key]?.text) {
              while (
                gen === token &&
                !textHits(
                  input[key],
                  data.reference || { width: 1000, height: 1000 },
                ).length &&
                R.clock() < until
              )
                await new Promise((r) => setTimeout(r, 50));
            }
        if (gen !== token) break;
        const beat = {
          ...b,
          marks: b.marks.flatMap((m) =>
            expandMark(m, data.reference || { width: 1000, height: 1000 }),
          ),
          voiced: false,
        };
        R.ink.play({
          id: data.id,
          seg: i,
          beats: [beat],
          edits: i ? [] : data.edits || [],
          last: true,
          deep: data.deep,
        });
        await R.ink.whenIdle();
      }
      if (gen === token) send({ type: 'done', id: data.id });
    } catch (error) {
      send({ type: 'error', message: error.message });
    }
  });
  let start = null,
    lastPoint = [0, 0],
    lastScreen = [0, 0],
    wide = false,
    panned = false;
  addEventListener(
    'pointermove',
    (e) => {
      R.ink.ptr(e.clientX, e.clientY);
      if (
        start &&
        wide &&
        R.phone &&
        R.ink.hitKind(e.clientX, e.clientY) === 'card' &&
        Math.abs(e.screenX - start[0]) > Math.abs(e.screenY - start[1]) + 8
      ) {
        send({ type: 'pan', dx: lastScreen[0] - e.screenX });
        panned = true;
      }
      lastPoint = [e.clientX, e.clientY];
      lastScreen = [e.screenX, e.screenY];
    },
    true,
  );
  setInterval(() => {
    if (R.ink.playing) R.ink.ptr(...lastPoint);
  }, 100);
  addEventListener(
    'pointerdown',
    (e) => {
      if (
        !R.inkHit(e.clientX, e.clientY) ||
        R.ink.hitKind(e.clientX, e.clientY) === 'card'
      )
        start = [e.screenX, e.screenY];
      lastPoint = [e.clientX, e.clientY];
      lastScreen = [e.screenX, e.screenY];
      panned = false;
      R.ink.click(e.clientX, e.clientY);
    },
    true,
  );
  addEventListener(
    'pointerup',
    (e) => {
      if (
        start &&
        !panned &&
        Math.abs(e.screenX - start[0]) > 65 &&
        Math.abs(e.screenY - start[1]) < 45
      )
        send({
          type: 'navigate',
          direction: e.screenX < start[0] ? 'next' : 'previous',
        });
      start = null;
    },
    true,
  );
  send({ type: 'ready' });
})();
