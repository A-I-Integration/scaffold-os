// KI-Angebot (Paket 3): Vorab-Kalkulation aus dem Anfrage-Entwurf.
// Reine Logik. Die Mengen und Preise rechnet ausschließlich die feste Berechnung (scaffold-engine); hier wird nur die Eingabe dafür gebaut.
// Vieles, was die Berechnung braucht (System, Belag, Anker, Untergrund, Windzone), nennt ein Kunde am Telefon nie. Dafür gelten die gleichen
// Standardwerte wie in Aufmaß Schritt 6, und JEDE dieser Annahmen wird dem Menschen aufgelistet. Es ist eine Vorab-Kalkulation, kein Angebot.

import type { ScaffoldInput } from '@/types/scaffold'
import { laengeAusFlaeche, umfangRundum, type AnfrageEntwurf } from '@/lib/ki-anfrage'

export interface VorabEingabe { eingabe: ScaffoldInput | null; annahmen: string[]; fehlt: string[] }

const z = (n: number) => String(n).replace('.', ',')

export function baueVorabEingabe(e: AnfrageEntwurf, kundeName: string): VorabEingabe {
  const fehlt: string[] = []
  const hoehe = e.arbeitshoehe_m
  if (!hoehe) fehlt.push(e.traufhoehe_m ? `Arbeitshöhe (nur Traufhöhe ${z(e.traufhoehe_m)} m genannt)` : 'Arbeitshöhe')
  const umfang = umfangRundum(e)
  const laenge = umfang ?? (hoehe ? laengeAusFlaeche(e.flaeche_m2, hoehe) : null)
  if (!laenge) fehlt.push('Länge des Gerüsts (Gebäudelänge und -breite bei „rundum“, oder Fläche)')
  if (fehlt.length || !hoehe || !laenge) return { eingabe: null, annahmen: [], fehlt }

  const annahmen = [
    'Gerüstsystem: Rahmengerüst, herstellerneutral',
    'Belag: Stahl, Feldlänge 2,07 m',
    'Untergrund: Beton, Anker: Fassadenanker',
    'Windzone 1, keine Lastverteilplatten',
    'Fassade: Mauerwerk, Dachform: Flachdach, keine Hindernisse (Erker, Balkone, Gauben)',
    'Keine Gefährdungen angenommen (Freileitung, Bahn, öffentlicher Weg, Nachbargrundstück)',
    e.standzeit_wochen ? `Standzeit: ${z(e.standzeit_wochen)} Wochen (${Math.round(e.standzeit_wochen * 7)} Tage)` : 'Standzeit nicht genannt: 30 Tage angenommen',
    umfang ? `Länge ${z(umfang)} m = Umfang rundum aus den Gebäudemaßen, ohne Abzug für Einfahrt oder Lücken` : `Länge ${z(laenge)} m aus Fläche ÷ Arbeitshöhe`,
    ...(e.besonderheiten.length ? [`Nicht berücksichtigt (nur als Hinweis): ${e.besonderheiten.map((b) => (b.art === 'einfahrt_frei' ? 'Einfahrt freihalten' : 'Treppenaufgang')).join(', ')}`] : []),
  ]
  const eingabe: ScaffoldInput = {
    customer: kundeName, address: [e.strasse, [e.plz, e.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    trade: /fassad/i.test(e.leistung || '') ? 'fassade' : 'allgemein',
    projectDurationDays: e.standzeit_wochen ? Math.round(e.standzeit_wochen * 7) : 30,
    lengthM: laenge, heightM: hoehe, widthM: 0, eavesHeightM: e.traufhoehe_m ?? 0, roofForm: 'flachdach', roofOverhangM: 0, facadeType: 'mauerwerk', obstacles: [],
    scaffoldType: 'rahmen', deckingType: 'stahl', fieldLengthM: 2.07, groundType: 'beton',
    anchorType: 'fassadenanker', groundCondition: 'beton', hasSlope: false, hasLightShafts: false, hasBasement: false, needsLoadDistribution: false,
    environment: { hasPowerLines: false, hasVegetation: false, hasNeighborProperty: false, hasPublicTraffic: false, needsNoParkingZone: false, needsSpecialUse: false, hasStorageArea: false, hasTruckAccess: false, needsCrane: false, needsProtectionRoof: false, needsSafetyNet: false },
    windZone: 1, hazards: [], additionalNotes: '',
  }
  return { eingabe, annahmen, fehlt: [] }
}
