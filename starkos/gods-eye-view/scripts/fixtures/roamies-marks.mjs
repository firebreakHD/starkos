// Test data in Roamies' actual upstream format, not a production answer fallback.
export const MARKS = {
  card: {
    kind: 'card',
    heading: 'Information',
    text: 'Der Controller organisiert die Datenübertragung.',
    items: ['Empfangen', 'Speichern'],
  },
  note: { kind: 'note', text: 'Die Darstellung erklärt einen Ablauf.' },
  list: {
    kind: 'list',
    title: 'Schritte',
    items: ['Lesen', 'Prüfen', 'Vergleichen'],
  },
  clip: {
    kind: 'clip',
    title: 'Originalquelle',
    url: 'https://example.org/article',
    text: 'Eine tatsächlich abgerufene Aussage.',
  },
  sources: {
    kind: 'sources',
    sources: [{ name: 'Dokumentation', url: 'https://example.org' }],
  },
  mindmap: {
    kind: 'mindmap',
    title: 'Speicher',
    branches: [
      { text: 'Flüchtig', items: ['RAM'] },
      { text: 'Dauerhaft', items: ['Flash'] },
    ],
  },
  photo: {
    kind: 'photo',
    url: 'https://example.org/test.png',
    text: 'Testbild',
  },
  graph: {
    kind: 'graph',
    title: 'Messreihe',
    plots: [
      {
        label: 'Beispiel',
        points: [
          [0, 0],
          [1, 2],
          [2, 3],
        ],
      },
    ],
  },
  legend: {
    kind: 'legend',
    keys: [
      { tone: 'teal', text: 'Daten' },
      { tone: 'amber', text: 'Strom' },
    ],
  },
  timeline: {
    kind: 'timeline',
    events: [
      { when: '2000', text: 'Anfang' },
      { when: '2020', text: 'Weiterentwicklung' },
    ],
  },
  molecule: { kind: 'molecule', smiles: 'CCO' },
  model: {
    kind: 'model',
    title: 'Mechanik',
    parts: [
      { shape: 'box', size: [2, 0.3, 1], tone: 'teal', label: 'Platine' },
      {
        shape: 'torus',
        at: [0, 1, 0],
        size: 1,
        tone: 'amber',
        motion: { do: 'spin', axis: 'y', secs: 3 },
      },
    ],
  },
  flow: {
    kind: 'flow',
    nodes: [
      { id: 'in', text: 'Eingang' },
      { id: 'out', text: 'Speicher' },
    ],
    links: [{ from: 'in', to: 'out', flow: true }],
  },
  table: {
    kind: 'table',
    columns: ['Bauteil', 'Aufgabe'],
    rows: [
      ['Controller', 'Organisieren'],
      ['Flash', 'Speichern'],
    ],
  },
  bars: {
    kind: 'bars',
    bars: [
      { label: 'A', value: 12 },
      { label: 'B', value: 20 },
    ],
    unit: 'MB',
  },
  map: {
    kind: 'map',
    region: 'Europe',
    pins: [{ name: 'Wien', lat: 48.2, lon: 16.37 }],
  },
  math: {
    kind: 'math',
    steps: [
      { tex: '2+3=5', note: 'Addition' },
      { tex: '\\frac{10}{2}=5', note: 'Division' },
    ],
  },
  geometry: {
    kind: 'geometry',
    vertices: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 3, y: 0 },
      { id: 'C', x: 3, y: 4 },
    ],
    lines: [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'A', to: 'C', label: '5' },
    ],
  },
  quiz: {
    kind: 'quiz',
    title: 'Prüfen',
    questions: [
      {
        text: 'Wo bleiben die Daten ohne Strom?',
        options: ['Flash', 'Kabel'],
        answer: 'Flash',
        explain: 'Flash speichert nichtflüchtig.',
      },
    ],
  },
  ticket: {
    kind: 'ticket',
    title: 'Zusammenfassung',
    text: 'Die Untersuchung ist abgeschlossen.',
  },
  medal: { kind: 'medal', text: 'Erkannt' },
};
export const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOUlEQVRIie2WsREAAAwBM4TZTWI/GUPzhT53hD/FXeo4QFgQQmjesBSRqOIwRmaOC5AIJAtQ6kkOHq6LF2r/IoJQAAAAAElFTkSuQmCC';
export const photoFetch = async () =>
  new Response(Buffer.from(PNG, 'base64'), {
    headers: { 'content-type': 'image/png' },
  });
