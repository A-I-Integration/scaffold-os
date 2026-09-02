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
