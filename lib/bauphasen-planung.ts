// ============================================================
// SCAFFOLD OS – Bauphasen: Lager-Check und Personalvorschlag (reine Logik, ohne Datenbank)
//
// • lagerCheck: größter Bedarf „draußen“ je Artikel (aus den Phasen) gegen den Lagerbestand.
//   Wichtig: Der Bestand ist der aktuelle Lagerbestand; andere Baustellen, die zeitgleich Material brauchen,
//   sind hier NICHT berücksichtigt (das Lager bucht erst bei Annahme/Reservierung).
// • personalVorschlag: je Phase die nötigen Köpfe auf die Einsatztage verteilen (nur Verfügbare, bekannte Gesichter
//   bleiben von Tag zu Tag), aufbauend auf planeTeam.
// ============================================================
import type { BauphasenErgebnis } from '@/lib/bauphasen'
import { planeTeam, type PlanMitarbeiter, type PlanEinsatz, type PlanAbwesenheit } from '@/lib/einsatz-planung'
import { baueLagerIndex, findeLagerartikel, einheitenPassen, type LagerArtikelKurz } from '@/lib/lager-zuordnung'

export interface LagerCheckZeile { artikel: string; name: string; einheit: string; bedarfMax: number; bestand: number | null; fehlt: number; hinweis?: string }

export function lagerCheck(erg: Pick<BauphasenErgebnis, 'lager'>, lager: LagerArtikelKurz[]): LagerCheckZeile[] {
  const spitze = new Map<string, { name: string; einheit: string; max: number }>()
  for (const l of erg.lager) {
    const s = spitze.get(l.artikel) ?? { name: l.name, einheit: l.einheit, max: 0 }
    s.max = Math.max(s.max, l.draussen)
    spitze.set(l.artikel, s)
  }
  const index = baueLagerIndex(lager)
  const aus: LagerCheckZeile[] = []
  for (const [artikel, s] of spitze) {
    if (!(s.max > 0)) continue
    const { artikel: treffer } = findeLagerartikel({ name: s.name, quantity: s.max, articleNumber: artikel, unit: s.einheit }, index)
    if (!treffer) { aus.push({ artikel, name: s.name, einheit: s.einheit, bedarfMax: s.max, bestand: null, fehlt: 0, hinweis: 'nicht im Lager gefunden' }); continue }
    if (!einheitenPassen(s.einheit, treffer.unit)) { aus.push({ artikel, name: s.name, einheit: s.einheit, bedarfMax: s.max, bestand: null, fehlt: 0, hinweis: `Einheit passt nicht (Lager: ${treffer.unit})` }); continue }
    const bestand = Number(treffer.quantity) || 0
    aus.push({ artikel, name: s.name, einheit: s.einheit, bedarfMax: s.max, bestand, fehlt: Math.max(0, Math.round((s.max - bestand) * 100) / 100) })
  }
  return aus.sort((a, b) => b.fehlt - a.fehlt || a.name.localeCompare(b.name, 'de'))
}

export interface PersonalVorschlagTag { datum: string; phaseId: string; ids: string[]; luecke: number }

export function personalVorschlag(erg: Pick<BauphasenErgebnis, 'phasen'>, mitarbeiter: PlanMitarbeiter[], einsaetze: PlanEinsatz[], abwesenheiten: PlanAbwesenheit[]): PersonalVorschlagTag[] {
  const aus: PersonalVorschlagTag[] = []
  // zuerst der Reihe nach; bereits vorgeschlagene Tage zählen als belegt, damit sich Phasen am selben Tag nicht doppeln
  const belegt: PlanEinsatz[] = [...einsaetze]
  for (const ph of erg.phasen) {
    if (ph.einsatzTage.length === 0) continue
    const plan = planeTeam({ tage: ph.einsatzTage, personen: ph.personen, mitarbeiter, einsaetze: belegt, abwesenheiten })
    for (const t of plan) {
      aus.push({ datum: t.datum, phaseId: ph.id, ids: t.ids, luecke: t.luecke })
      for (const id of t.ids) belegt.push({ employee_id: id, einsatz_datum: t.datum, project_id: null })
    }
  }
  return aus
}
