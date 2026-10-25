// ============================================================
// SCAFFOLD OS – PLY: senkrechte Achse aus dem Datei-Kopf lesen
//
// Manche PLY-Dateien sagen im Kopf, welche Achse „oben“ ist (Kommentarzeile, z. B. „Y oben“ oder „Z up“).
// Das ist eine Angabe der Datei und kein Raten. Steht nichts Eindeutiges drin, liefert die Funktion null,
// und die bisherige Erkennung über die Punktverteilung bleibt zuständig.
// ============================================================

/** 0 = x, 1 = y, 2 = z; null = keine eindeutige Angabe im Kopf */
export function achseAusPlyKopf(buffer: Uint8Array | Buffer | string): 0 | 1 | 2 | null {
  const text = typeof buffer === 'string' ? buffer : Buffer.from(buffer.subarray(0, 4096)).toString('latin1')
  const ende = text.indexOf('end_header')
  const kopf = ende >= 0 ? text.slice(0, ende) : text
  const treffer = new Set<number>()
  for (const zeile of kopf.split(/\r?\n/)) {
    if (!/^\s*comment\b/i.test(zeile)) continue
    for (const m of zeile.matchAll(/\b([xyz])\s*[-–]?\s*(?:oben|up)\b/gi)) {
      treffer.add('xyz'.indexOf(m[1].toLowerCase()))
    }
  }
  if (treffer.size !== 1) return null
  return [...treffer][0] as 0 | 1 | 2
}
