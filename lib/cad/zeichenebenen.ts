// ============================================================
// lib/cad/zeichenebenen.ts
// CAD-Zeichenebenen (Layer): ordnen Zeichenobjekte (Maße, Messungen,
// Hilfslinien, Notizen …) nach Themen und steuern deren Sichtbarkeit und
// Sperre.
//
// Bewusst GETRENNT von den Gerüstlagen (types/cad-layers.ts, Lagen/Seiten des
// Gerüsts): eigene Datenstruktur, eigene Persistenz, keine gemeinsamen Felder.
// Zeichenebenen beeinflussen weder Gerüstberechnung noch Stückliste noch Statik –
// sie steuern ausschließlich Anzeige und Bearbeitbarkeit.
// ============================================================

export const STANDARD_EBENEN = [
  { id: 'std-gebaeude', name: 'Gebäude' },
  { id: 'std-gelaende', name: 'Gelände' },
  { id: 'std-geruest', name: 'Gerüst' },
  { id: 'std-treppen', name: 'Treppen' },
  { id: 'std-sonderbauteile', name: 'Sonderbauteile' },
  { id: 'std-bemassungen', name: 'Bemaßungen' },
  { id: 'std-hilfslinien', name: 'Hilfslinien' },
  { id: 'std-notizen', name: 'Notizen' },
  { id: 'std-importierte-plaene', name: 'Importierte Pläne' },
] as const

export type StandardEbenenId = (typeof STANDARD_EBENEN)[number]['id']

export interface Zeichenebene {
  id: string
  name: string
  sichtbar: boolean
  gesperrt: boolean
}

/** Objektschlüssel: `<art>:<id>` mit art = figur | mass | mess | notiz */
export type ObjektArt = 'figur' | 'mass' | 'mess' | 'notiz'
export const objektSchluessel = (art: ObjektArt, id: string) => `${art}:${id}`

export interface Zeichenebenen {
  ebenen: Zeichenebene[]
  /** Objektschlüssel → Ebenen-ID; fehlt ein Objekt, gilt seine Standardebene */
  zuordnung: Record<string, string>
  /** Ebene, in die neu gezeichnete Objekte kommen (fehlt = Standardebene der Objektart) */
  aktiv?: string
}

export const MAX_EBENEN = 50
export const MAX_ZUORDNUNGEN = 5000
export const MAX_NAME = 60

export const standardZeichenebenen = (): Zeichenebenen => ({
  ebenen: STANDARD_EBENEN.map((e) => ({ id: e.id, name: e.name, sichtbar: true, gesperrt: false })),
  zuordnung: {},
})

/** Standardebene einer Objektart (Figuren: Maß → Bemaßungen, alles andere → Hilfslinien). */
export function standardEbeneFuer(art: ObjektArt, figurArt?: string): StandardEbenenId {
  if (art === 'mass' || art === 'mess') return 'std-bemassungen'
  if (art === 'notiz') return 'std-notizen'
  return figurArt === 'mass' ? 'std-bemassungen' : 'std-hilfslinien'
}

export const istStandardEbene = (id: string) => STANDARD_EBENEN.some((e) => e.id === id)

export const findeEbene = (z: Zeichenebenen, id: string) => z.ebenen.find((e) => e.id === id)

/** Ebene eines Objekts (eigene Zuordnung, sonst Standardebene; verwaiste Zuordnung zählt als nicht zugeordnet). */
export function ebeneVon(z: Zeichenebenen, schluessel: string, standard: StandardEbenenId): Zeichenebene {
  const id = z.zuordnung[schluessel]
  return (id ? findeEbene(z, id) : undefined) ?? findeEbene(z, standard) ?? { id: standard, name: standard, sichtbar: true, gesperrt: false }
}

export const istSichtbar = (z: Zeichenebenen, schluessel: string, standard: StandardEbenenId) => ebeneVon(z, schluessel, standard).sichtbar
export const istGesperrt = (z: Zeichenebenen, schluessel: string, standard: StandardEbenenId) => ebeneVon(z, schluessel, standard).gesperrt

const bereinigeName = (n: string) => n.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)

export type Ergebnis = { ok: true; zustand: Zeichenebenen } | { ok: false; fehler: string }
const ok = (zustand: Zeichenebenen): Ergebnis => ({ ok: true, zustand })
const fehler = (f: string): Ergebnis => ({ ok: false, fehler: f })

const nameBelegt = (z: Zeichenebenen, name: string, ausser?: string) =>
  z.ebenen.some((e) => e.id !== ausser && e.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))

export function ebeneHinzufuegen(z: Zeichenebenen, name: string, id: string): Ergebnis {
  const n = bereinigeName(name)
  if (!n) return fehler('Bitte einen Namen für die Ebene eingeben.')
  if (z.ebenen.length >= MAX_EBENEN) return fehler(`Mehr als ${MAX_EBENEN} Ebenen sind nicht möglich.`)
  if (nameBelegt(z, n)) return fehler(`Es gibt bereits eine Ebene „${n}“.`)
  if (findeEbene(z, id)) return fehler('Diese Ebenen-ID ist schon vergeben.')
  return ok({ ...z, ebenen: [...z.ebenen, { id, name: n, sichtbar: true, gesperrt: false }] })
}

export function ebeneUmbenennen(z: Zeichenebenen, id: string, name: string): Ergebnis {
  const e = findeEbene(z, id)
  if (!e) return fehler('Ebene nicht gefunden.')
  const n = bereinigeName(name)
  if (!n) return fehler('Bitte einen Namen für die Ebene eingeben.')
  if (nameBelegt(z, n, id)) return fehler(`Es gibt bereits eine Ebene „${n}“.`)
  return ok({ ...z, ebenen: z.ebenen.map((x) => (x.id === id ? { ...x, name: n } : x)) })
}

/**
 * Löschen: Standardebenen bleiben bestehen (sie sind die Auffangebenen der Objektarten).
 * Eine gesperrte Ebene lässt sich nicht löschen. Objekte der gelöschten Ebene fallen auf ihre Standardebene zurück.
 */
export function ebeneLoeschen(z: Zeichenebenen, id: string): Ergebnis {
  const e = findeEbene(z, id)
  if (!e) return fehler('Ebene nicht gefunden.')
  if (istStandardEbene(id)) return fehler('Standardebenen können nicht gelöscht werden.')
  if (e.gesperrt) return fehler('Die Ebene ist gesperrt – zuerst entsperren.')
  const zuordnung: Record<string, string> = {}
  for (const [k, v] of Object.entries(z.zuordnung)) if (v !== id) zuordnung[k] = v
  return ok({ ebenen: z.ebenen.filter((x) => x.id !== id), zuordnung, ...(z.aktiv && z.aktiv !== id ? { aktiv: z.aktiv } : {}) })
}

export function setzeSichtbar(z: Zeichenebenen, id: string, sichtbar: boolean): Ergebnis {
  if (!findeEbene(z, id)) return fehler('Ebene nicht gefunden.')
  return ok({ ...z, ebenen: z.ebenen.map((x) => (x.id === id ? { ...x, sichtbar } : x)) })
}

/** Sperren ändert die Sichtbarkeit nicht: eine gesperrte Ebene bleibt sichtbar (und umgekehrt). */
export function setzeGesperrt(z: Zeichenebenen, id: string, gesperrt: boolean): Ergebnis {
  if (!findeEbene(z, id)) return fehler('Ebene nicht gefunden.')
  return ok({ ...z, ebenen: z.ebenen.map((x) => (x.id === id ? { ...x, gesperrt } : x)) })
}

export function setzeAktiv(z: Zeichenebenen, id: string | undefined): Ergebnis {
  if (id === undefined) { const { aktiv: _a, ...rest } = z; void _a; return ok(rest) }
  if (!findeEbene(z, id)) return fehler('Ebene nicht gefunden.')
  return ok({ ...z, aktiv: id })
}

/** Ordnet ein Objekt einer Ebene zu. Weder aus einer gesperrten noch in eine gesperrte Ebene. */
export function objektZuordnen(z: Zeichenebenen, schluessel: string, standard: StandardEbenenId, zielId: string): Ergebnis {
  const ziel = findeEbene(z, zielId)
  if (!ziel) return fehler('Zielebene nicht gefunden.')
  const quelle = ebeneVon(z, schluessel, standard)
  if (quelle.id === ziel.id) return ok(z)
  if (quelle.gesperrt) return fehler(`Die Ebene „${quelle.name}“ ist gesperrt.`)
  if (ziel.gesperrt) return fehler(`Die Ebene „${ziel.name}“ ist gesperrt.`)
  const zuordnung = { ...z.zuordnung }
  if (ziel.id === standard) delete zuordnung[schluessel]
  else {
    if (Object.keys(zuordnung).length >= MAX_ZUORDNUNGEN && !(schluessel in zuordnung)) return fehler('Zu viele Zuordnungen.')
    zuordnung[schluessel] = ziel.id
  }
  return ok({ ...z, zuordnung })
}

/** Ebene für ein neu gezeichnetes Objekt: aktive Ebene, sonst Standardebene. Gesperrt → Fehler. */
export function ebeneFuerNeuesObjekt(z: Zeichenebenen, standard: StandardEbenenId): { ok: true; ebene: Zeichenebene; ausdruecklich: boolean } | { ok: false; fehler: string } {
  const aktiv = z.aktiv ? findeEbene(z, z.aktiv) : undefined
  const e = aktiv ?? ebeneVon(z, '', standard)
  if (e.gesperrt) return { ok: false, fehler: `Die Ebene „${e.name}“ ist gesperrt.` }
  return { ok: true, ebene: e, ausdruecklich: !!aktiv && aktiv.id !== standard }
}

/** Zuordnung für ein neues Objekt festhalten (nur nötig, wenn die Ebene von der Standardebene abweicht). */
export function neuesObjektZuordnen(z: Zeichenebenen, schluessel: string, ebeneId: string, standard: StandardEbenenId): Zeichenebenen {
  if (ebeneId === standard) return z
  return { ...z, zuordnung: { ...z.zuordnung, [schluessel]: ebeneId } }
}

/** Zuordnungen gelöschter Objekte entfernen. */
export function zuordnungenBereinigen(z: Zeichenebenen, vorhandeneSchluessel: Set<string>): Zeichenebenen {
  const keys = Object.keys(z.zuordnung)
  if (keys.every((k) => vorhandeneSchluessel.has(k))) return z
  const zuordnung: Record<string, string> = {}
  for (const k of keys) if (vorhandeneSchluessel.has(k)) zuordnung[k] = z.zuordnung[k]
  return { ...z, zuordnung }
}

/** Anzahl Objekte je Ebene (für die Anzeige). */
export function zaehleObjekte(z: Zeichenebenen, objekte: { schluessel: string; standard: StandardEbenenId }[]): Record<string, number> {
  const n: Record<string, number> = {}
  for (const e of z.ebenen) n[e.id] = 0
  for (const o of objekte) { const e = ebeneVon(z, o.schluessel, o.standard); n[e.id] = (n[e.id] ?? 0) + 1 }
  return n
}

/** Entspricht der Zustand dem Ausgangszustand? Dann wird nichts gespeichert (alte Dateien bleiben unverändert). */
export function istStandardZustand(z: Zeichenebenen): boolean {
  const s = standardZeichenebenen()
  return !z.aktiv && Object.keys(z.zuordnung).length === 0 && z.ebenen.length === s.ebenen.length &&
    z.ebenen.every((e, i) => e.id === s.ebenen[i].id && e.name === s.ebenen[i].name && e.sichtbar && !e.gesperrt)
}

/** Liest einen unbekannten Wert (aus Datei/Konto) fehlertolerant; fehlende Standardebenen werden ergänzt. */
export function liesZeichenebenen(raw: unknown, verworfen?: string[]): Zeichenebenen {
  const std = standardZeichenebenen()
  if (raw === undefined || raw === null) return std
  if (typeof raw !== 'object' || Array.isArray(raw)) { verworfen?.push('Zeichenebenen: ungültig, Standard verwendet'); return std }
  const r = raw as Record<string, unknown>
  const ebenen: Zeichenebene[] = []
  const ids = new Set<string>()
  if (Array.isArray(r.ebenen)) {
    for (const x of r.ebenen.slice(0, MAX_EBENEN)) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      if (typeof o.id !== 'string' || !o.id || o.id.length > 80 || ids.has(o.id)) continue
      const stdName = STANDARD_EBENEN.find((e) => e.id === o.id)?.name
      const name = typeof o.name === 'string' ? bereinigeName(o.name) : ''
      const n = name || stdName
      if (!n) continue
      ids.add(o.id)
      ebenen.push({ id: o.id, name: n, sichtbar: o.sichtbar !== false, gesperrt: o.gesperrt === true })
    }
  }
  // fehlende Standardebenen vorn ergänzen (in Standardreihenfolge)
  const fehlend = std.ebenen.filter((e) => !ids.has(e.id))
  if (fehlend.length) verworfen?.push(`Zeichenebenen: ${fehlend.length} Standardebene(n) ergänzt`)
  const alle = [...std.ebenen.filter((e) => ids.has(e.id) || fehlend.includes(e)).map((e) => ebenen.find((x) => x.id === e.id) ?? e), ...ebenen.filter((e) => !istStandardEbene(e.id))]
  const zuordnung: Record<string, string> = {}
  if (r.zuordnung && typeof r.zuordnung === 'object' && !Array.isArray(r.zuordnung)) {
    let n = 0
    for (const [k, v] of Object.entries(r.zuordnung as Record<string, unknown>)) {
      if (n >= MAX_ZUORDNUNGEN) break
      if (typeof v === 'string' && /^(figur|mass|mess|notiz):/.test(k) && k.length < 200 && alle.some((e) => e.id === v)) { zuordnung[k] = v; n++ }
    }
  }
  const aktiv = typeof r.aktiv === 'string' && alle.some((e) => e.id === r.aktiv) ? r.aktiv : undefined
  return { ebenen: alle, zuordnung, ...(aktiv ? { aktiv } : {}) }
}
