// Stammdaten eines CAD-Projekts im Konto: Kunde (aus der Kundenverwaltung), Projektnummer, Status.
// Reine Regeln ohne Datenbankzugriff, damit Server und Oberfläche dieselben Prüfungen nutzen.
export const STATUS_WERTE = ['entwurf', 'in_bearbeitung', 'pruefung_erforderlich', 'freigegeben', 'abgeschlossen', 'archiviert'] as const
export type ProjektStatus = (typeof STATUS_WERTE)[number]

export const STATUS_TEXT: Record<ProjektStatus, string> = {
  entwurf: 'Entwurf',
  in_bearbeitung: 'In Bearbeitung',
  pruefung_erforderlich: 'Prüfung erforderlich',
  freigegeben: 'Freigegeben',
  abgeschlossen: 'Abgeschlossen',
  archiviert: 'Archiviert',
}

export const istStatus = (v: unknown): v is ProjektStatus => typeof v === 'string' && (STATUS_WERTE as readonly string[]).includes(v)

/** Wer darf was (Rollen wie in lib/rollen.ts). Annahmen: Projektnummer ändern nur Admin; „Freigegeben“ setzt nur Admin; Kunde zuordnen wie in der Kundenverwaltung Admin und Disposition. */
export const darfProjektnummerAendern = (rolle: string) => rolle === 'admin'
export const darfKundeZuordnen = (rolle: string) => rolle === 'admin' || rolle === 'disponent'
export const darfStatusSetzen = (rolle: string, status: ProjektStatus) => status !== 'freigegeben' || rolle === 'admin'

const NUMMER_MUSTER = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,39}$/
/** Projektnummer bereinigen und prüfen; Rückgabe = Nummer oder Fehlertext */
export function pruefeProjektnummer(roh: unknown): { ok: true; nummer: string } | { ok: false; fehler: string } {
  if (typeof roh !== 'string') return { ok: false, fehler: 'Projektnummer fehlt.' }
  const n = roh.trim()
  if (!NUMMER_MUSTER.test(n)) return { ok: false, fehler: 'Projektnummer: 3 bis 40 Zeichen, erlaubt sind Buchstaben, Ziffern und . _ / -' }
  return { ok: true, nummer: n }
}

export interface KundeKurz { id: string; name: string; street?: string | null; zip?: string | null; city?: string | null }

/** Anschrift aus dem Kundenstamm als eine Zeile; leer, wenn nichts hinterlegt ist */
export function kundenAnschrift(k: Pick<KundeKurz, 'street' | 'zip' | 'city'> | null | undefined): string {
  if (!k) return ''
  const ort = [k.zip, k.city].map((x) => (x ?? '').trim()).filter(Boolean).join(' ')
  return [(k.street ?? '').trim(), ort].filter(Boolean).join(', ')
}

export interface StammdatenAenderung { customerId?: string | null; status?: unknown; projektnummer?: unknown }
export interface GeprueftStammdaten { customerId?: string | null; status?: ProjektStatus; projektnummer?: string }

/** Eingehende Änderung gegen Rolle und Wertebereich prüfen. Nicht genannte Felder bleiben unberührt. */
export function pruefeStammdaten(rolle: string, a: StammdatenAenderung): { ok: true; wert: GeprueftStammdaten } | { ok: false; fehler: string; status: number } {
  const wert: GeprueftStammdaten = {}
  if (a.customerId !== undefined) {
    if (!darfKundeZuordnen(rolle)) return { ok: false, fehler: 'Den Kunden dürfen nur Admin und Disposition zuordnen.', status: 403 }
    if (a.customerId !== null && typeof a.customerId !== 'string') return { ok: false, fehler: 'Kunde ist ungültig.', status: 400 }
    wert.customerId = a.customerId
  }
  if (a.status !== undefined) {
    if (!istStatus(a.status)) return { ok: false, fehler: 'Status ist ungültig.', status: 400 }
    if (!darfStatusSetzen(rolle, a.status)) return { ok: false, fehler: 'Den Status „Freigegeben“ darf nur ein Admin setzen.', status: 403 }
    wert.status = a.status
  }
  if (a.projektnummer !== undefined) {
    if (!darfProjektnummerAendern(rolle)) return { ok: false, fehler: 'Die Projektnummer darf nur ein Admin ändern.', status: 403 }
    const p = pruefeProjektnummer(a.projektnummer)
    if (!p.ok) return { ok: false, fehler: p.fehler, status: 400 }
    wert.projektnummer = p.nummer
  }
  if (Object.keys(wert).length === 0) return { ok: false, fehler: 'Keine Änderung angegeben.', status: 400 }
  return { ok: true, wert }
}

export interface KontoProjektStand {
  id: string; name: string; revision: number; erstelltAm?: string; geaendertAm?: string
  projektnummer?: string; status?: ProjektStatus; kunde?: { id: string; name: string; anschrift: string } | null
}

/** Zustand des geöffneten Konto-Projekts in der CAD-Seite aus dem Kopfsatz des Servers */
export function kontoStandAusKopf(k: { id: string; name: string; revision: number; created_at?: string; updated_at?: string; projektnummer?: string; status?: ProjektStatus; customer?: KundeKurz | null }): KontoProjektStand {
  return {
    id: k.id, name: k.name, revision: k.revision, erstelltAm: k.created_at, geaendertAm: k.updated_at, projektnummer: k.projektnummer, status: k.status,
    kunde: k.customer ? { id: k.customer.id, name: k.customer.name, anschrift: kundenAnschrift(k.customer) } : null,
  }
}
