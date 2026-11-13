// ============================================================
// SCAFFOLD OS – Geländemodell: Höhe an einer Stelle aus Geländelinien je Gebäudeseite.
// Eine Linie = Stützpunkte (posM ab Seitenanfang, hoeheM bezogen auf ±0,00 = Fußboden Erdgeschoss), dazwischen linear.
// Außerhalb der Stützpunkte gilt der Wert des nächsten Endpunkts. Die Quelle (Handeingabe, Plan, später Höhenraster)
// ändert nur die Linien, nie die Gründungslogik des Gerüsts.
// ============================================================

export interface GelaendePunkt { posM: number; hoeheM: number }
export type GelaendeSeite = 'front' | 'back' | 'left' | 'right'
export type GelaendeProfil = Partial<Record<GelaendeSeite, GelaendePunkt[]>>

/** Bereinigt eine Linie: nur endliche Werte, nach Position sortiert, gleiche Positionen zusammengefasst (letzter gewinnt). Weniger als 2 Punkte = keine Linie (null). */
export function bereinigeLinie(punkte: GelaendePunkt[] | undefined): GelaendePunkt[] | null {
  if (!punkte) return null
  const m = new Map<number, number>()
  for (const p of punkte) if (p && Number.isFinite(p.posM) && Number.isFinite(p.hoeheM) && Math.abs(p.hoeheM) <= 15) m.set(Math.round(p.posM * 100) / 100, Math.round(p.hoeheM * 100) / 100)
  if (m.size < 2) return null
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([posM, hoeheM]) => ({ posM, hoeheM }))
}

/** Höhe auf einer bereinigten Linie an Position posM (linear zwischen den Stützpunkten). */
export function hoeheAufLinie(linie: GelaendePunkt[], posM: number): number {
  if (posM <= linie[0].posM) return linie[0].hoeheM
  const n = linie.length
  if (posM >= linie[n - 1].posM) return linie[n - 1].hoeheM
  for (let i = 1; i < n; i++) {
    if (posM <= linie[i].posM) {
      const a = linie[i - 1], b = linie[i]
      const t = (posM - a.posM) / (b.posM - a.posM)
      return a.hoeheM + (b.hoeheM - a.hoeheM) * t
    }
  }
  return linie[n - 1].hoeheM
}

export class Terrain {
  private linien: Partial<Record<GelaendeSeite, GelaendePunkt[]>> = {}
  constructor(profil?: GelaendeProfil) {
    for (const sd of ['front', 'back', 'left', 'right'] as const) {
      const l = bereinigeLinie(profil?.[sd])
      if (l) this.linien[sd] = l
    }
  }
  hatLinie(sd: GelaendeSeite): boolean { return !!this.linien[sd] }
  linie(sd: GelaendeSeite): GelaendePunkt[] | null { return this.linien[sd] ?? null }
  /** Gelände an Position posM entlang der Seite (m ab Seitenanfang). undefined, wenn für die Seite keine Linie besteht. */
  heightAt(sd: GelaendeSeite, posM: number): number | undefined {
    const l = this.linien[sd]
    return l ? hoeheAufLinie(l, posM) : undefined
  }
  tiefsteM(sd: GelaendeSeite): number | undefined {
    const l = this.linien[sd]
    return l ? Math.min(...l.map((p) => p.hoeheM)) : undefined
  }
}

/** Texteingabe „0:+1.55, 6:-0.20, 13.8:-2.55" (Komma oder Semikolon getrennt, Dezimalkomma erlaubt, Leerzeichen egal) → Stützpunkte. null bei ungültiger Eingabe. */
export function parseGelaendeLinie(text: string): GelaendePunkt[] | null {
  // Mit Semikolon/Zeilenumbruch getrennt: Komma ist Dezimalkomma. Sonst trennt das Komma die Paare (dann nur Dezimalpunkt).
  const teile = (/[;\n]/.test(text) ? text.split(/[;\n]+/) : text.split(',')).map((s) => s.trim()).filter(Boolean)
  const punkte: GelaendePunkt[] = []
  for (const t of teile) {
    const m = t.match(/^([-+]?\d+(?:[.,]\d+)?)\s*:\s*([-+±]?\s*\d+(?:[.,]\d+)?)$/)
    if (!m) return null
    const pos = parseFloat(m[1].replace(',', '.'))
    const h = parseFloat(m[2].replace(/[±\s]/g, '').replace(',', '.'))
    if (!Number.isFinite(pos) || !Number.isFinite(h)) return null
    punkte.push({ posM: pos, hoeheM: h })
  }
  return bereinigeLinie(punkte)
}

export function formatGelaendeLinie(l: GelaendePunkt[] | undefined): string {
  return (l ?? []).map((p) => `${String(p.posM).replace('.', ',')}:${p.hoeheM > 0 ? '+' : ''}${String(p.hoeheM).replace('.', ',')}`).join('; ')
}
