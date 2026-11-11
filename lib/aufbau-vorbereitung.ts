// Vorbereitung vor dem Aufbau: abhakbare Fragen je Baustelle (eigenes Formular, Ablage in der Baustellenmappe).
// Die Fragen sind eine Arbeitsvorlage. Die App gibt KEINE Grenzwerte, Abstände oder Rechtsfolgen vor und bewertet nichts:
// Der Betrieb beantwortet, trägt ein, was er festgestellt hat, und verantwortet es. Kein KI-Gutachten.

export type VorAntwort = 'ja' | 'nein' | 'nz' | ''

export const VOR_ANTWORT_LABEL: Record<Exclude<VorAntwort, ''>, string> = { ja: 'ja', nein: 'nein', nz: 'nicht zutreffend' }

export interface VorPunkt { key: string; gruppe: string; frage: string }

export const VOR_PUNKTE: VorPunkt[] = [
  { key: 'untergrund', gruppe: 'Untergrund', frage: 'Ist die Tragfähigkeit des Untergrunds geklärt (Rasen, Gehweg, Asphalt, Pflaster)?' },
  { key: 'hohlraeume', gruppe: 'Untergrund', frage: 'Sind Lichtschächte, Tiefgaragendecken oder andere Hohlräume im Aufstellbereich berücksichtigt?' },
  { key: 'gelaende', gruppe: 'Untergrund', frage: 'Ist der Höhenunterschied im Gelände geklärt (Höhenausgleich, gestaffelter Aufbau)?' },
  { key: 'oeffentlich', gruppe: 'Genehmigung', frage: 'Reicht das Gerüst auf öffentlichen Grund (Gehweg, Straße)?' },
  { key: 'sondernutzung', gruppe: 'Genehmigung', frage: 'Ist die Erlaubnis für öffentlichen Grund beantragt bzw. erteilt (inkl. verkehrsrechtlicher Anordnung, falls nötig)?' },
  { key: 'leitungen', gruppe: 'Umgebung', frage: 'Sind Freileitungen oder Oberleitungen in der Nähe geprüft und der Abstand geklärt?' },
  { key: 'fassade', gruppe: 'Fassade und Verankerung', frage: 'Ist der Ankergrund geklärt (z. B. Dämmung, Hohlziegel, Altbau-Mauerwerk)?' },
  { key: 'auszug', gruppe: 'Fassade und Verankerung', frage: 'Sind Auszugsversuche für die Anker vorgesehen bzw. durchgeführt und protokolliert?' },
  { key: 'planen', gruppe: 'Fassade und Verankerung', frage: 'Sind Planen oder Netze vorgesehen – und ist die Verankerung dafür statisch geklärt?' },
  { key: 'unterlagen', gruppe: 'Unterlagen', frage: 'Liegen Aufbau- und Verwendungsanleitung bzw. bei Sonderkonstruktionen die Statik vor?' },
  { key: 'gbu', gruppe: 'Unterlagen', frage: 'Ist die Gefährdungsbeurteilung für diese Baustelle erstellt?' },
  { key: 'psa', gruppe: 'Aufbau', frage: 'Sind Absturzsicherung für den Aufbau und die persönliche Schutzausrüstung vorhanden?' },
]

export interface VorbereitungZeile { antwort: VorAntwort; bemerkung: string }
export interface Vorbereitung {
  datum: string
  ersteller: string
  verantwortlicher_vor_ort: string
  bemerkung: string
  punkte: Record<string, VorbereitungZeile>
  unterschrift?: string
}

export const leereVorbereitung = (heute: string): Vorbereitung => ({
  datum: heute, ersteller: '', verantwortlicher_vor_ort: '', bemerkung: '',
  punkte: Object.fromEntries(VOR_PUNKTE.map((p) => [p.key, { antwort: '' as VorAntwort, bemerkung: '' }])),
})

/** Punkte, die noch nicht beantwortet sind. */
export const unbeantwortet = (v: Vorbereitung): VorPunkt[] => VOR_PUNKTE.filter((p) => !v.punkte[p.key]?.antwort)

/** Punkte mit „nein“: Das sind offene Aufgaben vor dem Aufbau. */
export const offeneAufgaben = (v: Vorbereitung): VorPunkt[] => VOR_PUNKTE.filter((p) => v.punkte[p.key]?.antwort === 'nein')

/** Fehlende Pflichtangaben vor dem Ablegen; leere Liste = vollständig. */
export function vorbereitungFehlt(v: Vorbereitung): string[] {
  const f: string[] = []
  if (!v.datum) f.push('Datum')
  if (!v.ersteller.trim()) f.push('Ersteller')
  const u = unbeantwortet(v)
  if (u.length) f.push(`${u.length} Frage${u.length === 1 ? '' : 'n'} nicht beantwortet`)
  if (!v.unterschrift) f.push('Unterschrift')
  return f
}
