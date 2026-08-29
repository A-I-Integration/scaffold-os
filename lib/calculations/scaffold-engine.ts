// ============================================================
// lib/calculations/scaffold-engine.ts
// SCAFFOLD OS – KI-Materialberechnungs-Engine
// ============================================================
// Eingabe: ScaffoldInput (Aufmaß-Daten)
// Ausgabe: KIAnalysis (Materialliste + Kosten + Risiko)
// ============================================================

import {
  ScaffoldInput,
  MaterialItem,
  KIAnalysis,
  ScaffoldType,
} from '@/types/scaffold';

// --- ARTIKEL-DATENBANK ---
// Später kann dies aus Supabase inventory-Tabelle kommen.
// Aktuell statisch, aber zentral verwaltet.

const ARTICLE_DB: Record<
  string,
  Omit<MaterialItem, 'quantity' | 'totalPrice'>
> = {
  'RA-001': {
    articleNumber: 'RA-001',
    name: 'Rahmen 0,73 m',
    category: 'Rahmen',
    unit: 'Stk',
    unitPrice: 45.0,
    weightKg: 12.5,
    riskLevel: 'low',
    aiRecommendation: 'Standard-Rahmen für Feldlänge 2,07 m',
  },
  'RA-002': {
    articleNumber: 'RA-002',
    name: 'Rahmen 1,09 m',
    category: 'Rahmen',
    unit: 'Stk',
    unitPrice: 52.0,
    weightKg: 15.2,
    riskLevel: 'low',
    aiRecommendation: 'Für breitere Felder oder Hindernisumgehung',
  },
  'RA-003': {
    articleNumber: 'RA-003',
    name: 'Rahmen 1,40 m',
    category: 'Rahmen',
    unit: 'Stk',
    unitPrice: 58.0,
    weightKg: 18.0,
    riskLevel: 'low',
    aiRecommendation: 'Für große Feldlängen oder breite Durchgänge',
  },
  'AB-001': {
    articleNumber: 'AB-001',
    name: 'Arbeitsbühne Stahl 2,07 m',
    category: 'Belag',
    unit: 'Stk',
    unitPrice: 85.0,
    weightKg: 22.0,
    riskLevel: 'low',
    aiRecommendation: 'Standard-Arbeitsbühne',
  },
  'AB-002': {
    articleNumber: 'AB-002',
    name: 'Arbeitsbühne Stahl 2,50 m',
    category: 'Belag',
    unit: 'Stk',
    unitPrice: 98.0,
    weightKg: 26.0,
    riskLevel: 'low',
    aiRecommendation: 'Für 2,50 m Feldlänge',
  },
  'AB-003': {
    articleNumber: 'AB-003',
    name: 'Arbeitsbühne Stahl 3,00 m',
    category: 'Belag',
    unit: 'Stk',
    unitPrice: 112.0,
    weightKg: 31.0,
    riskLevel: 'low',
    aiRecommendation: 'Für 3,00 m Feldlänge',
  },
  'DI-001': {
    articleNumber: 'DI-001',
    name: 'Diagonale 2,07 m',
    category: 'Diagonalen',
    unit: 'Stk',
    unitPrice: 28.0,
    weightKg: 8.5,
    riskLevel: 'low',
    aiRecommendation: 'Stabilisierung je Feld',
  },
  'DI-002': {
    articleNumber: 'DI-002',
    name: 'Diagonale 2,50 m',
    category: 'Diagonalen',
    unit: 'Stk',
    unitPrice: 32.0,
    weightKg: 9.8,
    riskLevel: 'low',
    aiRecommendation: 'Stabilisierung für 2,50 m Felder',
  },
  'DI-003': {
    articleNumber: 'DI-003',
    name: 'Diagonale 3,00 m',
    category: 'Diagonalen',
    unit: 'Stk',
    unitPrice: 36.0,
    weightKg: 11.2,
    riskLevel: 'low',
    aiRecommendation: 'Stabilisierung für 3,00 m Felder',
  },
  'GE-001': {
    articleNumber: 'GE-001',
    name: 'Geländer 2,07 m',
    category: 'Geländer',
    unit: 'Stk',
    unitPrice: 35.0,
    weightKg: 7.2,
    riskLevel: 'low',
    aiRecommendation: 'Brüstungsgeländer je Ebene',
  },
  'GE-002': {
    articleNumber: 'GE-002',
    name: 'Geländer 2,50 m',
    category: 'Geländer',
    unit: 'Stk',
    unitPrice: 40.0,
    weightKg: 8.5,
    riskLevel: 'low',
    aiRecommendation: 'Brüstungsgeländer für 2,50 m Felder',
  },
  'GE-003': {
    articleNumber: 'GE-003',
    name: 'Geländer 3,00 m',
    category: 'Geländer',
    unit: 'Stk',
    unitPrice: 45.0,
    weightKg: 9.8,
    riskLevel: 'low',
    aiRecommendation: 'Brüstungsgeländer für 3,00 m Felder',
  },
  'KU-001': {
    articleNumber: 'KU-001',
    name: 'Kupplung Dreh',
    category: 'Kupplungen',
    unit: 'Stk',
    unitPrice: 4.5,
    weightKg: 0.8,
    riskLevel: 'low',
    aiRecommendation: 'Verbindung von Rahmen und Diagonalen',
  },
  'KU-002': {
    articleNumber: 'KU-002',
    name: 'Kupplung Fest',
    category: 'Kupplungen',
    unit: 'Stk',
    unitPrice: 3.8,
    weightKg: 0.7,
    riskLevel: 'low',
    aiRecommendation: 'Festverbindung',
  },
  'FP-001': {
    articleNumber: 'FP-001',
    name: 'Fußplatte verstellbar',
    category: 'Fundamente',
    unit: 'Stk',
    unitPrice: 18.0,
    weightKg: 5.5,
    riskLevel: 'low',
    aiRecommendation: 'Grundplatte je Standfuß',
  },
  'KO-001': {
    articleNumber: 'KO-001',
    name: 'Konsole 0,73 m',
    category: 'Konsolen',
    unit: 'Stk',
    unitPrice: 32.0,
    weightKg: 9.0,
    riskLevel: 'medium',
    aiRecommendation: 'Für Überstände und Dacharbeiten',
  },
  'BB-001': {
    articleNumber: 'BB-001',
    name: 'Bordbrett 2,07 m',
    category: 'Bordbretter',
    unit: 'Stk',
    unitPrice: 22.0,
    weightKg: 6.5,
    riskLevel: 'low',
    aiRecommendation: 'Seitenschutz / Absturzsicherung',
  },
  'AN-001': {
    articleNumber: 'AN-001',
    name: 'Fassadenanker Standard',
    category: 'Anker',
    unit: 'Stk',
    unitPrice: 15.0,
    weightKg: 2.5,
    riskLevel: 'low',
    aiRecommendation: 'Standard-Fassadenanker',
  },
  'AN-002': {
    articleNumber: 'AN-002',
    name: 'Düsenanker WDVS',
    category: 'Anker',
    unit: 'Stk',
    unitPrice: 28.0,
    weightKg: 3.2,
    riskLevel: 'medium',
    aiRecommendation: 'Für WDVS-Fassaden – kein Wärmebrückenrisiko',
  },
  'AN-003': {
    articleNumber: 'AN-003',
    name: 'Dachanker',
    category: 'Anker',
    unit: 'Stk',
    unitPrice: 35.0,
    weightKg: 4.0,
    riskLevel: 'medium',
    aiRecommendation: 'Für Dachbefestigung',
  },
  'AN-004': {
    articleNumber: 'AN-004',
    name: 'Gewichtsanker',
    category: 'Anker',
    unit: 'Stk',
    unitPrice: 85.0,
    weightKg: 25.0,
    riskLevel: 'high',
    aiRecommendation: 'Nur wenn keine Fassadenbefestigung möglich',
  },
  'LV-001': {
    articleNumber: 'LV-001',
    name: 'Lastverteilplatte',
    category: 'Fundamente',
    unit: 'Stk',
    unitPrice: 45.0,
    weightKg: 18.0,
    riskLevel: 'medium',
    aiRecommendation: 'Bei weichem Untergrund oder hohen Lasten',
  },
  'SP-001': {
    articleNumber: 'SP-001',
    name: 'Spindeltreppe',
    category: 'Treppen',
    unit: 'Stk',
    unitPrice: 450.0,
    weightKg: 85.0,
    riskLevel: 'medium',
    aiRecommendation: 'Zugang je 3–4 Ebenen',
  },
  'SS-001': {
    articleNumber: 'SS-001',
    name: 'Seitenschutznetz 2,07 m',
    category: 'Sicherheit',
    unit: 'm²',
    unitPrice: 3.5,
    weightKg: 0.4,
    riskLevel: 'low',
    aiRecommendation: 'Wind- und Absturzsicherung',
  },
  'SD-001': {
    articleNumber: 'SD-001',
    name: 'Schutzdach',
    category: 'Sicherheit',
    unit: 'Stk',
    unitPrice: 850.0,
    weightKg: 120.0,
    riskLevel: 'high',
    aiRecommendation: 'Bei öffentlichem Verkehrsraum oder Bahnstrecke',
  },
  'FN-001': {
    articleNumber: 'FN-001',
    name: 'Fangnetz',
    category: 'Sicherheit',
    unit: 'm²',
    unitPrice: 4.2,
    weightKg: 0.5,
    riskLevel: 'medium',
    aiRecommendation: 'Unterhalb von Brüstungen',
  },
};

// --- HILFSFUNKTIONEN ---

function getFrameHeight(scaffoldType: ScaffoldType): number {
  switch (scaffoldType) {
    case 'rahmen':
      return 2.0;
    case 'modul':
      return 1.5;
    case 'fahrbar':
      return 1.8;
    case 'hang':
      return 2.0;
    case 'spezial':
      return 2.0;
    default:
      return 2.0;
  }
}

function determineScaffoldClass(input: ScaffoldInput): string {
  const { heightM, trade, windZone, facadeType } = input;
  let loadClass = 2;

  if (trade === 'werbeanlage' || trade === 'kamin') loadClass = 3;
  if (heightM > 24) loadClass = 4;
  if (heightM > 40) loadClass = 5;
  if (windZone >= 3 && heightM > 15) loadClass = 4;
  if (facadeType === 'glas') loadClass = 5;

  return `Gerüstklasse ${loadClass} (${
    loadClass === 2
      ? '200'
      : loadClass === 3
      ? '300'
      : loadClass === 4
      ? '400'
      : '500'
  } kg/m²)`;
}

function determineAnchorType(input: ScaffoldInput): {
  type: string;
  article: string;
  count: number;
  reason: string;
} {
  const { facadeType, anchorType, heightM, windZone } = input;
  let article = 'AN-001';
  let reason = 'Standard-Fassadenanker ausreichend';

  if (facadeType === 'wdvs') {
    article = 'AN-002';
    reason = 'WDVS erkannt: Düsenanker erforderlich (kein Wärmebrückenrisiko)';
  } else if (facadeType === 'glas') {
    article = 'AN-004';
    reason = 'Glasfassade: Gewichtsanker erforderlich – keine Bohrungen in Fassade';
  } else if (anchorType === 'dachanker') {
    article = 'AN-003';
    reason = 'Dachanker gewählt – Dachbefestigung';
  } else if (heightM > 20 || windZone >= 3) {
    article = 'AN-002';
    reason = 'Höhe > 20m oder Windzone 3/4: Verstärkte Anker erforderlich';
  }

  const fields = Math.ceil(input.lengthM / input.fieldLengthM);
  const levels = Math.ceil(input.heightM / getFrameHeight(input.scaffoldType));
  const count = Math.max(4, Math.ceil((fields * levels) / 3));

  return {
    type:
      article === 'AN-001'
        ? 'Fassadenanker'
        : article === 'AN-002'
        ? 'Düsenanker'
        : article === 'AN-003'
        ? 'Dachanker'
        : 'Gewichtsanker',
    article,
    count,
    reason,
  };
}

// --- HAUPTBERECHNUNG ---

// Kalkulations-Grundlagen – kommen aus den Firmeneinstellungen
// (company_settings.calc_*). Alles optional: Ohne Einstellung gelten
// die bisherigen Standardwerte (Rückwärtskompatibel).
export interface CostSettings {
  hourlyRate?: number;    // Stundensatz €/h (Standard 65)
  hoursPerSqm?: number;   // Montagestunden pro m² (Standard 2,0)
  transportPerKg?: number;// Transport €/kg (Standard 0,80)
  transportMin?: number;  // Transport-Mindestpauschale € (Standard 250)
  tripFlat?: number;      // Fahrtkosten-Pauschale € pro Baustelle (Standard 0 = aus)
  permitLow?: number;     // Genehmigung bis 12 m (Standard 250)
  permitHigh?: number;    // Genehmigung über 12 m (Standard 450)
  craneDay?: number;      // Kran-Tagessatz (Standard 850)
}

export function calculateScaffoldMaterial(
  input: ScaffoldInput,
  articlePrices?: Record<string, Omit<MaterialItem, 'quantity' | 'totalPrice'>>,
  costs?: CostSettings
): KIAnalysis {
  const warnings: string[] = [];
  const tips: string[] = [];

  // 1. BASIS-GEOMETRIE
  const frameHeight = getFrameHeight(input.scaffoldType);
  const levels = Math.ceil(input.heightM / frameHeight);
  const fields = Math.ceil(input.lengthM / input.fieldLengthM);
  const scaffoldArea = input.lengthM * input.heightM;

  // 2. RAHMEN
  const framesPerField = 2;
  const totalFrames = fields * levels * framesPerField;
  let frameArticle = 'RA-001';
  if (input.fieldLengthM >= 2.5) frameArticle = 'RA-002';
  if (input.fieldLengthM >= 3.0) frameArticle = 'RA-003';

  // 3. ARBEITSBÜHNEN
  const totalDecks = fields * levels;
  let deckArticle = 'AB-001';
  if (input.fieldLengthM >= 2.5) deckArticle = 'AB-002';
  if (input.fieldLengthM >= 3.0) deckArticle = 'AB-003';

  // 4. DIAGONALEN
  const totalDiagonals = fields * levels * 2;
  let diagonalArticle = 'DI-001';
  if (input.fieldLengthM >= 2.5) diagonalArticle = 'DI-002';
  if (input.fieldLengthM >= 3.0) diagonalArticle = 'DI-003';

  // 5. GELÄNDER
  const totalRailings = fields * levels * 2;
  let railingArticle = 'GE-001';
  if (input.fieldLengthM >= 2.5) railingArticle = 'GE-002';
  if (input.fieldLengthM >= 3.0) railingArticle = 'GE-003';

  // 6. KUPPLUNGEN
  const totalCouplings = fields * levels * 4;

  // 7. FUßPLATTEN
  const totalFootPlates = totalFrames;

  // 8. KONSOLEN
  let totalConsoles = 0;
  if (input.roofOverhangM > 0.3) {
    totalConsoles = Math.ceil(fields * (input.roofOverhangM / 0.73));
    warnings.push(
      `Dachüberstand ${input.roofOverhangM}m erkannt – Konsolen erforderlich`
    );
  }

  // 9. BORDBRETTER
  const totalBoards = fields * levels;

  // 10. ANKER
  const anchorInfo = determineAnchorType(input);
  const totalAnchors = anchorInfo.count;
  if (input.facadeType === 'wdvs') {
    warnings.push(anchorInfo.reason);
    tips.push('WDVS-Fassade: Prüfen Sie Dämmstoff-Dicke vor Ankerwahl');
  }

  // 11. LASTVERTEILPLATTEN
  let totalLoadPlates = 0;
  if (
    input.needsLoadDistribution ||
    input.groundCondition === 'erdreich' ||
    input.groundCondition === 'kies'
  ) {
    totalLoadPlates = Math.ceil(totalFootPlates * 0.5);
    warnings.push('Weicher Untergrund – Lastverteilplatten empfohlen');
  }

  // 12. TREPPEN
  const totalStairs = Math.max(1, Math.ceil(levels / 3));

  // 13. SEITENSCHUTZ
  const sideProtectionArea = input.lengthM * input.heightM;

  // 14. SCHUTZDACH
  let protectionRoofCount = 0;
  if (
    input.environment.needsProtectionRoof ||
    input.hazards.includes('bahnstrecke') ||
    input.hazards.includes('oeffentlicher_weg')
  ) {
    protectionRoofCount = Math.max(1, Math.ceil(input.lengthM / 6));
    warnings.push(
      `Schutzdach erforderlich: ${
        input.hazards.includes('bahnstrecke')
          ? 'Bahnstrecke'
          : 'Öffentlicher Verkehrsraum'
      }`
    );
  }

  // 15. FANGNETZ
  let safetyNetArea = 0;
  if (input.environment.needsSafetyNet || input.heightM > 12) {
    safetyNetArea = sideProtectionArea * 0.3;
    tips.push('Fangnetz empfohlen bei Höhe > 12m');
  }

  // --- MATERIAL-LISTE ZUSAMMENSTELLEN ---
  const materialList: MaterialItem[] = [];
  
  // ⭐ NEU: DB-Preise haben Vorrang vor Fallback
  const db = articlePrices || ARTICLE_DB;
  
  function addItem(articleKey: string, quantity: number) {
    const article = db[articleKey];   // ← GEÄNDERT: db statt ARTICLE_DB
    if (!article) return;
    materialList.push({
      ...article,
      quantity,
      totalPrice: Math.round(quantity * article.unitPrice * 100) / 100,
    });
  }

  addItem(frameArticle, totalFrames);
  addItem(deckArticle, totalDecks);
  addItem(diagonalArticle, totalDiagonals);
  addItem(railingArticle, totalRailings);
  addItem('KU-001', totalCouplings);
  addItem('FP-001', totalFootPlates);
  if (totalConsoles > 0) addItem('KO-001', totalConsoles);
  addItem('BB-001', totalBoards);
  addItem(anchorInfo.article, totalAnchors);
  if (totalLoadPlates > 0) addItem('LV-001', totalLoadPlates);
  addItem('SP-001', totalStairs);
  addItem('SS-001', Math.ceil(sideProtectionArea));
  if (protectionRoofCount > 0) addItem('SD-001', protectionRoofCount);
  if (safetyNetArea > 0) addItem('FN-001', Math.ceil(safetyNetArea));

  // --- KOSTENBERECHNUNG ---
  const totalMaterialCost = materialList.reduce(
    (sum, item) => sum + item.totalPrice,
    0
  );
  const totalWeightKg = materialList.reduce(
    (sum, item) => sum + item.weightKg * item.quantity,
    0
  );

  // Lohn: Stunden/m² × Stundensatz – aus den Einstellungen, Standard 2,0 h/m² × 65 €/h
  const estimatedLaborHours = Math.ceil(scaffoldArea * (costs?.hoursPerSqm ?? 2.0));
  const laborCost = estimatedLaborHours * (costs?.hourlyRate ?? 65);

  // Transport: €/kg mit Mindestpauschale – aus den Einstellungen, Standard 0,80 €/kg mind. 250 €
  const transportCost = Math.max(
    costs?.transportMin ?? 250,
    Math.ceil(totalWeightKg * (costs?.transportPerKg ?? 0.8))
  );

  // Fahrtkosten-Pauschale (Sprit + Fuhrpark-Nutzung) – nur wenn in den Einstellungen gesetzt
  const tripCost = costs?.tripFlat && costs.tripFlat > 0 ? costs.tripFlat : 0;

  // Genehmigungen & Sonstiges – aus den Einstellungen
  const permitCost = input.heightM > 12 ? (costs?.permitHigh ?? 450) : (costs?.permitLow ?? 250);
  const craneCost = input.environment.needsCrane ? (costs?.craneDay ?? 850) : 0;

  const totalCost =
    totalMaterialCost + laborCost + transportCost + tripCost + permitCost + craneCost;

  // Preisempfehlung mit 25% Marge
  const suggestedPrice = Math.ceil(totalCost / 0.75);
  const margin = suggestedPrice - totalCost;
  const marginPercent = Math.round((margin / suggestedPrice) * 100);

  // RISIKO-AMPEL
  let riskLevel: 'green' | 'yellow' | 'red' = 'green';
  if (
    input.heightM > 24 ||
    input.windZone >= 3 ||
    input.hazards.includes('hochspannung') ||
    input.hazards.includes('bahnstrecke')
  ) {
    riskLevel = 'red';
  } else if (
    input.heightM > 12 ||
    input.facadeType === 'wdvs' ||
    input.facadeType === 'glas' ||
    input.hazards.length > 0
  ) {
    riskLevel = 'yellow';
  }

  // Zusätzliche Warnungen
  if (input.heightM > 24)
    warnings.push('Fassadenhöhe über 24m – Statik prüfen lassen!');
  if (input.windZone >= 3)
    warnings.push(
      `Windzone ${input.windZone} erkannt – erhöhte Anforderungen an Verankerung`
    );
  if (input.facadeType === 'glas')
    warnings.push('Glasfassade: Besondere Vorsichtsmaßnahmen erforderlich');
  if (input.hazards.includes('denkmalschutz'))
    warnings.push('Denkmalschutz: Genehmigungsverfahren einplanen');

  // Tipps
  if (input.obstacles.length > 0) {
    tips.push(
      `${input.obstacles.length} Hindernis(se) erkannt – Sonderkonstruktionen budgetieren`
    );
  }
  if (input.projectDurationDays > 90) {
    tips.push('Projektdauer > 90 Tage – Langzeitmiete prüfen');
  }

  return {
    materialList,
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    estimatedLaborHours,
    laborCost: Math.round(laborCost * 100) / 100,
    transportCost: Math.round(transportCost * 100) / 100,
    tripCost: Math.round(tripCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    suggestedPrice: Math.round(suggestedPrice * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    marginPercent,
    riskLevel,
    warnings,
    tips,
    scaffoldClass: determineScaffoldClass(input),
    requiredAnchorCount: totalAnchors,
    requiredLoadDistributionPlates: totalLoadPlates,
  };
}