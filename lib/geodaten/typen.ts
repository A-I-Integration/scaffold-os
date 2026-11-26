// ============================================================
// SCAFFOLD OS – Geodaten (Adresse → Gebäude → LoD2): gemeinsame Typen
// Unabhängig von Auswahl-Engine, Raycaster und Gerüstberechnung. Importierte Werte sind VORSCHLÄGE mit Herkunft;
// fehlende Werte bleiben leer (undefined) und werden nie geschätzt.
// ============================================================

export interface GeocodeTreffer {
  text: string
  lat: number
  lon: number
  /** deutscher Landesname laut Geocoder (z. B. "Nordrhein-Westfalen"), falls bekannt */
  bundesland: string | null
  /** wie genau der Treffer ist: Hausnummer / Straße / Ort / unbekannt */
  genauigkeit: 'haus' | 'strasse' | 'ort' | 'unbekannt'
  quelle: string
}

export interface Herkunft {
  provider: string
  quelle: string
  lizenz: string
  attribution: string
  abgerufenAm: string
  /** Quellkoordinatensystem (EPSG-Nummer) */
  epsg: number
  /** Speichern der Rohdaten laut Lizenz erlaubt */
  speichernErlaubt: boolean
}

export interface Georef {
  epsg: number
  /** UTM-Koordinate des lokalen Nullpunkts (Mitte der Grundflächen-Hülle) */
  ursprungOst: number
  ursprungNord: number
}

export type ImportStatus = 'vorschlag' | 'geprueft' | 'freigegeben' | 'verworfen'

export interface ImportKorrektur { feld: string; alt: string | null; neu: string | null; am: string }

export interface GebaeudeImport {
  id: string
  providerObjektId: string
  herkunft: Herkunft
  georef: Georef
  /** Grundfläche in lokalen Metern: x = Ost, z = −Nord (Rückseite/„oben im Grundriss“ = Norden), nicht gedreht */
  fussabdruck: { x: number; z: number }[]
  hoehen: { traufeM?: number; firstM?: number }
  dachForm?: 'flachdach' | 'satteldach' | 'walmdach'
  funktion?: string | null
  grundflaecheM2?: number
  /** Abstand vom gesuchten Punkt zur Grundfläche (m); 0 = Punkt liegt im Gebäude */
  abstandM?: number
  hinweise: string[]
  status: ImportStatus
  korrekturen: ImportKorrektur[]
}

export interface GebaeudeProvider {
  id: string
  bundeslaender: string[]
  lizenz: { name: string; url: string; attribution: string; speichernErlaubt: boolean }
  /** Gebäude im Umkreis; liefert Vorschläge nach Abstand sortiert */
  sucheGebaeude(lat: number, lon: number, radiusM: number): Promise<GebaeudeImport[]>
}
