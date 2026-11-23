import { describe, it, expect } from 'vitest'
import { generateCADModel, generateAnsicht } from '@/lib/calculations/cad-engine'
import { readFileSync } from 'fs'

const b = { lengthM: 14, widthM: 6, heightM: 8, eavesHeightM: 8, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] } as never

describe('Zeichenebene Treppen in der 2D-Ansicht', () => {
  it('Treppenteile stehen in der Teileliste der Ansicht und fallen bei ausgeblendeter Ebene heraus', () => {
    const m = generateCADModel(b, 'mj-uniconnect')
    const mit = generateAnsicht(m, 'front').elements.filter((e) => e.id.startsWith('teile-') && e.id !== 'teile-titel')
    const ohneM = { ...m, components3D: m.components3D.filter((c) => c.type !== 'stair') }
    const ohne = generateAnsicht(ohneM, 'front').elements.filter((e) => e.id.startsWith('teile-') && e.id !== 'teile-titel')
    const stairNames = new Set(m.components3D.filter((c) => c.type === 'stair' && c.fieldId && !c.extern).map((c) => c.name))
    // Treppenteile mit Feldbezug erscheinen nur mit Treppenebene; andere Zeilen bleiben unverändert
    const treppenZeilen = (l: typeof mit) => l.filter((e) => [...stairNames].some((n) => (e.text ?? '').includes(n.replace(/(\d)\.(\d)/g, '$1,$2'))))
    expect(treppenZeilen(ohne)).toHaveLength(0)
    expect(ohne.length).toBe(mit.length - treppenZeilen(mit).length)
  })
  it('Berechnung bleibt unberührt: das Modell wird nicht verändert', () => {
    const m = generateCADModel(b, 'mj-uniconnect')
    const vorher = JSON.stringify(m)
    generateAnsicht({ ...m, components3D: m.components3D.filter((c) => c.type !== 'stair') }, 'front')
    expect(JSON.stringify(m)).toBe(vorher)
  })
})

describe('Sperre der Gerüst-/Treppenebene: alle Bearbeitungswege geschützt', () => {
  const src = readFileSync('app/cad/page.tsx', 'utf8')
  const handler = [
    'setzeGeruestfeld', 'handlePlacementClick', 'setzeTreppeAufFeld', 'versetzeAutoTreppe', 'setzeLeiterAufFeld', 'setzeDurchstiegAufFeld', 'schiebeTreppe',
    'handleBauteilZiehen', 'handleBauteilLage', 'handleMasseDrehung', 'handleBauteilDuplizieren', 'handleLageOp', 'handleGruppeVerschieben', 'handleGruppeKopieren',
    'handleGruppeEntfernen', 'handleBauteilZuruecksetzen', 'handleRemoveManualPlacement', 'handleRemoveComponent', 'aendereGeruestfeld', 'verschiebeGeruestfeld',
    'loescheGeruestfeld', 'handleReplaceComponent',
  ]
  for (const h of handler) {
    it(`${h} prüft die Sperre als Erstes`, () => {
      const i = src.indexOf(`const ${h} = useCallback(`)
      expect(i).toBeGreaterThan(0)
      expect(src.slice(i, i + 700)).toMatch(/sperre\.(fuer|fuerId)\(/)
    })
  }
  it('Position ändern im Eigenschaftenfenster ist geschützt', () => {
    expect(src).toMatch(/onPositionAendern=\{\(p\) => \{ if \(sperre\.fuer\('beide'\)\) return/)
  })
  it('Zeichenobjekte: Löschen prüft die Sperre (Notiz, Maß, Messung, Figur)', () => {
    expect(src).toMatch(/handleDeleteNote[\s\S]{0,200}darfAendern\('notiz'/)
    expect(src).toMatch(/handleDeleteDimension[\s\S]{0,200}darfAendern\('mass'/)
    expect(src).toMatch(/darfAendern\('mess'/)
    expect(src).toMatch(/darfAendern\('figur'/)
  })
})
