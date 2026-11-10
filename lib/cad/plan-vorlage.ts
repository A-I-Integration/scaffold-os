// ============================================================
// SCAFFOLD OS – Plan als Vorlage im Umriss-Zeichner: Maßstab-Rechnung (rein, ohne Browser).
// Ein Plan-PDF hat eine Seitengröße in Punkten (1 pt = 1/72 Zoll). Bei Maßstab 1:n entspricht
// 1 pt auf dem Papier n · 0,0254 / 72 m in der Wirklichkeit. Eine Prüfstrecke (zwei Klicks + bekannte
// Länge) korrigiert den Maßstab, falls der Plan skaliert gedruckt wurde.
// ============================================================

const METER_JE_PUNKT_PAPIER = 0.0254 / 72

/** Meter in der Wirklichkeit je PDF-Punkt bei Maßstab 1:`nenner`. */
export function meterJePunkt(nenner: number): number {
  return Number.isFinite(nenner) && nenner > 0 ? nenner * METER_JE_PUNKT_PAPIER : 0
}

/** Gibt einen Maßstab-Nenner aus Text wie „100“, „1:100“ oder „1 : 50“ zurück; sonst null. */
export function massstabNenner(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '')
  const m = t.match(/^(?:1:)?(\d{1,4})$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 5000 ? n : null
}

/**
 * Korrekturfaktor aus einer Prüfstrecke: Wie lang ist die Strecke im Zeichner (gemessen)
 * und wie lang ist sie laut Plan (bekannt)? Faktor = bekannt / gemessen.
 * null, wenn eine der Längen unbrauchbar ist oder der Faktor unplausibel (außerhalb 0,2 … 5).
 */
export function korrekturFaktor(gemessenM: number, bekanntM: number): number | null {
  if (!(gemessenM > 0) || !(bekanntM > 0)) return null
  const f = bekanntM / gemessenM
  return f >= 0.2 && f <= 5 ? f : null
}

/**
 * Maßstab aus den Texten einer Plan-Seite lesen („M 1:100“, „1:50“ …). Bei mehreren Angaben zählt die häufigste;
 * bei Gleichstand die größere Zahl (Detailmaßstäbe wie 1:20 stehen meist nur einmal). null, wenn nichts gefunden wird.
 */
export function massstabAusTexten(texte: string[]): number | null {
  const zaehler = new Map<number, number>()
  for (const t of texte) {
    const re = /(?:^|[^\d:])1\s*:\s*(\d{2,4})(?!\d)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) {
      const n = parseInt(m[1], 10)
      if (n >= 20 && n <= 500) zaehler.set(n, (zaehler.get(n) ?? 0) + 1)
    }
  }
  let best: number | null = null, bestN = 0
  for (const [n, c] of zaehler) if (c > bestN || (c === bestN && best !== null && n > best)) { best = n; bestN = c }
  return best
}
