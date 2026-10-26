const TAU = Math.PI * 2;

export class InertialRing {
  constructor(element, items, onSelect) {
    this.element = element;
    this.items = items;
    this.onSelect = onSelect;
    this.angle = 0;
    this.velocity = 0;
    this.pointer = null;
    this.last = 0;
    this.lastTime = 0;
    this.raf = 0;
    this.nodes = items.map((item, index) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'ring-item';
      node.innerHTML = `<span>${item.glyph}</span><strong>${item.title}</strong><small>${String(index + 1).padStart(2, '0')}</small>`;
      node.addEventListener('click', () => this.snapTo(index));
      element.append(node);
      return node;
    });
    element.addEventListener('pointerdown', (event) => this.down(event));
    element.addEventListener('pointermove', (event) => this.move(event));
    element.addEventListener('pointerup', (event) => this.up(event));
    element.addEventListener('pointercancel', (event) => this.up(event));
    this.render(true);
  }

  pointAngle(event) {
    const box = this.element.getBoundingClientRect();
    return Math.atan2(
      event.clientY - box.top - box.height / 2,
      event.clientX - box.left - box.width / 2,
    );
  }

  down(event) {
    this.stop();
    this.pointer = event.pointerId;
    this.last = this.pointAngle(event);
    this.lastTime = performance.now();
    this.velocity = 0;
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('dragging');
  }

  move(event) {
    if (event.pointerId !== this.pointer) return;
    const now = performance.now();
    const next = this.pointAngle(event);
    let delta = next - this.last;
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    this.angle += delta;
    this.velocity = (delta / Math.max(8, now - this.lastTime)) * 16;
    this.last = next;
    this.lastTime = now;
    this.render();
  }

  up(event) {
    if (event.pointerId !== this.pointer) return;
    this.pointer = null;
    this.element.classList.remove('dragging');
    this.coast();
  }

  coast() {
    const tick = () => {
      this.angle += this.velocity;
      this.velocity *= 0.935;
      this.render();
      if (Math.abs(this.velocity) > 0.0025)
        this.raf = requestAnimationFrame(tick);
      else this.snapTo(this.nearestIndex());
    };
    this.raf = requestAnimationFrame(tick);
  }

  nearestIndex() {
    const step = TAU / this.items.length;
    return (
      ((Math.round(-this.angle / step) % this.items.length) +
        this.items.length) %
      this.items.length
    );
  }

  snapTo(index) {
    this.stop();
    const step = TAU / this.items.length;
    const target = -index * step;
    const turns = Math.round((this.angle - target) / TAU);
    const from = this.angle;
    const to = target + turns * TAU;
    const start = performance.now();
    const animate = (now) => {
      const t = Math.min(1, (now - start) / 420);
      const ease = 1 - Math.pow(1 - t, 4);
      this.angle = from + (to - from) * ease;
      this.render();
      if (t < 1) this.raf = requestAnimationFrame(animate);
    };
    this.raf = requestAnimationFrame(animate);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  render(initial = false) {
    const step = TAU / this.items.length;
    const selected = this.nearestIndex();
    this.nodes.forEach((node, index) => {
      const theta = this.angle + index * step - Math.PI / 2;
      const x = 50 + Math.cos(theta) * 41;
      const y = 50 + Math.sin(theta) * 41;
      const depth = (Math.sin(theta) + 1) / 2;
      node.style.setProperty('--x', `${x}%`);
      node.style.setProperty('--y', `${y}%`);
      node.style.setProperty('--scale', String(0.84 + depth * 0.28));
      node.style.setProperty('--fade', String(0.68 + depth * 0.32));
      node.classList.toggle('selected', index === selected);
      node.setAttribute('aria-selected', String(index === selected));
    });
    if (initial || selected !== this.selected) {
      this.selected = selected;
      this.onSelect(selected, this.items[selected]);
    }
  }
}
