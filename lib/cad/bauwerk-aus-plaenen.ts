// ============================================================
// SCAFFOLD OS – Mehrere Plan-PDFs (Grundriss + Ansichten) zu EINEM Bauwerk-Vorschlag zusammenführen.
// Reine Logik ohne Browser: Eingang sind schon gelesene Seiten. Ergebnis ist ein Vorschlag mit Befunden, nie eine Entscheidung.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import type { PlanText } from './grundriss-finden'
import { lesMassketten } from './masse-lesen'
import { koerperAusSchnittflaechen, type KoerperVorschlag } from './schnittflaechen'
import { ansichtLesen, type AnsichtErgebnis } from './ansicht-lesen'
import { profilAusAnsicht, type AnsichtProfil } from './ansicht-profil'
import { gleicheAnsichtenAb, type BauwerkVorschlag, type AnsichtBefund } from './ansichten-abgleich'

export interface GelesenerPlan { name: string; massstab: number; flaechen: VektorFlaeche[]; texte: PlanText[] }

export interface BauwerkAusPlaenen {
  /** Vorschlagswerte (Meter); fehlen, wo der Plan nichts Belastbares zeigt */
  laengeM?: number
  breiteM?: number
  hoeheM?: number
  grundriss?: KoerperVorschlag & { quelle: string }
  ansichten?: BauwerkVorschlag
  /** Silhouette der Ansicht mit belegtem Boden: Schaft und Helm (Form nicht erkannt) */
  turmProfil?: AnsichtProfil & { quelle: string; schaftDurchMassketteBestaetigt: boolean }
  befunde: AnsichtBefund[]
  nichtGelesen: string[]
}

const IST_ANSICHT = /ANSICHT\s+(NORD|OST|S[ÜU]D|WEST)/i
const IST_GRUNDRISS = /GRUNDRISS/i
const nahe = (a: number, b: number, anteil = 0.03) => Math.abs(a - b) <= anteil * Math.max(a, b)
const de = (x: number) => x.toLocaleString('de-DE')

export function bauwerkAusPlaenen(plaene: GelesenerPlan[]): BauwerkAusPlaenen {
  const befunde: AnsichtBefund[] = []
  const nichtGelesen: string[] = []
  let grundriss: BauwerkAusPlaenen['grundriss']
  const ansichtEingang: { name: string; ergebnis: NonNullable<ReturnType<typeof ansichtLesen>> }[] = []
  const ansichtPlan = new Map<string, GelesenerPlan>()
  let grundrissMasse: ReturnType<typeof lesMassketten>['angaben'] = []

  for (const p of plaene) {
    const alle = p.texte.map((t) => t.s).join(' ')
    const an = IST_ANSICHT.exec(alle)
    if (an) {
      const e = ansichtLesen(p.flaechen, p.texte, p.massstab)
      if (e) { const nm = `Ansicht ${an[1][0].toUpperCase()}${an[1].slice(1).toLowerCase()}`; ansichtEingang.push({ name: nm, ergebnis: e }); ansichtPlan.set(nm, p) }
      else nichtGelesen.push(`${p.name}: Ansicht ohne lesbaren Körper`)
    } else if (IST_GRUNDRISS.test(alle) && !grundriss) {
      grundrissMasse = lesMassketten(p.flaechen, p.texte, p.massstab).angaben
      const k = koerperAusSchnittflaechen(p.flaechen, p.massstab, grundrissMasse)
      if (k) grundriss = { ...k, quelle: p.name }
      else nichtGelesen.push(`${p.name}: Grundriss ohne erkennbare Schnittflächen`)
    } else {
      nichtGelesen.push(`${p.name}: weder Grundriss noch Ansicht erkannt`)
    }
  }

  const ansichten = ansichtEingang.length ? gleicheAnsichtenAb(ansichtEingang) : undefined
  if (ansichten) befunde.push(...ansichten.befunde)
  if (!grundriss) befunde.push({ code: 'KEIN_GRUNDRISS', ampel: 'gelb', text: 'Kein Grundriss mit Schnittflächen gelesen: Länge und Tiefe des Turms fehlen.' })
  if (!ansichten) befunde.push({ code: 'KEINE_ANSICHT', ampel: 'gelb', text: 'Keine Ansicht gelesen: Die Höhe fehlt.' })

  const v: BauwerkAusPlaenen = { grundriss, ansichten, befunde, nichtGelesen }
  if (grundriss) {
    v.laengeM = grundriss.breiteM
    v.breiteM = grundriss.tiefeM
    befunde.push(grundriss.passendeMasse.length
      ? { code: 'GRUNDRISS_MASSKETTE', ampel: 'gruen', text: `Grundriss ${de(grundriss.breiteM)} × ${de(grundriss.tiefeM)} m, durch eine gezeichnete Maßkette bestätigt.` }
      : { code: 'GRUNDRISS_UNBESTAETIGT', ampel: 'gelb', text: `Grundriss ${de(grundriss.breiteM)} × ${de(grundriss.tiefeM)} m ist aus den Schnittflächen gemessen, keine Maßkette bestätigt es.` })
  }
  if (ansichten?.hoeheM) v.hoeheM = ansichten.hoeheM
  // Silhouette: nur aus einer Ansicht mit belegtem Boden (sonst sind Höhen nicht vergleichbar)
  if (ansichten?.hoeheAus) {
    const plan = ansichtPlan.get(ansichten.hoeheAus)
    const erg = ansichtEingang.find((x) => x.name === ansichten.hoeheAus)?.ergebnis as AnsichtErgebnis | undefined
    const haupt = erg?.koerper[0]
    // Breitester Körper in der Mittelachse des Hauptkörpers (Schaft unter dem Helm), nicht die seitlichen Schiffe
    const mpp = (0.0254 / 72) * (plan?.massstab ?? 100)
    const achsBreite = haupt && erg ? Math.max(...erg.koerper.filter((k) => Math.abs(k.mitteXPt - haupt.mitteXPt) * mpp <= 0.5).map((k) => k.breiteM)) : 0
    const pr = plan && erg && haupt ? profilAusAnsicht(plan.flaechen, plan.massstab, erg.bodenYPt, haupt.mitteXPt, achsBreite) : null
    if (pr && plan) {
      const passt = (b: number) => grundrissMasse.filter((a) => a.status === 'bestaetigt' && a.linieM !== undefined && Math.abs(a.linieM - b) <= 0.005 * b).sort((x, y) => Math.abs(x.linieM! - b) - Math.abs(y.linieM! - b))[0]
      const mSchaft = passt(pr.schaftBreiteM)
      const mHelm = pr.helmHoeheM > 0 ? passt(pr.helmMaxBreiteM) : undefined
      v.turmProfil = { ...pr, quelle: ansichten.hoeheAus, schaftDurchMassketteBestaetigt: !!mSchaft }
      const stuetz = [mSchaft && `Schaftbreite entspricht der Maßkette ${mSchaft.text} m im Grundriss`, mHelm && `größte Helmbreite entspricht der Maßkette ${mHelm.text} m im Grundriss (Übereinstimmung der Zahl, kein Beweis für die Zuordnung)`].filter(Boolean)
      befunde.push({ code: 'TURM_PROFIL', ampel: 'gelb', text: `${ansichten.hoeheAus}: Schaft ${de(pr.schaftBreiteM)} m breit bis ${de(pr.schaftHoeheM)} m${pr.helmHoeheM > 0 ? `, darüber Helm ${de(pr.helmHoeheM)} m hoch (größte Breite ${de(pr.helmMaxBreiteM)} m, Form nicht erkannt)` : ''}.${stuetz.length ? ' ' + stuetz.join('; ') + '.' : ''}` })
    }
  }
  // Querprüfung: Ansichtsbreite (bei vorhandener Silhouette die Schaftbreite) gegen die Grundriss-Seiten
  if (grundriss && (v.turmProfil?.schaftBreiteM ?? ansichten?.breiteM)) {
    const b = (v.turmProfil?.schaftBreiteM ?? ansichten!.breiteM)!
    if (nahe(b, grundriss.breiteM) || nahe(b, grundriss.tiefeM)) befunde.push({ code: 'ANSICHT_GRUNDRISS_GLEICH', ampel: 'gruen', text: `${v.turmProfil ? 'Schaftbreite' : 'Ansichtsbreite'} ${de(b)} m passt zu einer Seite des Grundrisses.` })
    else befunde.push({ code: 'ANSICHT_GRUNDRISS_ABWEICHEND', ampel: 'gelb', text: `${v.turmProfil ? 'Schaftbreite' : 'Ansichtsbreite'} ${de(b)} m passt zu keiner Seite des Grundrisses (${de(grundriss.breiteM)} × ${de(grundriss.tiefeM)} m): Maße im Plan prüfen, evtl. ist der Grundriss-Körper größer als der Turmschaft.` })
  }
  return v
}
