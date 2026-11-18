import { LV_STANDARD_EINGABEN, type Leistungsverzeichnis, type LvPosition, type LvTitel } from '@/lib/leistungsverzeichnis'
import { rechneLvNeu } from '@/lib/projekt-lv'

// ============================================================
// SCAFFOLD OS – Leistungsverzeichnis von Hand anlegen
// Titel und Positionen werden angeklickt (Leistungskatalog) oder frei eingegeben.
// Daraus entsteht ein normales Leistungsverzeichnis (gleiches Format wie aus dem CAD),
// das als Version an der Baustelle gespeichert, als PDF ausgegeben und abgerechnet werden kann.
// ============================================================

export interface ManuellePosition { titel: string; text?: string; menge: number; einheit: string; ep: number }
export interface ManuellerTitel { titel: string; positionen: ManuellePosition[] }
export interface ManuellesLvKopf { bauvorhaben: string; bauherr: string; objektadresse: string; auftragnehmer: string; mwstProzent: number }

const pad2 = (n: number) => String(n).padStart(2, '0')
const zahl = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Nur Positionen mit Bezeichnung zählen; Titel ohne Position entfallen. */
export function bereinigeManuelleTitel(titel: ManuellerTitel[]): ManuellerTitel[] {
  return titel
    .map((t) => ({ titel: t.titel.trim(), positionen: t.positionen.filter((p) => p.titel.trim()).map((p) => ({ ...p, titel: p.titel.trim() })) }))
    .filter((t) => t.positionen.length > 0)
}

export function pruefeManuellesLv(titel: ManuellerTitel[]): string | null {
  const t = bereinigeManuelleTitel(titel)
  if (t.length === 0) return 'Bitte mindestens eine Position mit Bezeichnung anlegen.'
  if (t.some((x) => !x.titel)) return 'Jeder Titel braucht eine Überschrift.'
  return null
}

export function baueManuellesLv(kopf: ManuellesLvKopf, titelRoh: ManuellerTitel[]): Leistungsverzeichnis {
  const titel: LvTitel[] = bereinigeManuelleTitel(titelRoh).map((t, ti) => {
    const positionen: LvPosition[] = t.positionen.map((p, pi) => ({
      nr: `${ti + 1}.${pad2(pi + 1)}`,
      titel: p.titel,
      text: p.text?.trim() ? p.text.split('\n').map((z) => z.trim()).filter(Boolean) : [],
      menge: Math.max(0, zahl(p.menge)),
      einheit: p.einheit.trim() || 'Stk.',
      ep: Math.max(0, zahl(p.ep)),
      gp: 0,
    }))
    return { nr: ti + 1, nrText: pad2(ti + 1), titel: t.titel || `Titel ${ti + 1}`, positionen, summe: 0 }
  })
  const ohnePreis = titel.flatMap((t) => t.positionen).filter((p) => !(p.ep > 0)).map((p) => `Pos. ${p.nr}: Preis fehlt`)
  const lv: Leistungsverzeichnis = {
    mengeStellen: 2,
    eingaben: { ...LV_STANDARD_EINGABEN, bauvorhaben: kopf.bauvorhaben, bauherr: kopf.bauherr, objektadresse: kopf.objektadresse, auftragnehmer: kopf.auftragnehmer, mwstProzent: kopf.mwstProzent },
    kopf: [
      { label: 'Gewerk', wert: 'Gerüstarbeiten nach DIN 18451' },
      { label: 'Bauvorhaben', wert: kopf.bauvorhaben || '–' },
      { label: 'Objektadresse', wert: kopf.objektadresse || '–' },
      { label: 'Bauherr', wert: kopf.bauherr || '–' },
      { label: 'Anbieter', wert: kopf.auftragnehmer || '–' },
    ],
    titel,
    summeNetto: 0, mwst: 0, summeBrutto: 0,
    annahmen: ['Leistungsverzeichnis von Hand erstellt: Mengen und Einheitspreise sind Eingaben.', 'Alle Einheitspreise sind Nettopreise in Euro.'],
    fehlendeAngaben: ohnePreis,
  }
  return rechneLvNeu(lv)
}
