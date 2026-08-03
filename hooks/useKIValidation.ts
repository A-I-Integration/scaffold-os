// ============================================================
// hooks/useKIValidation.ts
// SCAFFOLD OS – KI-Validierungs-Hook
// ============================================================

'use client';

import { useMemo } from 'react';
import { ScaffoldInput, KIRulesetResult } from '@/types/scaffold';
import { runKIRules } from '@/lib/calculations/ki-rules';

export function useKIValidation(
  input: Partial<ScaffoldInput>
): KIRulesetResult | null {
  return useMemo(() => {
    // Prüfe, ob genug Daten vorhanden sind
    const hasMinimumData =
      input.facadeType !== undefined ||
      input.windZone !== undefined ||
      input.heightM !== undefined ||
      input.hazards !== undefined ||
      input.groundCondition !== undefined;

    if (!hasMinimumData) return null;

    // Fehlende Felder mit Defaults auffüllen
    const completeInput: ScaffoldInput = {
      customer: input.customer || '',
      address: input.address || '',
      trade: input.trade || 'allgemein',
      projectDurationDays: input.projectDurationDays || 30,
      lengthM: input.lengthM || 0,
      heightM: input.heightM || 0,
      widthM: input.widthM || 0,
      eavesHeightM: input.eavesHeightM || 0,
      roofForm: input.roofForm || 'flachdach',
      roofOverhangM: input.roofOverhangM || 0,
      facadeType: input.facadeType || 'mauerwerk',
      obstacles: input.obstacles || [],
      scaffoldType: input.scaffoldType || 'rahmen',
      deckingType: input.deckingType || 'stahl',
      fieldLengthM: input.fieldLengthM || 2.07,
      groundType: input.groundType || 'beton',
      anchorType: input.anchorType || 'fassadenanker',
      groundCondition: input.groundCondition || 'beton',
      hasSlope: input.hasSlope || false,
      hasLightShafts: input.hasLightShafts || false,
      hasBasement: input.hasBasement || false,
      needsLoadDistribution: input.needsLoadDistribution || false,
      environment: input.environment || {
        hasPowerLines: false,
        hasVegetation: false,
        hasNeighborProperty: false,
        hasPublicTraffic: false,
        needsNoParkingZone: false,
        needsSpecialUse: false,
        hasStorageArea: false,
        hasTruckAccess: false,
        needsCrane: false,
        needsProtectionRoof: false,
        needsSafetyNet: false,
      },
      windZone: input.windZone || 1,
      hazards: input.hazards || [],
      additionalNotes: input.additionalNotes || '',
    };

    return runKIRules(completeInput);
  }, [input]);
}