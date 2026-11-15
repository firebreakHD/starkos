// Shared between the controller and Hermes: typing alone never opens windows.
export function allowsPresentation({
  mode = 'voice',
  text = '',
  visuals = true,
} = {}) {
  if (visuals === false) return false;
  const words = text.toLowerCase();
  if (
    /\b(ohne|keine?|nicht|never|no|without)\b.{0,28}\b(fenster|grafik\w*|diagramm\w*|visuel\w*|visual\w*|windows?|draw\w*)\b/u.test(
      words,
    ) ||
    /\b(nicht (zeichnen|zeigen|visualisieren)|nur (im )?chat|text only|don't show)\b/u.test(
      words,
    )
  )
    return false;
  if (mode !== 'chat') return true;
  return (
    /\b(zeig\w*|zeichne\w*|visualisier\w*|show|draw|visualize)\b/u.test(
      words,
    ) ||
    /\b(visuel\w*|grafisch\w*|mit fenstern|als (grafik|diagramm)|visual explanation)\b/u.test(
      words,
    )
  );
}
