// ============================================================
// SCAFFOLD OS – Transportgestell mit Wiegezellen: Rechenlogik (ohne Hardware)
//
// Eine Waage liefert nur ein Gewicht. Erst zusammen mit
//   - der Artikelzuordnung des Gestells (sortenrein) bzw. der Materialliste der Baustelle,
//   - dem Leergewicht (Tara) des Gestells und
//   - dem Stückgewicht aus dem Lager (inventory.weight_kg)
// wird daraus eine Stückzahl. Alles hier ist reine Rechnung; nichts wird gespeichert.
// Wichtig: Die Software schlägt nur vor. Gebucht wird erst nach Bestätigung durch eine Person.
// ============================================================

const r2 = (v: number) => Math.round(v * 100) / 100

export type Sicherheit = 'sicher' | 'unsicher' | 'unmoeglich'

export interface StueckErgebnis {
  stueck: number
  /** Nettogewicht (ohne Gestell) in kg */
  nettoKg: number
  /** Abweichung zwischen Messung und stueck × Stückgewicht in kg */
  abweichungKg: number
  /** mögliche Stückzahlen, wenn die Messtoleranz größer als ein halbes Stück ist */
  minStueck: number
  maxStueck: number
  sicherheit: Sicherheit
  hinweis: string
}

/**
 * Gewicht eines sortenreinen Gestells → Stückzahl.
 * sicher: Das nächste ganze Stück liegt innerhalb der Toleranz und keine andere Stückzahl ist möglich.
 * unsicher: Mehrere Stückzahlen passen in die Toleranz (Waage zu ungenau für dieses Teil) oder die Abweichung ist groß.
 */
export function stueckAusGewicht(bruttoKg: number, leergewichtKg: number, stueckKg: number, toleranzKg: number): StueckErgebnis {
  if (!(stueckKg > 0)) return { stueck: 0, nettoKg: 0, abweichungKg: 0, minStueck: 0, maxStueck: 0, sicherheit: 'unmoeglich', hinweis: 'Für den Artikel ist im Lager kein Gewicht hinterlegt.' }
  if (!Number.isFinite(bruttoKg) || !Number.isFinite(leergewichtKg)) return { stueck: 0, nettoKg: 0, abweichungKg: 0, minStueck: 0, maxStueck: 0, sicherheit: 'unmoeglich', hinweis: 'Gewicht fehlt.' }
  const tol = Math.max(0, toleranzKg)
  const netto = r2(bruttoKg - leergewichtKg)
  if (netto < -tol) return { stueck: 0, nettoKg: netto, abweichungKg: netto, minStueck: 0, maxStueck: 0, sicherheit: 'unmoeglich', hinweis: 'Gemessen wird weniger als das Leergewicht des Gestells. Leergewicht oder Waage prüfen.' }
  const stueck = Math.max(0, Math.round(netto / stueckKg))
  const abweichung = r2(netto - stueck * stueckKg)
  const minStueck = Math.max(0, Math.ceil((netto - tol) / stueckKg))
  const maxStueck = Math.max(0, Math.floor((netto + tol) / stueckKg))
  if (minStueck === maxStueck && Math.abs(abweichung) <= tol) {
    return { stueck, nettoKg: netto, abweichungKg: abweichung, minStueck, maxStueck, sicherheit: 'sicher', hinweis: '' }
  }
  if (Math.abs(abweichung) > tol && minStueck > maxStueck) {
    return { stueck, nettoKg: netto, abweichungKg: abweichung, minStueck: stueck, maxStueck: stueck, sicherheit: 'unsicher', hinweis: `Das Gewicht passt nicht zu einer ganzen Stückzahl (Abweichung ${abweichung} kg). Es fehlt etwas, es liegt etwas Fremdes darauf oder das Stückgewicht stimmt nicht.` }
  }
  return { stueck, nettoKg: netto, abweichungKg: abweichung, minStueck, maxStueck, sicherheit: 'unsicher', hinweis: `Die Waage ist für dieses Teil zu ungenau: ${minStueck} bis ${maxStueck} Stück sind möglich. Bitte zählen oder bestätigen.` }
}

export interface Kandidat { id: string; gewichtKg: number; max?: number }
export interface Kombination { mengen: Record<string, number>; abweichungKg: number }

/**
 * Gemischte Ladung: alle Stückzahl-Kombinationen aus den erlaubten Artikeln (laut Materialliste der Baustelle),
 * deren Gewicht innerhalb der Toleranz zum gemessenen Nettogewicht liegt. Beste Treffer zuerst.
 * Genau ein Treffer = eindeutiger Vorschlag; mehrere = die Software darf nicht raten.
 * Die Suche ist begrenzt (maxTreffer, maxSchritte), damit sie bei großen Listen nicht hängt.
 */
export function gemischteLadung(nettoKg: number, kandidaten: Kandidat[], toleranzKg: number, maxTreffer = 20, maxSchritte = 200000): { treffer: Kombination[]; abgebrochen: boolean } {
  const tol = Math.max(0, toleranzKg)
  const liste = kandidaten.filter((k) => k.gewichtKg > 0).sort((a, b) => b.gewichtKg - a.gewichtKg)
  const treffer: Kombination[] = []
  let schritte = 0
  let abgebrochen = false
  // Restgewicht, das die kleineren Artikel höchstens noch beitragen können (zum Abschneiden)
  const rest = liste.map((_, i) => liste.slice(i).reduce((s, k) => s + k.gewichtKg * (k.max ?? Infinity), 0))
  const aktuell: Record<string, number> = {}
  const suche = (i: number, uebrig: number) => {
    if (abgebrochen) return
    if (++schritte > maxSchritte) { abgebrochen = true; return }
    if (i === liste.length) {
      if (Math.abs(uebrig) <= tol && Object.values(aktuell).some((m) => m > 0)) {
        treffer.push({ mengen: Object.fromEntries(Object.entries(aktuell).filter(([, m]) => m > 0)), abweichungKg: r2(uebrig) })
      }
      return
    }
    if (uebrig > rest[i] + tol) return
    const k = liste[i]
    const obergrenze = Math.min(k.max ?? Infinity, Math.floor((uebrig + tol) / k.gewichtKg))
    for (let m = obergrenze; m >= 0; m--) {
      aktuell[k.id] = m
      suche(i + 1, uebrig - m * k.gewichtKg)
      if (abgebrochen) break
    }
    aktuell[k.id] = 0
  }
  suche(0, nettoKg)
  treffer.sort((a, b) => Math.abs(a.abweichungKg) - Math.abs(b.abweichungKg))
  return { treffer: treffer.slice(0, maxTreffer), abgebrochen }
}

// ------------------------------------------------------------------
// Bestand je Ort und Bewegungen (Lager / LKW / Baustellen). Alles geht über den LKW.
// ------------------------------------------------------------------

/** ort → artikelId → Stück */
export type Bestand = Record<string, Record<string, number>>

export interface Bewegung { von: string; nach: string; artikelId: string; stueck: number }

export interface BewegungsFehler { index: number; text: string }

/** Wendet Bewegungen der Reihe nach an. Nichts wird verändert, wenn eine Bewegung nicht möglich ist (zu wenig Bestand, Menge ≤ 0). */
export function wendeBewegungenAn(bestand: Bestand, bewegungen: Bewegung[]): { bestand: Bestand; fehler: BewegungsFehler[] } {
  const neu: Bestand = JSON.parse(JSON.stringify(bestand))
  const fehler: BewegungsFehler[] = []
  bewegungen.forEach((b, index) => {
    if (!Number.isInteger(b.stueck) || b.stueck <= 0) { fehler.push({ index, text: 'Die Menge muss eine ganze Zahl über 0 sein.' }); return }
    if (b.von === b.nach) { fehler.push({ index, text: 'Start und Ziel sind gleich.' }); return }
    const vorhanden = neu[b.von]?.[b.artikelId] ?? 0
    if (vorhanden < b.stueck) { fehler.push({ index, text: `${b.von}: nur ${vorhanden} Stück vorhanden, ${b.stueck} gebucht.` }); return }
    neu[b.von][b.artikelId] = vorhanden - b.stueck
    neu[b.nach] = neu[b.nach] ?? {}
    neu[b.nach][b.artikelId] = (neu[b.nach][b.artikelId] ?? 0) + b.stueck
  })
  return fehler.length ? { bestand, fehler } : { bestand: neu, fehler }
}

export interface GestellLadung { gestellId: string; ziel: string; artikelId: string; stueck: number }

/**
 * Teilabbau: Material geht von der Baustelle auf den LKW (alles in einer Fahrt) und von dort je Gestell an sein Ziel.
 * Ergebnis sind immer zwei Buchungen je Gestell: Baustelle → LKW, LKW → Ziel. Gleiche Ziele und Artikel werden zusammengefasst.
 */
export function buchungenFuerAbbau(baustelle: string, lkw: string, ladungen: GestellLadung[]): Bewegung[] {
  const summe = new Map<string, Bewegung>()
  const aufnahme = new Map<string, number>()
  for (const l of ladungen) {
    if (l.stueck <= 0) continue
    aufnahme.set(l.artikelId, (aufnahme.get(l.artikelId) ?? 0) + l.stueck)
    const key = `${l.ziel}|${l.artikelId}`
    const alt = summe.get(key)
    if (alt) alt.stueck += l.stueck
    else summe.set(key, { von: lkw, nach: l.ziel, artikelId: l.artikelId, stueck: l.stueck })
  }
  const auf: Bewegung[] = [...aufnahme].map(([artikelId, stueck]) => ({ von: baustelle, nach: lkw, artikelId, stueck }))
  return [...auf, ...summe.values()]
}

export interface SollIst { artikelId: string; soll: number; ist: number; differenz: number }

/** Vergleich Abbauplan (Soll) und gewogene Ladung (Ist) je Artikel. */
export function sollIstVergleich(soll: Record<string, number>, ladungen: GestellLadung[]): SollIst[] {
  const ist: Record<string, number> = {}
  for (const l of ladungen) ist[l.artikelId] = (ist[l.artikelId] ?? 0) + l.stueck
  const ids = [...new Set([...Object.keys(soll), ...Object.keys(ist)])]
  return ids.map((artikelId) => ({ artikelId, soll: soll[artikelId] ?? 0, ist: ist[artikelId] ?? 0, differenz: (ist[artikelId] ?? 0) - (soll[artikelId] ?? 0) }))
}
