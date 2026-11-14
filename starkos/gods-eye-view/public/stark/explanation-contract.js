// Data only. Neither the controller nor a receiver executes model-written HTML/JS.
export const EXPLANATION_CAPABILITY = 'explanation.scenes';

export function webUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function validateExplanation(input) {
  const fail = () => {
    throw Object.assign(
      new Error(
        'Ungültige Erklärung: Titel, Szenen und lesbare Fenster erforderlich.',
      ),
      { status: 400 },
    );
  };
  const text = (value, max) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
      fail();
    return value.trim();
  };
  if (
    !input ||
    !Array.isArray(input.scenes) ||
    input.scenes.length < 1 ||
    input.scenes.length > 12
  )
    fail();
  return {
    title: text(input.title, 160),
    scenes: input.scenes.map((scene) => {
      if (
        !scene ||
        !Array.isArray(scene.windows) ||
        scene.windows.length < 1 ||
        scene.windows.length > 3
      )
        fail();
      return {
        title: text(scene.title, 160),
        narration: text(scene.narration, 1600),
        seconds: Math.max(8, Math.min(90, Number(scene.seconds) || 15)),
        windows: scene.windows.map((win) => {
          if (
            !win ||
            !['source', 'diagram', 'calculation', 'note'].includes(win.kind)
          )
            fail();
          const result = {
            kind: win.kind,
            title: text(win.title, 160),
            text: text(win.text, 4000),
          };
          if (win.kind === 'source') {
            result.url = webUrl(win.url);
            if (!result.url) fail();
            result.highlight =
              typeof win.highlight === 'string' &&
              win.text.includes(win.highlight)
                ? win.highlight.slice(0, 500)
                : '';
            // A rendered quotation never asserts that its contents are independently verified.
            result.attribution =
              'Quellenauszug · Aussage anhand der Originalquelle prüfen';
          }
          if (win.kind === 'diagram') {
            if (
              !Array.isArray(win.nodes) ||
              win.nodes.length < 2 ||
              win.nodes.length > 6
            )
              fail();
            result.nodes = win.nodes.map((node) => text(node, 120));
          }
          return result;
        }),
      };
    }),
  };
}

export const EXPLANATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'scenes'],
  properties: {
    title: { type: 'string', maxLength: 160 },
    scenes: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        required: ['title', 'narration', 'windows'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          narration: { type: 'string', maxLength: 1600 },
          seconds: { type: 'number', minimum: 8, maximum: 90 },
          windows: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              required: ['kind', 'title', 'text'],
              additionalProperties: false,
              properties: {
                kind: {
                  type: 'string',
                  enum: ['source', 'diagram', 'calculation', 'note'],
                },
                title: { type: 'string' },
                text: { type: 'string', maxLength: 4000 },
                url: {
                  type: 'string',
                  description:
                    'Original source HTTP(S) URL; required for source.',
                },
                highlight: {
                  type: 'string',
                  description: 'Exact substring of source text to underline.',
                },
                nodes: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 2,
                  maxItems: 6,
                },
              },
            },
          },
        },
      },
    },
  },
};
