// ============================================================
// SCAFFOLD OS – KI-Hinweis (EU AI Act, Art. 4 / Art. 50)
//
// Einheitlicher Hinweis bei allen KI-Funktionen:
// „KI-gestützt – Ergebnis bitte prüfen."
// Schafft Transparenz gegenüber Nutzern und dokumentiert,
// dass ein Mensch die fachliche Entscheidung trifft.
// ============================================================

export default function KiHinweis({ text }: { text?: string }) {
  return (
    <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
      <span aria-hidden>🤖</span>
      <span>{text || 'KI-gestützt – Ergebnis bitte prüfen. Die fachliche Entscheidung trifft immer ein Mensch.'}</span>
    </p>
  );
}
