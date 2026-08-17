// ============================================================
// types/scaffold.ts
// SCAFFOLD OS – Zentrale Typ-Definitionen
// ============================================================
// Diese Datei ist die SINGLE SOURCE OF TRUTH.
// Jede Änderung hier zieht sich durch Engine, API und UI.
// ============================================================

// --- AUFMAß: SCHRITT 1 (Projektdaten) ---

export type TradeType =
  | 'fassade'
  | 'dach'
  | 'kamin'
  | 'werbeanlage'
  | 'fenster'
  | 'allgemein';

// --- AUFMAß: SCHRITT 2 (Gebäude) ---

export type RoofForm =
  | 'flachdach'
  | 'satteldach'
  | 'walmdach'
  | 'pultdach'
  | 'mansardendach'
  | 'kein';

export type FacadeType =
  | 'mauerwerk'
  | 'beton'
  | 'wdvs'
  | 'glas'
  | 'holz'
  | 'metall'
  | 'denkmal';

export interface Obstacle {
  type:
    | 'fenster'
    | 'balkon'
    | 'gaube'
    | 'erker'
    | 'schornstein'
    | 'werbeanlage'
    | 'baum'
    | 'leitung'
    | 'nachbargebaeude'
    | 'sonstiges';
  count: number;
  notes?: string;
}

// --- AUFMAß: SCHRITT 3 (Gerüstplanung) ---

export type ScaffoldType =
  | 'rahmen'
  | 'modul'
  | 'fahrbar'
  | 'hang'
  | 'spezial';

export type DeckingType =
  | 'stahl'
  | 'holz'
  | 'aluminium'
  | 'gitterrost';

export type GroundType =
  | 'beton'
  | 'asphalt'
  | 'pflaster'
  | 'schotter'
  | 'kies'
  | 'erdreich';

// --- AUFMAß: SCHRITT 4 (Sicherheit & Umgebung) ---

export type AnchorType =
  | 'fassadenanker'
  | 'duesenanker'
  | 'dachanker'
  | 'gewichtsanker';

export type GroundCondition =
  | 'beton'
  | 'asphalt'
  | 'pflaster'
  | 'schotter'
  | 'kies'
  | 'erdreich';

export interface EnvironmentFlags {
  hasPowerLines: boolean;
  hasVegetation: boolean;
  hasNeighborProperty: boolean;
  hasPublicTraffic: boolean;
  needsNoParkingZone: boolean;
  needsSpecialUse: boolean;
  hasStorageArea: boolean;
  hasTruckAccess: boolean;
  needsCrane: boolean;
  needsProtectionRoof: boolean;
  needsSafetyNet: boolean;
}

export type WindZone = 1 | 2 | 3 | 4;

export type Hazard =
  | 'hochspannung'
  | 'bahnstrecke'
  | 'oeffentlicher_weg'
  | 'glasfassade'
  | 'denkmalschutz'
  | 'nachbargrundstueck';

// --- HAUPTEINGABE: Komplettes Aufmaß ---

export interface ScaffoldInput {
  // Schritt 1
  customer: string;
  address: string;
  trade: TradeType;
  projectDurationDays: number;

  // Schritt 2
  lengthM: number;
  heightM: number;
  widthM: number;
  eavesHeightM: number;
  roofForm: RoofForm;
  roofOverhangM: number;
  facadeType: FacadeType;
  obstacles: Obstacle[];

  // Schritt 3
  scaffoldType: ScaffoldType;
  deckingType: DeckingType;
  fieldLengthM: number;
  groundType: GroundType;
  manufacturer?: string; // z. B. "Layher Allround (Stahl)" – leer = hersteller-neutral

  // Schritt 4
  anchorType: AnchorType;
  groundCondition: GroundCondition;
  hasSlope: boolean;
  hasLightShafts: boolean;
  hasBasement: boolean;
  needsLoadDistribution: boolean;
  environment: EnvironmentFlags;
  windZone: WindZone;
  hazards: Hazard[];
  additionalNotes: string;
}

// --- AUSGABE: KI-Materialberechnung ---

export interface MaterialItem {
  articleNumber: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  weightKg: number;
  riskLevel: 'low' | 'medium' | 'high';
  aiRecommendation: string;
  alternative?: string;
}

export interface KIAnalysis {
  materialList: MaterialItem[];
  totalMaterialCost: number;
  totalWeightKg: number;
  estimatedLaborHours: number;
  laborCost: number;
  transportCost: number;
  totalCost: number;
  suggestedPrice: number;
  margin: number;
  marginPercent: number;
  riskLevel: 'green' | 'yellow' | 'red';
  warnings: string[];
  tips: string[];
  scaffoldClass: string;
  requiredAnchorCount: number;
  requiredLoadDistributionPlates: number;
}

// --- KI-REGELN ---

export type RuleSeverity = 'info' | 'warning' | 'critical' | 'tip';

export interface KIRuleResult {
  id: string;
  severity: RuleSeverity;
  title: string;
  message: string;
  affectedField?: string;
  suggestedAction?: string;
  costImpact?: number;
  alternative?: string;
  autoApply?: boolean;
}

export interface KIRulesetResult {
  results: KIRuleResult[];
  hasCritical: boolean;
  hasWarnings: boolean;
  totalCostImpact: number;
  autoCorrections: KIRuleResult[];
}

// --- DB: PROJEKT-BERECHNUNG ---

export interface ProjectCalculation {
  id?: string;
  project_id: string;
  created_at?: string;
  input_data: ScaffoldInput;
  result_data: KIAnalysis;
  status: 'draft' | 'confirmed' | 'ordered';
}
export type PartialScaffoldInput = Partial<ScaffoldInput>;