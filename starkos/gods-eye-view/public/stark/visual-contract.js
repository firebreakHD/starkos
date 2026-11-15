// Declarative visual data only; no SVG markup, scripts, external assets or URLs.
const TONES = ['cyan', 'amber', 'muted'];
export function validateVisual(win) {
  const fail = () => {
    throw new Error(
      'Ungültige Zeichnung: begrenzte Formen, Koordinaten und Beschriftungen erforderlich.',
    );
  };
  const number = (v, low, high) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < low || v > high)
      fail();
    return v;
  };
  const label = (v, limit = 100) => {
    if (typeof v !== 'string' || !v.trim() || v.length > limit) fail();
    return v.trim();
  };
  const tone = (v) => {
    if (v !== undefined && !TONES.includes(v)) fail();
    return v || 'cyan';
  };
  if (win.kind === 'drawing') {
    const elements = win.drawing?.elements;
    if (!Array.isArray(elements) || !elements.length || elements.length > 40)
      fail();
    return {
      drawing: {
        elements: elements.map((e) => {
          if (
            !e ||
            !['rect', 'ellipse', 'stroke', 'arrow', 'label'].includes(e.kind)
          )
            fail();
          const item = { kind: e.kind, tone: tone(e.tone) };
          if (['stroke', 'arrow'].includes(e.kind)) {
            if (
              !Array.isArray(e.points) ||
              e.points.length < 2 ||
              e.points.length > 24
            )
              fail();
            item.points = e.points.map((p) => {
              if (!Array.isArray(p) || p.length !== 2) fail();
              return p.map((v) => number(v, 0, 100));
            });
          } else {
            item.x = number(e.x, 0, 100);
            item.y = number(e.y, 0, 100);
            if (e.kind === 'label') item.text = label(e.text);
            else {
              item.width = number(e.width, 1, 100);
              item.height = number(e.height, 1, 100);
              if (item.x + item.width > 100 || item.y + item.height > 100)
                fail();
            }
          }
          if (e.text !== undefined) item.text = label(e.text);
          return item;
        }),
      },
    };
  }
  if (win.kind === 'model') {
    const parts = win.model?.parts;
    if (!Array.isArray(parts) || !parts.length || parts.length > 8) fail();
    return {
      model: {
        parts: parts.map((p) => {
          if (!p || !['box', 'sphere', 'ring', 'cylinder'].includes(p.shape))
            fail();
          return {
            shape: p.shape,
            label: label(p.label, 60),
            tone: tone(p.tone),
            x: number(p.x, -100, 100),
            y: number(p.y, -100, 100),
            z: number(p.z, -100, 100),
            width: number(p.width, 1, 160),
            height: number(p.height, 1, 160),
            depth: number(p.depth, 1, 160),
          };
        }),
      },
    };
  }
  if (win.kind === 'timeline') {
    if (
      !Array.isArray(win.entries) ||
      win.entries.length < 2 ||
      win.entries.length > 6
    )
      fail();
    return {
      entries: win.entries.map((e) => ({
        label: label(e.label, 60),
        detail: label(e.detail, 160),
      })),
    };
  }
  return {};
}
const num = (min, max) => ({ type: 'number', minimum: min, maximum: max });
const tone = { type: 'string', enum: TONES };
export const VISUAL_PROPERTIES = {
  drawing: {
    type: 'object',
    additionalProperties: false,
    required: ['elements'],
    properties: {
      elements: {
        type: 'array',
        minItems: 1,
        maxItems: 40,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind'],
          properties: {
            kind: {
              type: 'string',
              enum: ['rect', 'ellipse', 'stroke', 'arrow', 'label'],
            },
            x: num(0, 100),
            y: num(0, 100),
            width: num(1, 100),
            height: num(1, 100),
            tone,
            text: { type: 'string', maxLength: 100 },
            points: {
              type: 'array',
              minItems: 2,
              maxItems: 24,
              items: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: num(0, 100),
              },
            },
          },
        },
      },
    },
    description:
      'Free drawing in a 0..100 coordinate space. Rect/ellipse need x,y,width,height. Stroke/arrow need points [[x,y],...]. Label needs x,y,text. Draw the actual subject with callout arrows, not a stack of text boxes. Keep labels short and separated.',
  },
  model: {
    type: 'object',
    additionalProperties: false,
    required: ['parts'],
    properties: {
      parts: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'shape',
            'label',
            'x',
            'y',
            'z',
            'width',
            'height',
            'depth',
          ],
          properties: {
            shape: {
              type: 'string',
              enum: ['box', 'sphere', 'ring', 'cylinder'],
            },
            label: { type: 'string', maxLength: 60 },
            x: num(-100, 100),
            y: num(-100, 100),
            z: num(-100, 100),
            width: num(1, 160),
            height: num(1, 160),
            depth: num(1, 160),
            tone,
          },
        },
      },
    },
    description:
      'A rotating, labeled 3D schematic assembled from geometric parts. Approximate geometry, not a photograph or measured model. Coordinates -100..100, dimensions 1..160. Use at most four main parts for clarity. For a USB stick: connector box, board box, controller box and flash box. Rings and spheres can explain orbits/astronomy.',
  },
  entries: {
    type: 'array',
    minItems: 2,
    maxItems: 6,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['label', 'detail'],
      properties: {
        label: { type: 'string', maxLength: 60 },
        detail: { type: 'string', maxLength: 160 },
      },
    },
    description:
      'Ordered timeline entries; dates/events must come from evidence or be labeled assumptions.',
  },
};
