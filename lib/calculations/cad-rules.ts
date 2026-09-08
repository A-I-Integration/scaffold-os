// ============================================================
// lib/calculations/cad-rules.ts
// SCAFFOLD OS – CAD Regel-Engine
// ============================================================

import { BuildingParams } from './cad-engine'
import { GeruestSystem } from './geruest-systeme'

export type RuleSeverity = 'error' | 'warning' | 'info'

export interface CADRule {
  id: string
  severity: RuleSeverity
  title: string
  message: string
  condition: (params: RuleCheckParams) => boolean
  autoFix?: (params: RuleCheckParams) => Partial<BuildingParams> | null
  affectedField?: string
}

export interface RuleCheckParams {
  building: BuildingParams
  system: GeruestSystem | null
  fieldCount: number
  levelCount: number
  totalHeightM: number
  totalLengthM: number
}

export interface RuleCheckResult {
  rule: CADRule
  triggered: boolean
  autoFixApplied?: boolean
  fixedValue?: Partial<BuildingParams>
}

export const CAD_RULES: CADRule[] = [
  {
    id: 'GEO-001',
    severity: 'error',
    title: 'Gebäudelänge ungültig',
    message: 'Die Gebäudelänge muss größer als 0 sein.',
    condition: (p) => p.building.lengthM <= 0,
    affectedField: 'lengthM',
  },
  {
    id: 'GEO-002',
    severity: 'error',
    title: 'Gebäudehöhe ungültig',
    message: 'Die Gebäudehöhe muss größer als 0 sein.',
    condition: (p) => p.building.heightM <= 0,
    affectedField: 'heightM',
  },
  {
    id: 'GEO-003',
    severity: 'error',
    title: 'Gebäudebreite ungültig',
    message: 'Die Gebäudebreite muss größer als 0 sein.',
    condition: (p) => p.building.widthM <= 0,
    affectedField: 'widthM',
  },
  {
    id: 'GEO-004',
    severity: 'warning',
    title: 'Gebäudehöhe > 40m',
    message: 'Bei einer Gebäudehöhe über 40m ist eine statische Prüfung erforderlich.',
    condition: (p) => p.building.heightM > 40,
    affectedField: 'heightM',
  },
  {
    id: 'GEO-005',
    severity: 'warning',
    title: 'Gebäudehöhe > 24m',
    message: 'Bei einer Gebäudehöhe über 24m sind erhöhte Sicherheitsanforderungen zu beachten.',
    condition: (p) => p.building.heightM > 24 && p.building.heightM <= 40,
    affectedField: 'heightM',
  },
  {
    id: 'GEO-006',
    severity: 'warning',
    title: 'Sehr große Gebäudelänge',
    message: 'Bei einer Länge über 50m sollte die Feldaufteilung geprüft werden.',
    condition: (p) => p.building.lengthM > 50,
    affectedField: 'lengthM',
  },
  {
    id: 'SYS-001',
    severity: 'error',
    title: 'Kein Gerüstsystem ausgewählt',
    message: 'Bitte wählen Sie ein Gerüstsystem aus.',
    condition: (p) => p.system === null,
    affectedField: 'systemId',
  },
  {
    id: 'SYS-002',
    severity: 'warning',
    title: 'Feldlänge nicht im System verfügbar',
    message: 'Die gewählte Feldlänge ist für dieses System nicht standardmäßig verfügbar.',
    condition: (p) => {
      if (!p.system) return false
      const avgFieldLength = p.totalLengthM / Math.max(1, p.fieldCount)
      return !p.system.feldlangenM.some((fl) => Math.abs(fl - avgFieldLength) < 0.01)
    },
    affectedField: 'fieldLengthM',
  },
  {
    id: 'SYS-003',
    severity: 'info',
    title: 'Modulsystem empfohlen',
    message: 'Für komplexe Geometrien wird ein Modulsystem (z.B. Layher Allround) empfohlen.',
    condition: (p) => {
      const hasObstacles = p.building.windowCount > 5 || p.building.balconyCount > 0 || p.building.overhangM > 0
      const isRahmen = p.system?.bauart === 'rahmen'
      return hasObstacles && isRahmen
    },
    affectedField: 'systemId',
  },
  {
    id: 'AUF-001',
    severity: 'warning',
    title: 'Zu viele Felder',
    message: 'Bei mehr als 30 Feldern sollte die Stabilität geprüft werden.',
    condition: (p) => p.fieldCount > 30,
    affectedField: 'fieldCount',
  },
  {
    id: 'AUF-002',
    severity: 'warning',
    title: 'Zu viele Lagen',
    message: 'Bei mehr als 15 Lagen sind Zwischenankerungen erforderlich.',
    condition: (p) => p.levelCount > 15,
    affectedField: 'levelCount',
  },
  {
    id: 'AUF-003',
    severity: 'error',
    title: 'Gerüst überschreitet Gebäude',
    message: 'Das Gerüst ist breiter als das Gebäude. Bitte prüfen.',
    condition: (p) => {
      if (!p.system || p.building.widthM <= 0) return false
      const scaffoldWidth = p.system.rahmenBreitenM[0] || 0.73
      const minDistance = 0.3
      return scaffoldWidth + minDistance > p.building.widthM
    },
    affectedField: 'widthM',
  },
  {
    id: 'AUF-004',
    severity: 'warning',
    title: 'Dachüberstand erkannt',
    message: 'Ein Dachüberstand erfordert möglicherweise Konsolen.',
    condition: (p) => p.building.overhangM > 0.3,
    affectedField: 'overhangM',
    autoFix: (p) => ({ overhangM: Math.min(p.building.overhangM, 1.5) }),
  },
  {
    id: 'AUF-005',
    severity: 'info',
    title: 'Fangnetz empfohlen',
    message: 'Bei einer Höhe über 12m wird ein Fangnetz empfohlen.',
    condition: (p) => p.building.heightM > 12,
    affectedField: 'heightM',
  },
  // NEU: Regelausführungs-Grenzen aus der amtlichen Zulassung (Marktvergleich
  // "Wie kommen wir an diese Daten" – DIBt-Zulassung Z-8.1-919 vom 2.11.2022,
  // gültig bis 2.11.2027, "Layher Allround STAR 70" – aktuelle Fassung echt
  // gelesen und mit der Vorgängerversion abgeglichen: Grenzwerte unverändert). WICHTIG: nur die reinen GRENZWERTE der bereits
  // vorab geprüften Standard-Konfiguration – keine eigene Berechnung,
  // keine Übernahme der eigentlichen Bemessungsformeln aus der Zulassung
  // (Federsteifigkeiten, Querschnittswerte usw. bleiben Sache des
  // Statikers). Bewusst NUR für dieses eine System scharf geschaltet,
  // weil nur dafür eine echte Zulassung geprüft wurde – nicht pauschal
  // auf andere Hersteller/Systeme übertragen.
  {
    id: 'REGELAUSFUEHRUNG_GRENZE_LAYHER_ALLROUND',
    severity: 'error',
    title: 'Außerhalb der geprüften Regelausführung',
    message:
      'Diese Planung liegt außerhalb der "Regelausführung" der Zulassung Z-8.1-919 ' +
      '(Layher Allround STAR 70: Feldweite ≤ 3,07 m, Höhe ≤ 24 m über Gelände, Lastklasse ≤ 3, Systembreite 0,73 m). ' +
      'Für diese Konfiguration ist ein Einzel-Standsicherheitsnachweis durch einen Statiker erforderlich. ' +
      '(Zulassung Z-8.1-919 vom 2. November 2022, gültig bis 2. November 2027 – danach bitte erneut die aktuelle Fassung auf dibt.de prüfen.)',
    condition: (p) => {
      if (p.system?.id !== 'layher-allround') return false
      const durchschnFeldweite = p.fieldCount > 0 ? p.totalLengthM / p.fieldCount : 0
      const lastklasse = p.building.lastklasse ?? 3
      return p.totalHeightM > 24 || durchschnFeldweite > 3.07 || lastklasse > 3
    },
  },
  // NEU: Regelausführungs-Grenzen für PERI UP Flex – Zulassung Z-8.22-863
  // (aktuell gültige Fassung: 3. Oktober 2025, gültig bis 3. Oktober 2030;
  // Kernbestimmung "Regelausführung Flex F75" vollständig gelesen in der
  // Vorgängerfassung vom 13.4.2021 – über alle seitherigen Änderungsbescheide
  // hinweg blieben die Grenzwerte selbst unverändert, nur der Bauteilkatalog
  // wurde ergänzt). Andere Grenzwerte als bei Layher: Feldweite ≤3,0 m
  // (nicht 3,07 m), Systembreite 0,75 m (nicht 0,73 m) – bewusst NICHT
  // dieselben Zahlen wie bei Layher verwendet.
  {
    id: 'REGELAUSFUEHRUNG_GRENZE_PERI_UP_FLEX',
    severity: 'error',
    title: 'Außerhalb der geprüften Regelausführung',
    message:
      'Diese Planung liegt außerhalb der "Regelausführung Flex F75" der Zulassung Z-8.22-863 ' +
      '(PERI UP Flex: Feldweite ≤ 3,0 m, Höhe ≤ 24 m über Gelände, Lastklasse ≤ 3, Systembreite 0,75 m). ' +
      'Für diese Konfiguration ist ein Einzel-Standsicherheitsnachweis durch einen Statiker erforderlich. ' +
      '(Zulassung Z-8.22-863 vom 3. Oktober 2025, gültig bis 3. Oktober 2030.)',
    condition: (p) => {
      if (p.system?.id !== 'peri-up-flex') return false
      const durchschnFeldweite = p.fieldCount > 0 ? p.totalLengthM / p.fieldCount : 0
      const lastklasse = p.building.lastklasse ?? 3
      return p.totalHeightM > 24 || durchschnFeldweite > 3.0 || lastklasse > 3
    },
  },
  // NEU: Belag-Lastklassen-Zuordnung aus derselben Zulassung, "Tabelle 6:
  // Zuordnung der Beläge zu den Lastklassen". Das Standard-Stahlboden-Belag
  // (0,32 m, das, was die Planung bei reiner Feldlängen-Auswahl automatisch
  // annimmt) trägt bei größerer Feldweite NICHT mehr die volle Lastklasse –
  // ab Lastklasse ≤3 wird stattdessen der Robustboden (0,61 m) benötigt.
  // Reine Hinweisregel (info), keine automatische Material-Umstellung –
  // die Wahl bleibt bei euch, aber jetzt sichtbar dokumentiert.
  {
    id: 'BELAG_LASTKLASSE_LAYHER_ALLROUND',
    severity: 'info',
    title: 'Belagstyp prüfen (Lastklassen-Zuordnung)',
    message:
      'Nach Zulassung Z-8.1-919, Tabelle 6: Das Standard-Stahlboden 0,32 m trägt bei dieser Feldweite ' +
      'nicht die gewählte Lastklasse (Stahlboden 0,32 m: bis 2,07 m → LK6, 2,57 m → LK5, 3,07 m → LK4). ' +
      'Bitte Feldweite reduzieren oder einen für diese Lastklasse zugelassenen Belag wählen (z.B. Robustboden ' +
      '0,61 m für Lastklasse ≤ 3 bei Feldweiten bis 3,07 m) – siehe Tabelle 6 der Zulassung für weitere Optionen.',
    condition: (p) => {
      if (p.system?.id !== 'layher-allround') return false
      const lastklasse = p.building.lastklasse ?? 3
      const durchschnFeldweite = p.fieldCount > 0 ? p.totalLengthM / p.fieldCount : 0
      // Maximale Lastklasse, die das Standard-Stahlboden 0,32 m bei dieser
      // Feldweite laut Tabelle 6 trägt.
      let maxLastklasseStahlboden = 6
      if (durchschnFeldweite > 2.07) maxLastklasseStahlboden = 5
      if (durchschnFeldweite > 2.57) maxLastklasseStahlboden = 4
      if (durchschnFeldweite > 3.07) maxLastklasseStahlboden = 0 // außerhalb der Tabelle
      return lastklasse > maxLastklasseStahlboden
    },
  },
  // NEU: Belag-Lastklassen-Zuordnung für PERI UP Flex, Tabelle 30 der
  // Zulassung Z-8.22-863 (Standardbelag "Stahlbelag UDG 25") – eigene,
  // andere Werte als bei Layher, bewusst nicht übertragen.
  {
    id: 'BELAG_LASTKLASSE_PERI_UP_FLEX',
    severity: 'info',
    title: 'Belagstyp prüfen (Lastklassen-Zuordnung)',
    message:
      'Nach Zulassung Z-8.22-863, Tabelle 30: Der Standard-Stahlbelag UDG 25 trägt bei dieser Feldweite ' +
      'nicht die gewählte Lastklasse (bis 2,0 m → LK6, 2,5 m → LK5, 3,0 m → LK4). Bitte Feldweite reduzieren ' +
      'oder einen für diese Lastklasse zugelassenen Belag wählen (Tabelle 30 der Zulassung für weitere Optionen).',
    condition: (p) => {
      if (p.system?.id !== 'peri-up-flex') return false
      const lastklasse = p.building.lastklasse ?? 3
      const durchschnFeldweite = p.fieldCount > 0 ? p.totalLengthM / p.fieldCount : 0
      let maxLastklasseStahlbelag = 6
      if (durchschnFeldweite > 2.0) maxLastklasseStahlbelag = 5
      if (durchschnFeldweite > 2.5) maxLastklasseStahlbelag = 4
      if (durchschnFeldweite > 3.0) maxLastklasseStahlbelag = 0
      return lastklasse > maxLastklasseStahlbelag
    },
  },
]

export function checkRules(params: RuleCheckParams): RuleCheckResult[] {
  return CAD_RULES.map((rule) => {
    const triggered = rule.condition(params)
    const result: RuleCheckResult = { rule, triggered }
    if (triggered && rule.autoFix) {
      const fix = rule.autoFix(params)
      if (fix) {
        result.autoFixApplied = true
        result.fixedValue = fix
      }
    }
    return result
  })
}

export function groupRulesBySeverity(results: RuleCheckResult[]) {
  return {
    errors: results.filter((r) => r.triggered && r.rule.severity === 'error'),
    warnings: results.filter((r) => r.triggered && r.rule.severity === 'warning'),
    infos: results.filter((r) => r.triggered && r.rule.severity === 'info'),
  }
}

export function getSeverityIcon(severity: RuleSeverity): string {
  switch (severity) {
    case 'error': return '⛔'
    case 'warning': return '⚠️'
    case 'info': return 'ℹ️'
  }
}

export function getSeverityColor(severity: RuleSeverity): string {
  switch (severity) {
    case 'error': return 'text-red-600 bg-red-50 border-red-200'
    case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200'
    case 'info': return 'text-blue-600 bg-blue-50 border-blue-200'
  }
}

// ============================================================
// PHASE 2: KOLLISIONS-REGELN & STATISCHE PRÜFUNG
// ============================================================

import { CADModel, detectCollisions, performStaticChecks } from './cad-engine'

export interface Phase2RuleResult {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  title: string
  message: string
  affectedComponents?: string[]
  autoFixable?: boolean
}

export function runPhase2Checks(model: CADModel): Phase2RuleResult[] {
  const results: Phase2RuleResult[] = []

  // Kollisionserkennung
  const collisions = detectCollisions(model)
  if (collisions.hasCollision) {
    collisions.collisions.forEach((col, idx) => {
      results.push({
        ruleId: `COL-${idx}`,
        severity: 'error',
        title: 'Bauteilkollision',
        message: col.type === 'component-building'
          ? `Bauteil ${col.componentA} kollidiert mit Gebäude`
          : `Bauteil ${col.componentA} kollidiert mit ${col.componentB} (Abstand: ${(col.distance * 100).toFixed(1)}cm)`,
        affectedComponents: [col.componentA, col.componentB],
        autoFixable: false,
      })
    })
  }

  // Statische Prüfung
  const staticCheck = performStaticChecks(model)
  staticCheck.checks.forEach((check) => {
    if (!check.passed) {
      results.push({
        ruleId: `STAT-${check.name}`,
        severity: check.severity,
        title: check.name,
        message: check.message,
        autoFixable: check.name === 'Standfestigkeit' || check.name === 'Absturzsicherung',
      })
    }
  })

  // Höhenabhängige Regeln
  if (model.building.heightM > 12 && model.components3D.filter(c => c.type === 'net').length === 0) {
    results.push({
      ruleId: 'SAFETY-NET',
      severity: 'warning',
      title: 'Fangnetz fehlt',
      message: `Bei ${model.building.heightM}m Höhe wird ein Fangnetz empfohlen (vorgeschrieben ab 12m)`,
      autoFixable: true,
    })
  }

  // Konsolen bei Überstand
  if (model.building.overhangM > 0.5 && model.components3D.filter(c => c.type === 'console').length === 0) {
    results.push({
      ruleId: 'CONSOLE-NEEDED',
      severity: 'warning',
      title: 'Konsolen erforderlich',
      message: `Dachüberstand ${model.building.overhangM}m erfordert Konsolen zur Abstützung`,
      autoFixable: true,
    })
  }

  // Treppe bei > 3 Lagen
  if (model.levelCount > 3 && model.components3D.filter(c => c.type === 'stair').length === 0) {
    results.push({
      ruleId: 'STAIR-NEEDED',
      severity: 'warning',
      title: 'Treppenzugang fehlt',
      message: `Bei ${model.levelCount} Lagen ist ein Treppenzugang erforderlich`,
      autoFixable: true,
    })
  }

  return results
}
