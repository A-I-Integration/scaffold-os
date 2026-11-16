import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const panel = readFileSync(join(__dirname, '..', 'GelaendeEbenenPanel.tsx'), 'utf8')
const form = readFileSync(join(__dirname, '..', 'BuildingForm.tsx'), 'utf8')

describe('Geländeebenen in der Gebäude-Eingabe', () => {
  it('Panel ist im Gelände-Bereich eingebunden und schreibt Profil und Ebenen in einem Schritt', () => {
    expect(form).toContain('<GelaendeEbenenPanel')
    expect(form).toMatch(/onAnwenden=\{\(pr, e\) => setzeOpt\(\{ gelaendeProfilM:[^}]*gelaendeEbenen:/)
  })
  it('Anwenden ist nur mit gültigen Ebenen möglich; Entfernen setzt beides zurück', () => {
    expect(panel).toContain('disabled={!gueltig}')
    expect(panel).toContain('onAnwenden(undefined, [])')
    expect(panel).toContain('ebenenZuProfil(ebenen, gebaeude)')
  })
})
