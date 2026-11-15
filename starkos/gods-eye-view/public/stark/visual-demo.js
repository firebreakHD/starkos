// Fixed, labeled geometry for trying the drawing workspace without an account.
export const USB_DEMO = {
  title: 'Demo · Im Inneren eines USB-Sticks',
  scenes: [
    {
      title: 'Ein Blick unter das Gehäuse',
      narration:
        'Eine vereinfachte Demo: Der Anschluss verbindet den Stick mit dem Computer. Auf der Platine sitzen ein Controller und der Flash-Speicher. Ich drehe das Schema, damit du die Teile siehst.',
      seconds: 22,
      windows: [
        {
          kind: 'model',
          title: 'USB-Stick · geöffnet',
          text: 'Demo · schematische Geometrie, keine maßgetreue Abbildung.',
          model: {
            parts: [
              {
                shape: 'box',
                label: 'USB-Anschluss',
                x: -72,
                y: 0,
                z: 0,
                width: 48,
                height: 16,
                depth: 42,
                tone: 'muted',
              },
              {
                shape: 'box',
                label: 'Platine',
                x: 20,
                y: 7,
                z: 0,
                width: 136,
                height: 4,
                depth: 50,
                tone: 'cyan',
              },
              {
                shape: 'box',
                label: 'Controller',
                x: -10,
                y: -3,
                z: 0,
                width: 28,
                height: 12,
                depth: 28,
                tone: 'amber',
              },
              {
                shape: 'box',
                label: 'Flash-Speicher',
                x: 54,
                y: -3,
                z: 0,
                width: 44,
                height: 12,
                depth: 34,
                tone: 'cyan',
              },
            ],
          },
        },
        {
          kind: 'note',
          title: 'Die zwei Aufgaben',
          text: 'Der Controller organisiert Lesen und Schreiben.\n\nDer Flash-Speicher hält die Daten auch ohne Strom.\n\nDemo · feste Beispieldaten, keine Live-Recherche.',
        },
      ],
    },
    {
      title: 'So wandern die Daten',
      narration:
        'Jetzt zeichne ich den Datenweg. Über den Anschluss kommen Strom und Daten. Der Controller übersetzt die USB-Anfragen in Speicherzugriffe. Die Daten bleiben als elektrische Ladung in Speicherzellen erhalten.',
      seconds: 22,
      windows: [
        {
          kind: 'drawing',
          title: 'Vom Anschluss in den Speicher',
          text: 'Demo · vereinfachter Datenweg. Die Pfeile zeigen den Schreibvorgang; beim Lesen fließen die Daten zurück.',
          drawing: {
            elements: [
              {
                kind: 'rect',
                x: 10,
                y: 37,
                width: 18,
                height: 22,
                tone: 'muted',
              },
              {
                kind: 'stroke',
                points: [
                  [13, 42],
                  [25, 42],
                ],
                tone: 'muted',
              },
              {
                kind: 'stroke',
                points: [
                  [13, 49],
                  [25, 49],
                ],
                tone: 'muted',
              },
              {
                kind: 'stroke',
                points: [
                  [13, 55],
                  [25, 55],
                ],
                tone: 'muted',
              },
              { kind: 'rect', x: 28, y: 27, width: 62, height: 42 },
              {
                kind: 'rect',
                x: 37,
                y: 37,
                width: 17,
                height: 22,
                tone: 'amber',
              },
              { kind: 'rect', x: 68, y: 34, width: 15, height: 28 },
              {
                kind: 'arrow',
                points: [
                  [29, 48],
                  [36, 48],
                ],
                tone: 'amber',
              },
              {
                kind: 'arrow',
                points: [
                  [55, 48],
                  [66, 48],
                ],
              },
              {
                kind: 'arrow',
                points: [
                  [45, 20],
                  [45, 34],
                ],
                tone: 'amber',
              },
              {
                kind: 'label',
                x: 28,
                y: 14,
                text: 'Controller',
                tone: 'amber',
              },
              { kind: 'label', x: 58, y: 85, text: 'Flash-Speicher' },
              {
                kind: 'arrow',
                points: [
                  [75, 77],
                  [75, 64],
                ],
              },
              {
                kind: 'label',
                x: 8,
                y: 80,
                text: 'USB: Daten + Strom',
                tone: 'muted',
              },
              {
                kind: 'arrow',
                points: [
                  [18, 72],
                  [18, 62],
                ],
                tone: 'muted',
              },
            ],
          },
        },
      ],
    },
  ],
};
