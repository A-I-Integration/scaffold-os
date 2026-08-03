// ============================================================
// lib/calculations/article-prices.ts
// Lädt Artikelpreise aus Supabase (inventory-Tabelle)
// Fallback auf statische Preise, wenn DB leer
// ============================================================

import { createClient } from '@/lib/supabase/server';

export interface ArticleMaster {
  articleNumber: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  weightKg: number;
  riskLevel: 'low' | 'medium' | 'high';
  aiRecommendation: string;
}

// Statischer Fallback (deine aktuellen Preise)
const FALLBACK_PRICES: Record<string, ArticleMaster> = {
  'RA-001': { articleNumber: 'RA-001', name: 'Rahmen 0,73 m', category: 'Rahmen', unit: 'Stk', unitPrice: 45.00, weightKg: 12.5, riskLevel: 'low', aiRecommendation: 'Standard-Rahmen für Feldlänge 2,07 m' },
  'RA-002': { articleNumber: 'RA-002', name: 'Rahmen 1,09 m', category: 'Rahmen', unit: 'Stk', unitPrice: 52.00, weightKg: 15.2, riskLevel: 'low', aiRecommendation: 'Für breitere Felder' },
  'RA-003': { articleNumber: 'RA-003', name: 'Rahmen 1,40 m', category: 'Rahmen', unit: 'Stk', unitPrice: 58.00, weightKg: 18.0, riskLevel: 'low', aiRecommendation: 'Für große Feldlängen' },
  'AB-001': { articleNumber: 'AB-001', name: 'Arbeitsbühne Stahl 2,07 m', category: 'Belag', unit: 'Stk', unitPrice: 85.00, weightKg: 22.0, riskLevel: 'low', aiRecommendation: 'Standard-Arbeitsbühne' },
  'AB-002': { articleNumber: 'AB-002', name: 'Arbeitsbühne Stahl 2,50 m', category: 'Belag', unit: 'Stk', unitPrice: 98.00, weightKg: 26.0, riskLevel: 'low', aiRecommendation: 'Für 2,50 m Feldlänge' },
  'AB-003': { articleNumber: 'AB-003', name: 'Arbeitsbühne Stahl 3,00 m', category: 'Belag', unit: 'Stk', unitPrice: 112.00, weightKg: 31.0, riskLevel: 'low', aiRecommendation: 'Für 3,00 m Feldlänge' },
  'DI-001': { articleNumber: 'DI-001', name: 'Diagonale 2,07 m', category: 'Diagonalen', unit: 'Stk', unitPrice: 28.00, weightKg: 8.5, riskLevel: 'low', aiRecommendation: 'Stabilisierung je Feld' },
  'DI-002': { articleNumber: 'DI-002', name: 'Diagonale 2,50 m', category: 'Diagonalen', unit: 'Stk', unitPrice: 32.00, weightKg: 9.8, riskLevel: 'low', aiRecommendation: 'Stabilisierung für 2,50 m Felder' },
  'DI-003': { articleNumber: 'DI-003', name: 'Diagonale 3,00 m', category: 'Diagonalen', unit: 'Stk', unitPrice: 36.00, weightKg: 11.2, riskLevel: 'low', aiRecommendation: 'Stabilisierung für 3,00 m Felder' },
  'GE-001': { articleNumber: 'GE-001', name: 'Geländer 2,07 m', category: 'Geländer', unit: 'Stk', unitPrice: 35.00, weightKg: 7.2, riskLevel: 'low', aiRecommendation: 'Brüstungsgeländer je Ebene' },
  'GE-002': { articleNumber: 'GE-002', name: 'Geländer 2,50 m', category: 'Geländer', unit: 'Stk', unitPrice: 40.00, weightKg: 8.5, riskLevel: 'low', aiRecommendation: 'Brüstungsgeländer für 2,50 m Felder' },
  'GE-003': { articleNumber: 'GE-003', name: 'Geländer 3,00 m', category: 'Geländer', unit: 'Stk', unitPrice: 45.00, weightKg: 9.8, riskLevel: 'low', aiRecommendation: 'Brüstungsgeländer für 3,00 m Felder' },
  'KU-001': { articleNumber: 'KU-001', name: 'Kupplung Dreh', category: 'Kupplungen', unit: 'Stk', unitPrice: 4.50, weightKg: 0.8, riskLevel: 'low', aiRecommendation: 'Verbindung von Rahmen und Diagonalen' },
  'FP-001': { articleNumber: 'FP-001', name: 'Fußplatte verstellbar', category: 'Fundamente', unit: 'Stk', unitPrice: 18.00, weightKg: 5.5, riskLevel: 'low', aiRecommendation: 'Grundplatte je Standfuß' },
  'KO-001': { articleNumber: 'KO-001', name: 'Konsole 0,73 m', category: 'Konsolen', unit: 'Stk', unitPrice: 32.00, weightKg: 9.0, riskLevel: 'medium', aiRecommendation: 'Für Überstände und Dacharbeiten' },
  'BB-001': { articleNumber: 'BB-001', name: 'Bordbrett 2,07 m', category: 'Bordbretter', unit: 'Stk', unitPrice: 22.00, weightKg: 6.5, riskLevel: 'low', aiRecommendation: 'Seitenschutz / Absturzsicherung' },
  'AN-001': { articleNumber: 'AN-001', name: 'Fassadenanker Standard', category: 'Anker', unit: 'Stk', unitPrice: 15.00, weightKg: 2.5, riskLevel: 'low', aiRecommendation: 'Standard-Fassadenanker' },
  'AN-002': { articleNumber: 'AN-002', name: 'Düsenanker WDVS', category: 'Anker', unit: 'Stk', unitPrice: 28.00, weightKg: 3.2, riskLevel: 'medium', aiRecommendation: 'Für WDVS-Fassaden' },
  'AN-003': { articleNumber: 'AN-003', name: 'Dachanker', category: 'Anker', unit: 'Stk', unitPrice: 35.00, weightKg: 4.0, riskLevel: 'medium', aiRecommendation: 'Für Dachbefestigung' },
  'AN-004': { articleNumber: 'AN-004', name: 'Gewichtsanker', category: 'Anker', unit: 'Stk', unitPrice: 85.00, weightKg: 25.0, riskLevel: 'high', aiRecommendation: 'Nur wenn keine Fassadenbefestigung möglich' },
  'LV-001': { articleNumber: 'LV-001', name: 'Lastverteilplatte', category: 'Fundamente', unit: 'Stk', unitPrice: 45.00, weightKg: 18.0, riskLevel: 'medium', aiRecommendation: 'Bei weichem Untergrund' },
  'SP-001': { articleNumber: 'SP-001', name: 'Spindeltreppe', category: 'Treppen', unit: 'Stk', unitPrice: 450.00, weightKg: 85.0, riskLevel: 'medium', aiRecommendation: 'Zugang je 3–4 Ebenen' },
  'SS-001': { articleNumber: 'SS-001', name: 'Seitenschutznetz 2,07 m', category: 'Sicherheit', unit: 'm²', unitPrice: 3.50, weightKg: 0.4, riskLevel: 'low', aiRecommendation: 'Wind- und Absturzsicherung' },
  'SD-001': { articleNumber: 'SD-001', name: 'Schutzdach', category: 'Sicherheit', unit: 'Stk', unitPrice: 850.00, weightKg: 120.0, riskLevel: 'high', aiRecommendation: 'Bei öffentlichem Verkehrsraum' },
  'FN-001': { articleNumber: 'FN-001', name: 'Fangnetz', category: 'Sicherheit', unit: 'm²', unitPrice: 4.20, weightKg: 0.5, riskLevel: 'medium', aiRecommendation: 'Unterhalb von Brüstungen' },
};

export async function loadArticlePrices(): Promise<Record<string, ArticleMaster>> {
  try {
    const supabase = await createClient();
    
    // Versuche aus inventory-Tabelle zu laden (dein existierendes Lager)
    const { data, error } = await supabase
      .from('inventory')
      .select('article_number, name, category, unit, unit_price, weight_kg, risk_level, ai_recommendation')
      .eq('deleted', false)
      .order('article_number');
    
    if (error || !data || data.length === 0) {
      console.warn('[ArticlePrices] Keine DB-Daten gefunden, verwende Fallback.');
      return FALLBACK_PRICES;
    }
    
    const prices: Record<string, ArticleMaster> = {};
    for (const item of data) {
      prices[item.article_number] = {
        articleNumber: item.article_number,
        name: item.name,
        category: item.category,
        unit: item.unit,
        unitPrice: item.unit_price,
        weightKg: item.weight_kg,
        riskLevel: item.risk_level || 'low',
        aiRecommendation: item.ai_recommendation || '',
      };
    }
    
    return prices;
  } catch (err) {
    console.error('[ArticlePrices] Fehler beim Laden:', err);
    return FALLBACK_PRICES;
  }
}