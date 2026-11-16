// STARK adapter for the original Roamies draw contract (AGPL-3.0).
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DrawArgs,
  checkDraw,
  parseSmiles,
  flowLayers,
  resolveRegion,
  parseTex,
  createParts,
  createPhotos,
  ACTIONS,
} from './roamies-upstream/draw.mjs';
import { publicSourceUrl, publicAddresses } from './research.js';
import { fetchPinnedRadioResponse } from '../providers/radio/transport.js';
const description = JSON.parse(
  readFileSync(
    new URL('./roamies-upstream/draw-description.json', import.meta.url),
    'utf8',
  ),
);
export const ROAMIES_TOOL = {
  name: 'draw',
  description:
    description +
    '\nSTARK mobile adapter: coordinates refer to the STARK workspace (0..1000 reference grid), not other apps. Only drawing actions are available; type, open, copy, handoff and desktop access are disabled. For sources use clip with url and an exact excerpt obtained via read_source. display_ids defaults to [] for this phone. On phones cards are presented one at a time at readable scale, with swipes and panning for wide diagrams. Edits use the part IDs returned by this tool. Never invent a photo label: describe only an image actually observed. Source claims need retrieved evidence.',
  inputSchema: z.toJSONSchema(
    DrawArgs.extend({ display_ids: z.array(z.string()).max(12).default([]) }),
    { target: 'draft-7' },
  ),
};
export async function pinnedInkFetch(value, options = {}) {
  const url = publicSourceUrl(String(value));
  const addresses = await publicAddresses(url.hostname);
  const response = await fetchPinnedRadioResponse(
    url,
    {
      ...options,
      signal: AbortSignal.any([
        options.signal || new AbortController().signal,
        AbortSignal.timeout(12000),
      ]),
      headers: { ...options.headers, 'Accept-Encoding': 'identity' },
    },
    addresses,
  );
  const reader = response.body?.getReader();
  const chunks = [];
  let length = 0;
  try {
    if (reader)
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        length += chunk.byteLength;
        if (length > 800000) throw new Error('Bild oder Quelle zu groß.');
        chunks.push(Buffer.from(chunk));
      }
  } finally {
    await reader?.cancel().catch(() => {});
  }
  return new Response(Buffer.concat(chunks), {
    status: response.status,
    headers: response.headers,
  });
}
export const ROAMIES_PHOTO_TOOL = {
  name: 'see_photo',
  description:
    "Look at a picture before naming its parts. Give the same query (a thing with a Wikipedia page) or url you will give draw's photo mark: you get that picture back, so you can see where each part is. Needed once before a photo with labels; a photo without labels doesn't need it.",
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', maxLength: 100 },
      url: { type: 'string', maxLength: 2000 },
    },
  },
};
export function createRoamies({ fetchImpl = pinnedInkFetch } = {}) {
  const sessions = new Map();
  const drawingOwners = new Map();
  function session(input) {
    const key = String(input.session || 'controller').slice(0, 120);
    for (const [id, s] of sessions)
      if (s.expires < Date.now()) sessions.delete(id);
    if (!sessions.has(key)) {
      if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
      sessions.set(key, {
        parts: createParts(),
        pinned: new Set(),
        photos: createPhotos({ fetchImpl, max: 4 }),
      });
    }
    const state = sessions.get(key);
    state.expires = Date.now() + 1800000;
    return state;
  }
  const prepare = async function (input = {}) {
    const selected = input.display_ids ?? [];
    if (
      !Array.isArray(selected) ||
      selected.length > 12 ||
      selected.some((x) => typeof x !== 'string')
    )
      throw new Error('Ungültige Displayauswahl.');
    const args = DrawArgs.parse(input);
    const errors = checkDraw(args);
    if (errors.length) throw new Error(errors.join(' '));
    if (
      (args.beats || [])
        .flatMap((b) => b.marks)
        .filter((m) => m.kind === 'photo').length > 4
    )
      throw new Error('Höchstens vier Fotos pro Zeichnung.');
    const state = session(input);
    const unseen = state.photos.unseen(args.beats);
    if (unseen) throw new Error(unseen);
    const parts = state.parts;
    for (const edit of args.edit || [])
      if (edit.do !== 'clear' && !parts.has(edit.part))
        throw new Error(
          'Dieser Zeichnungsteil existiert nicht mehr: ' + edit.part,
        );
    for (const beat of args.beats || [])
      for (const mark of beat.marks) {
        for (const target of [mark.at, mark.to, mark.tie])
          if (target) {
            for (const key of ['x', 'y', 'w', 'h'])
              if (
                target[key] !== undefined &&
                (target[key] < 0 || target[key] > 1000)
              )
                throw new Error(
                  'Koordinaten müssen im STARK-Referenzraum 0..1000 liegen.',
                );
          }
        if (mark.points?.some((p) => p.some((n) => n < 0 || n > 1000)))
          throw new Error(
            'Linienpunkte müssen im STARK-Referenzraum 0..1000 liegen.',
          );
        if (mark.size !== undefined && (mark.size <= 0 || mark.size > 200))
          throw new Error('Schriftgröße außerhalb des Zeichenbereichs.');
        if (mark.r !== undefined && (mark.r < 0 || mark.r > 500))
          throw new Error('Radius außerhalb des Zeichenbereichs.');
        for (const part of mark.parts || []) {
          if (
            (part.at || []).some((n) => Math.abs(n) > 1000) ||
            (part.size || []).some((n) => n <= 0 || n > 1000)
          )
            throw new Error(
              '3D-Teile müssen begrenzte, positive Abmessungen besitzen.',
            );
        }

        if (
          ACTIONS.includes(mark.kind) &&
          !['sfx', 'button'].includes(mark.kind)
        )
          throw new Error(
            'Dieses Desktop-Werkzeug ist im Browser nicht verfügbar: ' +
              mark.kind,
          );
        if (selected.length && mark.action?.do === 'ask')
          throw new Error(
            'Frage-Buttons sind nur am Controller verfügbar; gekoppelte Displays bleiben passiv.',
          );
        if (mark.action?.do === 'open') publicSourceUrl(mark.action.value);
        for (const source of mark.sources || []) publicSourceUrl(source.url);
        if (mark.url) publicSourceUrl(mark.url);
        if (mark.kind === 'molecule') mark.mol = parseSmiles(mark.smiles);
        if (mark.kind === 'flow') mark.lay = flowLayers(mark.nodes, mark.links);
        if (mark.kind === 'map') Object.assign(mark, resolveRegion(mark));
        if (mark.kind === 'math')
          mark.steps = mark.steps.map((step) => ({
            ...step,
            tree: parseTex(step.tex),
          }));
        if (mark.kind === 'quiz')
          mark.questions = mark.questions.map((q) => ({
            ...q,
            right: q.options.findIndex(
              (x) => x.trim().toLowerCase() === q.answer.trim().toLowerCase(),
            ),
          }));
        if (mark.kind === 'photo')
          Object.assign(mark, await state.photos.get(mark));
      }
    if (!args.edit?.length) parts.clear((id) => state.pinned.has(id));
    for (const edit of args.edit || []) {
      if (edit.do === 'clear') {
        parts.clear();
        state.pinned.clear();
      }
      if (edit.do === 'erase') {
        parts.remove(edit.part);
        state.pinned.delete(edit.part);
      }
    }
    const beats = args.beats || [];
    parts.assign(beats);
    const drawing = {
      id: randomBytes(9).toString('base64url'),
      beats: beats.map((b, i) => ({
        ...b,
        n: i + 1,
        caption: b.say,
        voiced: false,
      })),
      edits: args.edit || [],
      deep: !!args.deep,
      parts: parts.describe(),
      display_ids: selected,
      reference: { width: 1000, height: 1000 },
    };
    if (JSON.stringify(drawing).length > 5000000)
      throw new Error(
        'Zeichnung ist zu groß. Bitte in kürzere Schritte aufteilen.',
      );
    drawingOwners.set(drawing.id, state);
    if (drawingOwners.size > 128)
      drawingOwners.delete(drawingOwners.keys().next().value);
    return drawing;
  };
  prepare.see = (input) => session(input).photos.see(input);
  prepare.event = (input) => {
    const state = drawingOwners.get(input.drawingId),
      event = input.event;
    if (
      !state ||
      state.expires < Date.now() ||
      !event ||
      !['ink_pinned', 'ink_closed', 'ink_cleared'].includes(event.type)
    )
      return { accepted: false };
    if (event.type === 'ink_cleared')
      state.parts.clear((id) => state.pinned.has(id));
    else if (
      !/^p\d{1,8}$/.test(event.part || '') ||
      !state.parts.has(event.part)
    )
      return { accepted: false };
    else if (event.type === 'ink_pinned') {
      if (typeof event.on !== 'boolean') return { accepted: false };
      if (event.on === true) state.pinned.add(event.part);
      else state.pinned.delete(event.part);
    } else {
      state.pinned.delete(event.part);
      state.parts.remove(event.part);
    }
    return { accepted: true };
  };
  return prepare;
}
