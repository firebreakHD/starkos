// Fixed example, never presented as live research or a real measurement.
export const CONVERSATION_DEMO = {
  title: 'Demo: Wie hält sich ein Helikopter in der Luft?',
  scenes: [
    {
      title: 'Demo · die Frage untersuchen',
      narration:
        'Das ist eine Vorführung mit festen Beispieldaten, keine Live-Recherche. Ich zeige dir, wie die Fenster beim Erklären wechseln. Wir nehmen einen schwebenden Helikopter als Beispiel.',
      seconds: 12,
      windows: [
        {
          kind: 'note',
          title: 'Warum fällt er nicht herunter?',
          text: 'DEMO · Vereinfachtes Beispiel, keine Messung.\n\nBeim ruhigen Schweben gleicht die vertikale Rotorkraft die Gewichtskraft aus. Für eine echte Untersuchung würde Jarvis hier Originalquellen und ihre Fundstellen öffnen.',
        },
        {
          kind: 'diagram',
          title: 'Kräfte sichtbar machen',
          text: 'Vereinfachte Darstellung des Schwebeflugs.',
          nodes: [
            'Rotor beschleunigt Luft nach unten',
            'Die Luft übt eine Gegenkraft auf den Rotor aus',
            'Vertikale Rotorkraft gleicht Gewichtskraft aus',
          ],
        },
      ],
    },
    {
      title: 'Demo · gemeinsam rechnen',
      narration:
        'Nehmen wir nur als Rechenbeispiel eine Masse von tausend Kilogramm an. Mit neun Komma acht eins Metern pro Sekunde zum Quadrat ergibt das eine Gewichtskraft von neuntausendachthundertzehn Newton. Das ist kein Messwert eines echten Fluggeräts.',
      seconds: 16,
      windows: [
        {
          kind: 'calculation',
          title: 'Gewichtskraft im Beispiel',
          text: 'ANNAHME: Masse m = 1.000 kg\nANNAHME: g = 9,81 m/s²\n\nF = m × g\nF = 1.000 × 9,81\nF = 9.810 N\n\nModell: ruhiges Schweben, vertikale Kräfte im Gleichgewicht.',
        },
        {
          kind: 'note',
          title: 'Was noch untersucht werden müsste',
          text: 'Realer Leistungsbedarf, Luftdichte, Rotorgeometrie und Reserven sind damit noch nicht bestimmt. Eine Rechnung ersetzt keine fehlenden Eingangsdaten.\n\nSag „bleib hier“, um anzuhalten, oder „weiter“, um die Ansicht zu wechseln.',
        },
      ],
    },
    {
      title: 'Demo · Ergebnis',
      narration:
        'So funktioniert der Ablauf: Fundstelle oder Annahme zeigen, Zusammenhänge zeichnen, einen Rechenweg einblenden und die Fenster danach schließen. Auf dem Handy zeige ich jedes Fenster einzeln und größer.',
      seconds: 10,
      windows: [
        {
          kind: 'note',
          title: 'Erklären statt Buttons bedienen',
          text: 'DEMO BEENDET\n\n„Untersuche …“ startet über die eingerichtete Hermes-Verbindung einen echten Auftrag. „Ohne Fenster“ wechselt zur reinen Sprache. Bestehende Medien und Receiver bleiben über „Bereiche“ erreichbar.',
        },
      ],
    },
  ],
};
