// Locally rendered geometry. Model output supplies bounded data, never markup/code.
const NS = 'http://www.w3.org/2000/svg';
const color = (tone) =>
  ({ cyan: '#78ffe2', amber: '#ffcf7b', muted: '#89aeb9' })[tone] || '#78ffe2';
export function svgElement(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
function canvas(title) {
  const svg = svgElement('svg', {
    viewBox: '0 0 600 440',
    role: 'img',
    'aria-label': title,
    class: 'ink-canvas',
  });
  svg.append(svgElement('title', {}, title));
  return svg;
}
function path(svg, d, index, tone = 'cyan') {
  const node = svgElement('path', {
    d,
    fill: 'none',
    stroke: color(tone),
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    pathLength: 1,
    class: 'ink-stroke',
  });
  node.style.setProperty('--ink-delay', `${Math.min(index * 0.14, 3)}s`);
  svg.append(node);
  return node;
}
function label(
  svg,
  text,
  x,
  y,
  { anchor = 'start', tone = 'cyan', width = 28, className = 'ink-label' } = {},
) {
  const node = svgElement('text', {
    x,
    y,
    fill: color(tone),
    'text-anchor': anchor,
    class: className,
  });
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = '';
    }
    line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  lines
    .slice(0, 5)
    .forEach((value, i) =>
      node.append(svgElement('tspan', { x, dy: i ? '1.2em' : 0 }, value)),
    );
  svg.append(node);
  return node;
}
function arrowHead(svg, points, index, tone) {
  const end = points.at(-1),
    prev = points.at(-2);
  const angle = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  const points2 = [-0.5, 0.5].map((a) => [
    end[0] - 12 * Math.cos(angle + a),
    end[1] - 12 * Math.sin(angle + a),
  ]);
  path(svg, `M${points2[0]} L${end} L${points2[1]}`, index, tone);
}
export function drawSketch(win) {
  const svg = canvas(win.title);
  let annotation = 0;
  win.drawing.elements.forEach((item, index) => {
    const x = item.x * 6,
      y = item.y * 4.4,
      w = item.width * 6,
      h = item.height * 4.4;
    let d;
    if (item.kind === 'rect') d = `M${x},${y} h${w} v${h} h${-w} Z`;
    if (item.kind === 'ellipse')
      d = `M${x},${y + h / 2} a${w / 2},${h / 2} 0 1,0 ${w},0 a${w / 2},${h / 2} 0 1,0 ${-w},0`;
    if (item.kind === 'stroke' || item.kind === 'arrow') {
      const points = item.points.map(([px, py]) => [px * 6, py * 4.4]);
      d = points.map((point, i) => `${i ? 'L' : 'M'}${point}`).join(' ');
      if (item.kind === 'arrow') arrowHead(svg, points, index, item.tone);
    }
    if (d) path(svg, d, index, item.tone);
    if (item.text) {
      const isShape = ['rect', 'ellipse'].includes(item.kind);
      // Stroke annotations belong in separate labels with explicit positions.
      if (item.kind === 'label' || isShape) {
        annotation++;
        label(
          svg,
          String(annotation),
          isShape ? x + w / 2 : x,
          isShape ? y + h / 2 : y,
          {
            anchor: isShape ? 'middle' : 'start',
            className: 'ink-reference',
            tone: item.tone,
          },
        );
        label(
          svg,
          item.text,
          isShape ? x + w / 2 : x,
          isShape ? y + h / 2 : y,
          { anchor: isShape ? 'middle' : 'start', tone: item.tone },
        );
      }
    }
  });
  return svg;
}
export function drawFlow(win) {
  const svg = canvas(win.title);
  const count = win.nodes.length;
  const positions = win.nodes.map((_, i) =>
    count <= 3
      ? [100 + i * 195, i % 2 ? 250 : 115]
      : [i % 2 ? 395 : 95, 70 + Math.floor(i / 2) * 135],
  );
  positions.forEach((point, i) => {
    if (i) {
      const prev = positions[i - 1];
      const start = [prev[0] + 24, prev[1]],
        end = [point[0] - 24, point[1]];
      path(
        svg,
        `M${start} C${(start[0] + end[0]) / 2},${start[1]} ${(start[0] + end[0]) / 2},${end[1]} ${end}`,
        i,
      );
      arrowHead(svg, [[end[0] - 20, end[1]], end], i, 'cyan');
    }
    const group = svgElement('g', { class: 'explain-node' });
    group.append(
      svgElement('circle', {
        cx: point[0],
        cy: point[1],
        r: 20,
        class: 'ink-orbit',
      }),
    );
    group.append(
      svgElement(
        'text',
        {
          x: point[0],
          y: point[1] + 6,
          'text-anchor': 'middle',
          class: 'ink-number',
        },
        String(i + 1).padStart(2, '0'),
      ),
    );
    label(group, win.nodes[i], point[0] - 55, point[1] + 45, {
      width: count <= 3 ? 17 : 25,
    });
    svg.append(group);
  });
  return svg;
}
export function drawTimeline(win) {
  const svg = canvas(win.title);
  path(svg, 'M54,30 L54,410', 0);
  win.entries.forEach((entry, i) => {
    const y = 50 + i * (330 / Math.max(1, win.entries.length - 1));
    svg.append(
      svgElement('circle', { cx: 54, cy: y, r: 6, class: 'ink-orbit' }),
    );
    label(svg, String(i + 1), 80, y - 5, { className: 'ink-reference' });
    label(svg, entry.label, 80, y - 5, { width: 36 });
    label(svg, entry.detail, 80, y + 23, {
      width: 42,
      tone: 'muted',
      className: 'ink-detail',
    });
  });
  return svg;
}
// Wire geometry in object coordinates; a single perspective projection animates
// all parts together, with separate readable labels anchored around the object.
export function modelSegments(part) {
  const w = part.width / 2,
    h = part.height / 2,
    d = part.depth / 2;
  const lines = [];
  const circle = (radiusX, radiusZ, y) =>
    Array.from({ length: 33 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return [Math.cos(a) * radiusX, y, Math.sin(a) * radiusZ];
    });
  if (part.shape === 'box') {
    const vertices = [
      [-w, -h, -d],
      [w, -h, -d],
      [w, h, -d],
      [-w, h, -d],
      [-w, -h, d],
      [w, -h, d],
      [w, h, d],
      [-w, h, d],
    ];
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ])
      lines.push([vertices[a], vertices[b]]);
  } else if (part.shape === 'cylinder') {
    lines.push(circle(w, d, -h), circle(w, d, h));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      lines.push([
        [Math.cos(a) * w, -h, Math.sin(a) * d],
        [Math.cos(a) * w, h, Math.sin(a) * d],
      ]);
    }
  } else if (part.shape === 'sphere') {
    for (const latitude of [-0.7, 0, 0.7]) {
      const radius = Math.sqrt(1 - latitude * latitude);
      lines.push(circle(w * radius, d * radius, h * latitude));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 6;
      lines.push(
        Array.from({ length: 33 }, (_, j) => {
          const b = (j / 32) * Math.PI * 2;
          return [
            w * Math.cos(b) * Math.cos(a),
            h * Math.sin(b),
            d * Math.cos(b) * Math.sin(a),
          ];
        }),
      );
    }
  } else if (part.shape === 'ring') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 4) * Math.PI * 2;
      lines.push(
        circle(
          w * (0.78 + 0.18 * Math.cos(a)),
          d * (0.78 + 0.18 * Math.cos(a)),
          h * Math.sin(a),
        ),
      );
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      lines.push(
        Array.from({ length: 17 }, (_, j) => {
          const b = (j / 16) * Math.PI * 2;
          return [
            w * (0.78 + 0.18 * Math.cos(b)) * Math.cos(a),
            h * Math.sin(b),
            d * (0.78 + 0.18 * Math.cos(b)) * Math.sin(a),
          ];
        }),
      );
    }
  }
  return lines.map((line) =>
    line.map(([x, y, z]) => [x + part.x, y + part.y, z + part.z]),
  );
}
export function drawModel(win, { isPaused = () => false } = {}) {
  const svg = canvas(win.title);
  svg.classList.add('ink-model');
  const parts = win.model.parts;
  const extent = Math.max(
    25,
    ...parts.flatMap((p) => [
      Math.abs(p.x) + p.width / 2,
      Math.abs(p.y) + p.height / 2,
      Math.abs(p.z) + p.depth / 2,
    ]),
  );
  const scale = 190 / extent;
  const ground = svgElement('ellipse', {
    cx: 300,
    cy: 290,
    rx: 155,
    ry: 42,
    class: 'model-ground',
  });
  svg.append(ground);
  const geometries = parts.map((p, i) => ({
    part: p,
    lines: modelSegments(p),
    node: path(svg, '', i, p.tone),
    leader: path(svg, '', i, p.tone),
  }));
  const labelTargets = parts.map((p, i) => {
    const left = i % 2 === 0,
      y =
        40 +
        Math.floor(i / 2) * Math.min(95, 320 / Math.ceil(parts.length / 2));
    label(svg, String(i + 1), left ? 18 : 582, y, {
      anchor: left ? 'start' : 'end',
      className: 'ink-reference',
      tone: p.tone,
    });
    label(svg, p.label, left ? 18 : 582, y, {
      anchor: left ? 'start' : 'end',
      width: 22,
      tone: p.tone,
    });
    return [left ? 35 : 565, y + 10];
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let angle = 0.55,
    frame = null,
    last = null,
    disposed = false;
  function project([x, y, z]) {
    const rx = x * Math.cos(angle) + z * Math.sin(angle),
      rz = -x * Math.sin(angle) + z * Math.cos(angle);
    const ry = y * 0.84 - rz * 0.4,
      depth = y * 0.4 + rz * 0.84;
    const perspective = 700 / (700 + depth * scale);
    return [300 + rx * scale * perspective, 245 + ry * scale * perspective];
  }
  function draw(time) {
    if (disposed) return;
    if (last !== null && isPaused()) {
      last = time;
      if (!document.hidden) frame = requestAnimationFrame(draw);
      return;
    }
    if (last !== null && !isPaused() && !reduced.matches)
      angle += Math.min(time - last, 50) * 0.00019;
    last = time;
    geometries.forEach((g, i) => {
      const d = g.lines
        .map((line) =>
          line
            .map(
              (p, j) =>
                `${j ? 'L' : 'M'}${project(p)
                  .map((v) => v.toFixed(1))
                  .join(',')}`,
            )
            .join(' '),
        )
        .join(' ');
      g.node.setAttribute('d', d);
      const from = project([g.part.x, g.part.y, g.part.z]);
      const to = labelTargets[i];
      g.leader.setAttribute('d', `M${from} L${to[0]},${from[1]} L${to}`);
      g.leader.classList.add('model-leader');
    });
    if (!reduced.matches && !document.hidden)
      frame = requestAnimationFrame(draw);
  }
  const resume = () => {
    if (!document.hidden && !disposed) {
      cancelAnimationFrame(frame);
      last = null;
      frame = requestAnimationFrame(draw);
    }
  };
  document.addEventListener('visibilitychange', resume);
  draw(0);
  return {
    node: svg,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', resume);
    },
  };
}
