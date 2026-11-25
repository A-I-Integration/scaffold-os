// ============================================================
// SCAFFOLD OS – Externe Anfragen (Kundenportal, Stufe 1): reine, testbare Regeln
// Status, Eingabeprüfung, Datei-Prüfung (Endung, Größe, Dateikopf), Nummern, Übernahme-Daten.
// ============================================================

import { pruefeLand } from '@/lib/land'

export const TOKEN_MUSTER = /^[a-f0-9]{48}$/
export const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const STATUS = ['neu', 'gelesen', 'in_pruefung', 'rueckfrage', 'in_bearbeitung', 'uebernommen', 'abgelehnt'] as const
export type AnfrageStatus = (typeof STATUS)[number] | 'entwurf'

export const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf', neu: 'Neu', gelesen: 'Gelesen', in_pruefung: 'In Prüfung', rueckfrage: 'Rückfrage erforderlich',
  in_bearbeitung: 'In Bearbeitung', uebernommen: 'Übernommen', abgelehnt: 'Abgelehnt',
}

/** Stände, in denen die Anfrage noch übernommen werden darf. */
export const OFFEN: readonly string[] = ['neu', 'gelesen', 'in_pruefung', 'rueckfrage', 'in_bearbeitung']

/** Von Hand setzbare Stände. „Übernommen" gibt es nur über die Übernahme, „Entwurf/Neu" nur durch den Eingang. */
const MANUELL: readonly string[] = ['gelesen', 'in_pruefung', 'rueckfrage', 'in_bearbeitung', 'abgelehnt']

export function statusWechselErlaubt(von: string, nach: string): { ok: true } | { ok: false; fehler: string } {
  if (von === nach) return { ok: false, fehler: 'Die Anfrage hat diesen Status bereits.' }
  if (von === 'entwurf') return { ok: false, fehler: 'Diese Anfrage wurde noch nicht abgeschickt.' }
  if (von === 'uebernommen') return { ok: false, fehler: 'Die Anfrage ist bereits übernommen und kann nicht mehr geändert werden.' }
  if (!MANUELL.includes(nach)) return { ok: false, fehler: nach === 'uebernommen' ? 'Übernehmen geht nur über „Übernehmen“.' : 'Ungültiger Status.' }
  if (von === 'abgelehnt' && nach !== 'in_pruefung') return { ok: false, fehler: 'Eine abgelehnte Anfrage kann nur wieder „In Prüfung“ gesetzt werden.' }
  return { ok: true }
}

// ─── Dateien ───
export const MAX_DATEIEN = 15
export const MAX_DATEI_BYTES = 25 * 1024 * 1024
export const MAX_GESAMT_BYTES = 100 * 1024 * 1024

interface Typ { mime: string[]; magic?: (b: Uint8Array) => boolean }
const startsWith = (b: Uint8Array, bytes: number[], offset = 0) => bytes.every((x, i) => b[offset + i] === x)
const TYPEN: Record<string, Typ> = {
  pdf: { mime: ['application/pdf'], magic: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  png: { mime: ['image/png'], magic: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: ['image/jpeg'], magic: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: ['image/jpeg'], magic: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: { mime: ['image/webp'], magic: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  dwg: { mime: ['application/acad', 'image/vnd.dwg', 'application/x-dwg', 'application/octet-stream'], magic: (b) => startsWith(b, [0x41, 0x43]) },
  dxf: { mime: ['application/dxf', 'image/vnd.dxf', 'application/octet-stream', 'text/plain'] },
  txt: { mime: ['text/plain'] },
}
export const ERLAUBTE_ENDUNGEN = Object.keys(TYPEN)
export const DATEI_ACCEPT = ERLAUBTE_ENDUNGEN.map((e) => `.${e}`).join(',')

export const endung = (name: string): string => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim()); return m ? m[1].toLowerCase() : '' }

/** Dateiname für die Ablage: keine Pfade, keine Sonderzeichen. */
export function sichererDateiname(name: string): string {
  const e = endung(name)
  const basis = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'datei'
  return e ? `${basis}.${e}` : basis
}

export interface DateiAngabe { name: string; type: string; size: number }

/** Prüft die Angaben VOR dem Hochladen (Endung, MIME-Typ, Größe, Anzahl). */
export function pruefeDateiAngaben(liste: unknown): { ok: true; dateien: DateiAngabe[] } | { ok: false; fehler: string } {
  if (liste === undefined || liste === null) return { ok: true, dateien: [] }
  if (!Array.isArray(liste)) return { ok: false, fehler: 'Ungültige Dateiliste.' }
  if (liste.length > MAX_DATEIEN) return { ok: false, fehler: `Höchstens ${MAX_DATEIEN} Dateien je Anfrage.` }
  const out: DateiAngabe[] = []
  let gesamt = 0
  for (const d of liste) {
    const name = typeof d?.name === 'string' ? d.name.trim() : ''
    const size = Number(d?.size)
    const type = typeof d?.type === 'string' ? d.type.toLowerCase().slice(0, 100) : ''
    if (!name || name.length > 200) return { ok: false, fehler: 'Ungültiger Dateiname.' }
    const e = endung(name)
    const t = TYPEN[e]
    if (!t) return { ok: false, fehler: `„${name}“: Dateityp nicht erlaubt. Erlaubt: PDF, Bilder (JPG, PNG, WEBP), DWG, DXF, TXT.` }
    if (type && !t.mime.includes(type) && type !== 'application/octet-stream') return { ok: false, fehler: `„${name}“: Dateityp passt nicht zur Endung.` }
    if (!Number.isFinite(size) || size <= 0) return { ok: false, fehler: `„${name}“ ist leer.` }
    if (size > MAX_DATEI_BYTES) return { ok: false, fehler: `„${name}“ ist größer als ${MAX_DATEI_BYTES / 1024 / 1024} MB.` }
    gesamt += size
    out.push({ name, type, size })
  }
  if (gesamt > MAX_GESAMT_BYTES) return { ok: false, fehler: `Alle Dateien zusammen dürfen höchstens ${MAX_GESAMT_BYTES / 1024 / 1024} MB groß sein.` }
  return { ok: true, dateien: out }
}

/** Prüft nach dem Hochladen den Dateikopf (Bytes) gegen die Endung. Typen ohne Kennung (DXF, TXT) gelten als bestanden. */
export function dateikopfPasst(name: string, kopf: Uint8Array): boolean {
  const t = TYPEN[endung(name)]
  if (!t) return false
  return t.magic ? t.magic(kopf) : true
}

// ─── Eingabe des Kunden ───
const kuerze = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '')
export const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface AnfrageEingabe {
  absender_name: string; absender_firma: string | null; absender_email: string | null; absender_telefon: string | null
  baustelle_name: string | null; baustelle_adresse: string | null; land: string | null; wunschtermin: string | null; beschreibung: string | null
}

export function pruefeEingabe(b: Record<string, unknown>): { ok: true; daten: AnfrageEingabe } | { ok: false; fehler: string } {
  const name = kuerze(b.name, 120)
  if (!name) return { ok: false, fehler: 'Bitte Ihren Namen angeben.' }
  const email = kuerze(b.email, 150)
  const telefon = kuerze(b.telefon, 50)
  if (!email && !telefon) return { ok: false, fehler: 'Bitte E-Mail oder Telefon angeben, damit wir Sie erreichen.' }
  if (email && !EMAIL_MUSTER.test(email)) return { ok: false, fehler: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  const beschreibung = kuerze(b.beschreibung, 4000)
  const adresse = kuerze(b.baustelle_adresse, 250)
  if (!beschreibung && !adresse) return { ok: false, fehler: 'Bitte die Baustelle (Adresse) oder eine Beschreibung angeben.' }
  const l = pruefeLand(b.land)
  if (!l.ok) return { ok: false, fehler: l.fehler }
  return {
    ok: true,
    daten: {
      absender_name: name, absender_firma: kuerze(b.firma, 150) || null, absender_email: email || null, absender_telefon: telefon || null,
      baustelle_name: kuerze(b.baustelle_name, 150) || null, baustelle_adresse: adresse || null, land: l.land || null,
      wunschtermin: kuerze(b.wunschtermin, 100) || null, beschreibung: beschreibung || null,
    },
  }
}

// ─── Nummern und Links ───
export function naechsteAnfrageNummer(vorhanden: string[], jahr: number): string {
  const re = new RegExp(`^AF-${jahr}-(\\d{4,})$`)
  const max = vorhanden.reduce((m, n) => { const x = re.exec(n); return x ? Math.max(m, Number(x[1])) : m }, 0)
  return `AF-${jahr}-${String(max + 1).padStart(4, '0')}`
}

export function zugangStatus(z: { expires_at?: string | null; revoked_at?: string | null }, jetzt = new Date()): 'aktiv' | 'abgelaufen' | 'widerrufen' {
  if (z.revoked_at) return 'widerrufen'
  if (z.expires_at) { const e = new Date(z.expires_at).getTime(); if (!Number.isFinite(e) || e <= jetzt.getTime()) return 'abgelaufen' }
  return 'aktiv'
}

// ─── Übernahme ───
export type UebernahmeArt = 'neu_kunde' | 'bestehender_kunde'

export interface KundeEingabe { name: string; email?: string | null; phone?: string | null; contact_person?: string | null; street?: string | null; zip?: string | null; city?: string | null; land?: string | null }

/** Ähnliche Kunden (gleiche E-Mail oder gleicher Name), damit kein Doppel angelegt wird. */
export function aehnlicheKunden(neu: { name: string; email?: string | null }, bestand: { id: string; name?: string | null; email?: string | null }[]) {
  const n = (s?: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  return bestand.filter((k) => (n(neu.name) && n(k.name) === n(neu.name)) || (n(neu.email) && n(k.email) === n(neu.email)))
}

/** Baustellen-Datensatz in der Form, die der Aufmaß-Ablauf erwartet (Schritt 1). */
export function projektAusAnfrage(a: { id: string; nummer?: string | null; baustelle_name?: string | null; baustelle_adresse?: string | null; land?: string | null; absender_name: string; beschreibung?: string | null }, kunde: { id: string; name: string }, ueberschreibung?: { name?: string; adresse?: string; land?: string | null }) {
  const adresse = (ueberschreibung?.adresse ?? a.baustelle_adresse ?? '').trim()
  const name = (ueberschreibung?.name ?? a.baustelle_name ?? '').trim() || adresse || `Anfrage ${a.nummer || ''}`.trim()
  const land = (ueberschreibung?.land ?? a.land) || null
  return {
    name, adresse: adresse || '(Adresse nachtragen)', land, customer_id: kunde.id, status: 'active',
    data: {
      step1: { name: kunde.name, adresse: adresse || '(Adresse nachtragen)', land: land || 'Deutschland', gewerke: ['allgemein'], dauer: '30', ...(a.beschreibung ? { bemerkung: a.beschreibung.slice(0, 2000) } : {}) },
      angebotsStatus: 'erstellt',
      anfrage: { id: a.id, nummer: a.nummer || null },
    },
  }
}
