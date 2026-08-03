// ============================================================
// lib/calculations/ki-rules.ts
// SCAFFOLD OS – KI-Regel-Engine
// ============================================================
// Deklarative Regeln für Echtzeit-Validierung.
// Jede Regel ist unabhängig testbar und erweiterbar.
// Füge neue Regeln einfach am Ende des RULES-Arrays hinzu.
// ============================================================

import {
  ScaffoldInput,
  KIRuleResult,
  KIRulesetResult,
} from '@/types/scaffold';

// --- REGEL-DEFINITION ---

interface RuleDefinition {
  id: string;
  name: string;
  check: (input: ScaffoldInput) => KIRuleResult | null;
}

// --- REGEL-ENGINE: ALLE REGELN ---

const RULES: RuleDefinition[] = [
  // ==========================================================
  // REGEL 1: WDVS → Düsenanker erforderlich
  // ==========================================================
  {
    id: 'WDVS-ANKER-001',
    name: 'WDVS-Fassade erfordert Düsenanker',
    check: (input) => {
      if (input.facadeType !== 'wdvs') return null;
      if (input.anchorType === 'duesenanker') return null;

      return {
        id: 'WDVS-ANKER-001',
        severity: 'critical',
        title: 'WDVS-Fassade erkannt',
        message:
          'Bei WDVS-Fassaden sind normale Ringösen nicht zulässig. Wärmebrücken und Dämmstoff-Kompression müssen vermieden werden.',
        affectedField: 'anchorType',
        suggestedAction: 'Wählen Sie Düsenanker (Hilti X-IE 6 oder Fischer Termoz)',
        costImpact: 380,
        alternative:
          'Falls keine Düsenanker möglich: Gewichtsanker mit Abstandhalter (deutlich teurer)',
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 2: Glasfassade → Gewichtsanker
  // ==========================================================
  {
    id: 'GLAS-ANKER-001',
    name: 'Glasfassade erfordert Gewichtsanker',
    check: (input) => {
      if (input.facadeType !== 'glas') return null;
      if (input.anchorType === 'gewichtsanker') return null;

      return {
        id: 'GLAS-ANKER-001',
        severity: 'critical',
        title: 'Glasfassade erkannt',
        message:
          'In Glasfassaden dürfen keine Bohrungen durchgeführt werden. Verankerung ausschließlich über Gewichtsanker oder Konsolen am Dach.',
        affectedField: 'anchorType',
        suggestedAction: 'Wählen Sie Gewichtsanker oder Dachanker',
        costImpact: 1200,
        alternative: 'Dachanker mit Ausleger (falls tragfähiges Dach vorhanden)',
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 3: Windzone 3/4 → Verstärkte Anker
  // ==========================================================
  {
    id: 'WIND-001',
    name: 'Hohe Windzone erfordert verstärkte Maßnahmen',
    check: (input) => {
      if (input.windZone < 3) return null;

      const messages: string[] = [];
      let cost = 0;

      if (input.anchorType === 'fassadenanker') {
        messages.push(
          'Standard-Fassadenanker in Windzone 3/4 nicht ausreichend. Düsenanker oder doppelte Ankerreihe empfohlen.'
        );
        cost += 450;
      }

      if (input.heightM > 15 && input.windZone >= 3) {
        messages.push(
          'Kombination Höhe + Windzone: Gerüstklasse 4 erforderlich. Statik-Nachweis pflicht.'
        );
        cost += 850;
      }

      if (messages.length === 0) return null;

      return {
        id: 'WIND-001',
        severity: 'warning',
        title: `Windzone ${input.windZone} erkannt`,
        message: messages.join(' '),
        affectedField: 'windZone',
        suggestedAction: 'Verstärkte Anker + ggf. Statik-Prüfung einplanen',
        costImpact: cost,
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 4: Höhe > 24m → Statikpflicht
  // ==========================================================
  {
    id: 'HOEHE-001',
    name: 'Höhe über 24m erfordert Statik',
    check: (input) => {
      if (input.heightM <= 24) return null;

      return {
        id: 'HOEHE-001',
        severity: 'critical',
        title: 'Fassadenhöhe über 24 Meter',
        message:
          'Ab 24m Fassadenhöhe ist ein statischer Nachweis für das Gerüst gesetzlich vorgeschrieben (DGUV Regel 113-011).',
        affectedField: 'heightM',
        suggestedAction:
          'Statiker beauftragen – Kalkulation um 1.200–2.500 € erweitern',
        costImpact: 1800,
        alternative: 'Gerüst in zwei Abschnitte teilen (wenn baulich möglich)',
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 5: Denkmalschutz → Genehmigungsvorbehalt
  // ==========================================================
  {
    id: 'DENKMAL-001',
    name: 'Denkmalschutz erfordert Sondergenehmigung',
    check: (input) => {
      if (!input.hazards.includes('denkmalschutz')) return null;

      return {
        id: 'DENKMAL-001',
        severity: 'warning',
        title: 'Denkmalschutzgebiet',
        message:
          'Im Denkmalschutz sind Ankerbohrungen, Schutzdächer und Material oft genehmigungspflichtig. Bauaufsicht und Denkmalbehörde frühzeitig einbeziehen.',
        affectedField: 'hazards',
        suggestedAction: '6–8 Wochen Vorlauf für Genehmigungen einplanen',
        costImpact: 600,
        alternative:
          'Gewichtsanker ohne Fassadenbefestigung (meist genehmigungsfrei)',
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 6: Bahnstrecke → Schutzdach + SiBe
  // ==========================================================
  {
    id: 'BAHN-001',
    name: 'Bahnstrecke erfordert Schutzdach',
    check: (input) => {
      if (!input.hazards.includes('bahnstrecke')) return null;

      const issues: string[] = [];
      let cost = 0;

      if (!input.environment.needsProtectionRoof) {
        issues.push(
          'Schutzdach über Gleisanlagen ist pflicht (Eisenbahn-Bau- und Betriebsordnung).'
        );
        cost += 850;
      }

      issues.push(
        'Sicherheitsbeauftragter (SiBe) für Bahninfrastruktur erforderlich.'
      );
      cost += 450;

      return {
        id: 'BAHN-001',
        severity: 'critical',
        title: 'Bahnstrecke in der Nähe',
        message: issues.join(' '),
        affectedField: 'hazards',
        suggestedAction: 'Schutzdach montieren + SiBe beauftragen',
        costImpact: cost,
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 7: Öffentlicher Weg → Schutzdach prüfen
  // ==========================================================
  {
    id: 'OEFF-001',
    name: 'Öffentlicher Weg erfordert Schutzmaßnahmen',
    check: (input) => {
      if (!input.hazards.includes('oeffentlicher_weg')) return null;
      if (input.environment.needsProtectionRoof) return null;

      return {
        id: 'OEFF-001',
        severity: 'warning',
        title: 'Öffentlicher Verkehrsraum',
        message:
          'Über öffentlichen Gehwegen/Fahrbahnen ist ein Schutzdach oder Fangnetz erforderlich (Unfallverhütungsvorschrift BGV C1).',
        affectedField: 'environment.needsProtectionRoof',
        suggestedAction: 'Schutzdach oder Fangnetz einplanen',
        costImpact: 650,
        alternative:
          'Fangnetz unterhalb des Gerüsts (günstiger, aber weniger Schutz)',
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 8: Hochspannung → Sicherheitsabstand
  // ==========================================================
  {
    id: 'STROM-001',
    name: 'Hochspannung erfordert Sicherheitsabstand',
    check: (input) => {
      if (!input.hazards.includes('hochspannung')) return null;

      return {
        id: 'STROM-001',
        severity: 'critical',
        title: 'Hochspannungsanlage in der Nähe',
        message:
          'Bei Hochspannung (≥ 1.000 V) gelten Mindestabstände: 1–30 kV = 1,5m, 110 kV = 2,5m, 220 kV = 3,5m, 380 kV = 5m. Elektrofachkraft hinzuziehen.',
        affectedField: 'hazards',
        suggestedAction: 'Abstand prüfen + Elektrofachkraft beauftragen',
        costImpact: 350,
        alternative:
          'Isolierte Abdeckung der Leitungen (nur mit Netzbetreiber)',
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 9: Weicher Untergrund → Lastverteilplatten
  // ==========================================================
  {
    id: 'BODEN-001',
    name: 'Weicher Untergrund erfordert Lastverteilung',
    check: (input) => {
      const softGrounds = ['erdreich', 'kies', 'schotter'];
      if (!softGrounds.includes(input.groundCondition)) return null;
      if (input.needsLoadDistribution) return null;

      return {
        id: 'BODEN-001',
        severity: 'warning',
        title: 'Weicher Untergrund erkannt',
        message: `Untergrund "${input.groundCondition}" hat geringe Tragfähigkeit. Lastverteilplatten erforderlich, um Setzungen zu vermeiden.`,
        affectedField: 'needsLoadDistribution',
        suggestedAction: 'Lastverteilplatten aktivieren',
        costImpact: 280,
        alternative: 'Fundamentplatten aus Beton (aufwändiger, aber stabiler)',
        autoApply: true,
      };
    },
  },

  // ==========================================================
  // REGEL 10: Dachüberstand → Konsolen
  // ==========================================================
  {
    id: 'DACH-001',
    name: 'Dachüberstand erfordert Konsolen',
    check: (input) => {
      if (input.roofOverhangM <= 0.3) return null;

      return {
        id: 'DACH-001',
        severity: 'info',
        title: 'Dachüberstand erkannt',
        message: `Dachüberstand von ${input.roofOverhangM}m erkannt. Konsolen erforderlich für Dacharbeiten.`,
        affectedField: 'roofOverhangM',
        suggestedAction: `${Math.ceil(input.roofOverhangM / 0.73)} Konsolen einplanen`,
        costImpact: Math.ceil(input.roofOverhangM / 0.73) * 32,
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 11: Feldlänge > 3m → Statik-Prüfung
  // ==========================================================
  {
    id: 'FELD-001',
    name: 'Große Feldlänge erfordert Prüfung',
    check: (input) => {
      if (input.fieldLengthM <= 3.0) return null;

      return {
        id: 'FELD-001',
        severity: 'warning',
        title: 'Feldlänge über 3 Meter',
        message:
          'Felder > 3m erfordern verstärkte Rahmen und ggf. Zwischenstützen. Standardrahmen nicht ausreichend.',
        affectedField: 'fieldLengthM',
        suggestedAction:
          'Verstärkte Rahmen 1,40m oder Zwischenstützen einplanen',
        costImpact: 220,
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 12: Projekt > 90 Tage → Langzeitmiete
  // ==========================================================
  {
    id: 'DAUER-001',
    name: 'Lange Projektdauer → Miete vs. Kauf',
    check: (input) => {
      if (input.projectDurationDays <= 90) return null;

      return {
        id: 'DAUER-001',
        severity: 'tip',
        title: 'Langzeitprojekt erkannt',
        message: `Projektdauer ${input.projectDurationDays} Tage. Langzeitmiete kann günstiger sein als Tagesmiete.`,
        affectedField: 'projectDurationDays',
        suggestedAction:
          'Langzeitmiete (3–6 Monate) kalkulatorisch prüfen',
        costImpact: -500,
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 13: Hindernisse → Sonderkonstruktionen
  // ==========================================================
  {
    id: 'HIND-001',
    name: 'Hindernisse erfordern Sonderlösungen',
    check: (input) => {
      if (input.obstacles.length === 0) return null;

      const names: Record<string, string> = {
        fenster: 'Fenster',
        balkon: 'Balkone',
        gaube: 'Gauben',
        erker: 'Erker',
        schornstein: 'Schornsteine',
        werbeanlage: 'Werbeanlagen',
        baum: 'Bäume',
        leitung: 'Leitungen',
        nachbargebaeude: 'Nachbargebäude',
      };

      const obstacleNames = input.obstacles
        .map((o) => `${o.count}x ${names[o.type] || o.type}`)
        .join(', ');

      return {
        id: 'HIND-001',
        severity: 'info',
        title: `${input.obstacles.length} Hindernis(se) erkannt`,
        message: `Folgende Hindernisse erfordern Sonderkonstruktionen: ${obstacleNames}`,
        affectedField: 'obstacles',
        suggestedAction:
          'Sonderkonstruktionen in der Kalkulation berücksichtigen',
        costImpact: input.obstacles.length * 150,
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 14: Kran erforderlich → Prüfung
  // ==========================================================
  {
    id: 'KRAN-001',
    name: 'Kraneinsatz prüfen',
    check: (input) => {
      if (!input.environment.needsCrane) return null;

      return {
        id: 'KRAN-001',
        severity: 'info',
        title: 'Kraneinsatz geplant',
        message:
          'Kraneinsatz erkannt. Prüfen Sie Zufahrt, Aufstellfläche und Tragfähigkeit des Untergrunds für den Kran.',
        affectedField: 'environment.needsCrane',
        suggestedAction:
          'Krananbieter beauftragen + Aufstellfläche prüfen',
        costImpact: 850,
        autoApply: false,
      };
    },
  },

  // ==========================================================
  // REGEL 15: Schutzdach ohne öffentlichen Raum → Hinweis
  // ==========================================================
  {
    id: 'SCHUTZ-001',
    name: 'Schutzdach ohne öffentlichen Raum',
    check: (input) => {
      if (!input.environment.needsProtectionRoof) return null;
      if (
        input.hazards.includes('oeffentlicher_weg') ||
        input.hazards.includes('bahnstrecke')
      )
        return null;

      return {
        id: 'SCHUTZ-001',
        severity: 'tip',
        title: 'Schutzdach eingeplant',
        message:
          'Schutzdach ist eingeplant, aber kein öffentlicher Verkehrsraum erkannt. Prüfen Sie, ob es wirklich erforderlich ist.',
        affectedField: 'environment.needsProtectionRoof',
        suggestedAction:
          'Falls nicht erforderlich: Schutzdach entfernen = Einsparung',
        costImpact: -850,
        autoApply: false,
      };
    },
  },
];

// --- ENGINE: ALLE REGELN AUSFÜHREN ---

export function runKIRules(input: ScaffoldInput): KIRulesetResult {
  const results: KIRuleResult[] = [];
  let totalCostImpact = 0;
  const autoCorrections: KIRuleResult[] = [];

  for (const rule of RULES) {
    const result = rule.check(input);
    if (result) {
      results.push(result);
      if (result.costImpact) {
        totalCostImpact += result.costImpact;
      }
      if (result.autoApply) {
        autoCorrections.push(result);
      }
    }
  }

  // Sortierung: critical → warning → info → tip
  const severityOrder = { critical: 0, warning: 1, info: 2, tip: 3 };
  results.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return {
    results,
    hasCritical: results.some((r) => r.severity === 'critical'),
    hasWarnings: results.some((r) => r.severity === 'warning'),
    totalCostImpact,
    autoCorrections,
  };
}

// --- HILFSFUNKTIONEN ---

export function checkRule(
  ruleId: string,
  input: ScaffoldInput
): KIRuleResult | null {
  const rule = RULES.find((r) => r.id === ruleId);
  if (!rule) return null;
  return rule.check(input);
}

export function getCriticalRules(input: ScaffoldInput): KIRuleResult[] {
  return runKIRules(input).results.filter((r) => r.severity === 'critical');
}

export function getRulesForField(
  fieldName: string,
  input: ScaffoldInput
): KIRuleResult[] {
  return runKIRules(input).results.filter((r) => r.affectedField === fieldName);
}