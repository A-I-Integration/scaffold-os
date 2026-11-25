// ============================================================
// SCAFFOLD OS – Baustelle aus dem manuellen Aufmaß-Baukasten
// Baut die Daten, die /api/projects bekommt. Rein und testbar; Schritt 6 liest step2/step3/kiResult.
// ============================================================

import type { BuildingParams, CADModel } from '@/lib/calculations/cad-engine'
import type { MaterialItem } from '@/types/scaffold'
import type { BaukastenEingaben } from '@/lib/cad/manuell-baukasten'

export interface ProjektKosten { laborCost: number; transportCost: number; tripCost: number }

export function baukastenProjekt(a: {
  kunde: { id: string; name: string }
  projektName: string
  adresse: string
  /** Land der Baustelle (leer = Deutschland) */
  land?: string
  building: BuildingParams
  systemId: string
  model: Pick<CADModel, 'totalAreaM2'>
  material: MaterialItem[]
  aufbauStunden: number
  kosten: ProjektKosten
  /** Eingaben der Maske, damit die Baustelle später wieder im Baukasten geöffnet werden kann */
  eingaben?: BaukastenEingaben
}) {
  const { building: b, material } = a
  const preis = Math.round(material.reduce((s, m) => s + m.totalPrice, 0) * 100) / 100
  const gewicht = material.reduce((s, m) => s + m.weightKg * m.quantity, 0)
  const gesamt = Math.round((preis + a.kosten.laborCost + a.kosten.transportCost + a.kosten.tripCost) * 100) / 100
  const ohnePreis = material.filter((m) => !(m.unitPrice > 0)).length
  const kiResult = {
    materialList: material, totalMaterialCost: preis, totalWeightKg: Math.round(gewicht),
    estimatedLaborHours: a.aufbauStunden, laborCost: a.kosten.laborCost, transportCost: a.kosten.transportCost, tripCost: a.kosten.tripCost,
    totalCost: gesamt, suggestedPrice: gesamt, margin: 0, marginPercent: 0, riskLevel: 'green' as const,
    warnings: [
      'Manuell aufgemessen (Baukasten). Preis = Material + Lohn + Transport zu Selbstkosten – vor Versand Marge prüfen.',
      ...(ohnePreis > 0 ? [`${ohnePreis} Position${ohnePreis === 1 ? '' : 'en'} ohne Preis – bitte im Angebot ergänzen.`] : []),
    ],
    tips: [], scaffoldClass: 'Manuelles Aufmaß', requiredAnchorCount: 0, requiredLoadDistributionPlates: 0, totalAreaM2: a.model.totalAreaM2,
    building: b, systemId: a.systemId,
  }
  return {
    name: a.projektName.trim() || `Aufmaß ${a.kunde.name}`, adresse: a.adresse, land: a.land || 'Deutschland', customer_id: a.kunde.id,
    data: {
      step1: { name: a.kunde.name, adresse: a.adresse, land: a.land || 'Deutschland', gewerke: ['allgemein'], dauer: '30' },
      step2: { laenge: String(b.lengthM), breite: String(b.widthM), hoehe: String(b.heightM), traufhoehe: String(b.eavesHeightM), dachform: b.roofForm[0].toUpperCase() + b.roofForm.slice(1), fassade: 'Putz', hindernisse: [], abschnitte: [], dachueberstand: String(b.overhangM), durchfahrt: false },
      step3: { geruesttyp: 'fassade', system: a.systemId, customSystem: '', feldlange: '2.5', belag: 'stahl', gelander: true, diagonale: true, fahrbar: false, boden: 'beton' },
      kiResult, angebotsStatus: 'erstellt',
      ...(a.eingaben ? { baukasten: { eingaben: a.eingaben, systemId: a.systemId } } : {}),
    },
    status: 'active',
  }
}

/** Stände, ab denen das Angebot beim Kunden liegt: der Baukasten ändert dann nichts mehr stillschweigend. */
export const ANGEBOT_GESPERRT = ['versendet', 'gelesen', 'angenommen', 'korrektur', 'abgelehnt']
export const angebotAenderbar = (status: unknown): boolean => !ANGEBOT_GESPERRT.includes(String(status ?? 'erstellt'))

/** Gespeicherten Baukasten-Stand aus den Projektdaten lesen (nur wenn die Baustelle aus dem Baukasten stammt). */
export function leseBaukastenStand(data: unknown): { eingaben: BaukastenEingaben; systemId: string } | null {
  const b = (data as { baukasten?: { eingaben?: BaukastenEingaben; systemId?: string } } | null)?.baukasten
  return b?.eingaben && typeof b.eingaben === 'object' && typeof b.systemId === 'string' ? { eingaben: b.eingaben, systemId: b.systemId } : null
}
