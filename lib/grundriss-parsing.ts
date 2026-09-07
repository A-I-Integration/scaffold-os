// ============================================================
// SCAFFOLD OS – gemeinsame Grundriss-Auswertungs-Helfer
//
// Extrahiert aus app/api/grundriss-analyse/route.ts (Phase 41), damit
// die gleiche, sorgfältig gebaute Anti-Halluzinations-Logik auch vom
// neuen CAD-Datei-Upload genutzt werden kann, ohne sie zu duplizieren
// (und damit auseinanderdriften zu lassen).
//
// Grundsatz: Ein Vision-Modell kann bei Bauplänen halluzinieren
// (Bemaßungsketten summieren, Zahlen raten). Deshalb gilt:
// 1. Was per Muster eindeutig im Plan-Text steht, gewinnt vor der KI.
// 2. Jeder KI-Zahlenwert muss im Plan-Text wörtlich belegbar sein,
//    sonst wird er verworfen (lieber leeres Feld als falsches Angebot).
// ============================================================

export function parsePlanNumber(s: string): number {
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return parseFloat(s);
}

export function deterministicFromText(text: string): Record<string, number | string> {
  const found: Record<string, number | string> = {};

  const hm = text.match(/(?:hausmaß|außenmaß|gebäudemaß|gebäudeabmessung)[^\d]{0,25}(\d{1,3}[.,]\d{1,2})\s*m?\s*[×x]\s*(\d{1,3}[.,]\d{1,2})/i);
  if (hm) {
    const a = parsePlanNumber(hm[1]);
    const b = parsePlanNumber(hm[2]);
    found.laenge = Math.max(a, b);
    found.breite = Math.min(a, b);
  }

  const th = text.match(/traufhöhe[^\d]{0,15}(\d{1,2}[.,]\d{1,2})/i)
    || text.match(/traufe\s*[=:+]?\s*(\d{1,2}[.,]\d{1,2})/i)
    || text.match(/(?:^|\s)TH\s*[=:+]\s*(\d{1,2}[.,]\d{1,2})/m);
  if (th) found.traufhoehe = parsePlanNumber(th[1]);

  const fh = text.match(/firsthöhe[^\d]{0,15}(\d{1,2}[.,]\d{1,2})/i)
    || text.match(/first\s*[=:+]\s*(\d{1,2}[.,]\d{1,2})/i)
    || text.match(/(?:^|\s)FH\s*[=:+]\s*(\d{1,2}[.,]\d{1,2})/m);
  if (fh) found.hoehe = parsePlanNumber(fh[1]);

  const dach = text.match(/\b(Satteldach|Flachdach|Pultdach|Walmdach|Mansarddach|Zeltdach)\b/i);
  if (dach) found.dachform = dach[1][0].toUpperCase() + dach[1].slice(1).toLowerCase();

  return found;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function valueInText(v: number, text: string): boolean {
  const candidates = new Set<string>();
  candidates.add(v.toFixed(2).replace('.', ','));
  candidates.add(v.toFixed(1).replace('.', ','));
  candidates.add(String(v));
  if (Number.isInteger(v)) candidates.add(String(v));
  for (const c of candidates) {
    if (new RegExp(`(?<![\\d.,])${escapeRegExp(c)}(?![\\d])`).test(text)) return true;
  }
  return false;
}

/**
 * Anti-Halluzination + Plausibilität: prüft die von der KI gelieferten
 * Maße/Merkmale gegen den Plan-Text (falls vorhanden) bzw. gegen die
 * mitgelieferten Belege, verwirft alles Unbelegte/Unplausible.
 * Verändert `structured` direkt und gibt die Liste der verworfenen
 * Werte zurück (für Transparenz in der Antwort).
 */
export function pruefeUndFiltere(structured: Record<string, any>, ocrText: string): string[] {
  if (ocrText) {
    const det = deterministicFromText(ocrText);
    for (const [k, v] of Object.entries(det)) structured[k] = v;
  }

  const verworfen: string[] = [];
  const dimLabels: Record<string, string> = { laenge: 'Länge', breite: 'Breite', hoehe: 'Höhe', traufhoehe: 'Traufhöhe' };
  const dimRanges: Record<string, [number, number]> = { laenge: [2, 80], breite: [2, 80], hoehe: [2, 40], traufhoehe: [2, 30] };
  for (const key of Object.keys(dimLabels)) {
    const v = structured[key];
    if (typeof v !== 'number') {
      if (v !== null && v !== undefined) structured[key] = null;
      continue;
    }
    const [min, max] = dimRanges[key];
    if (v < min || v > max) {
      verworfen.push(`${dimLabels[key]}: ${v} m (unplausibel, erlaubt ${min}–${max} m)`);
      structured[key] = null;
      continue;
    }
    if (ocrText) {
      if (!valueInText(v, ocrText)) {
        verworfen.push(`${dimLabels[key]}: ${v} m (im Plan-Text nicht belegt)`);
        structured[key] = null;
      }
    } else if (!structured.belege?.[key]) {
      verworfen.push(`${dimLabels[key]}: ${v} m (kein Plan-Beleg)`);
      structured[key] = null;
    }
  }
  if (ocrText) {
    if (structured.dachform && !new RegExp(escapeRegExp(String(structured.dachform)), 'i').test(ocrText)) {
      verworfen.push(`Dachform: ${structured.dachform} (im Plan-Text nicht belegt)`);
      structured.dachform = null;
    }
  }
  if (typeof structured.hoehe === 'number' && typeof structured.traufhoehe === 'number'
      && structured.traufhoehe > structured.hoehe) {
    const tmp = structured.hoehe;
    structured.hoehe = structured.traufhoehe;
    structured.traufhoehe = tmp;
  }
  if ((structured.hoehe === null || structured.hoehe === undefined) &&
      typeof structured.geschosse === 'number' && structured.geschosse >= 1 && structured.geschosse <= 10) {
    structured.hoehe_geschaetzt = Math.round(structured.geschosse * 3 * 10) / 10;
  }

  return verworfen;
}
