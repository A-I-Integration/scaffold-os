// Der Verschiebe-Griff darf die Kamera-Anpassung nicht beeinflussen (Gerüst verschwand nach dem Setzen einer Treppe).
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
describe('Kamera-Rahmen ohne Bedien-Hilfen', () => {
  const q = fs.readFileSync('components/cad/Scaffold3D.tsx', 'utf8')
  it('AutoFraming und Schatten messen den Inhalt über inhaltBox (ohne TransformControls)', () => {
    expect(q).toContain('function inhaltBox')
    expect(q).toContain('isTransformControlsRoot')
    expect(q.match(/new THREE\.Box3\(\)\.setFromObject\(target, true\)/g)?.length).toBe(1) // nur noch in inhaltBox selbst
  })
})
