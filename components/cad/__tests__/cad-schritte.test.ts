import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import CadSchritte from '../CadSchritte'
import CadStart from '../CadStart'
import { erzeugeProjektdatei, liesProjektdatei } from '@/lib/cad/projektdatei'
import type { BuildingParams } from '@/lib/calculations/cad-engine'

const h = vi.fn()
const basis = { wahl: 'auto' as const, seiten: ['front' as const], onWand: h, onAlle: h, onLeer: h }

describe('Schrittleiste', () => {
  it('zeigt die vier Schritte und markiert den aktuellen', () => {
    const html = renderToStaticMarkup(createElement(CadSchritte, { ...basis, schritt: 3, wahl: 'offen' }))
    for (const n of ['Haus', 'Hülle prüfen', 'Gerüst', 'Feinschliff']) expect(html).toContain(n)
    expect(html).toContain('aria-current="step"')
    expect(html).toMatch(/✓ <!-- -->Haus|✓ Haus/)
  })
  it('Schritt 3 bietet vier Wände, alle Seiten und leer starten', () => {
    const html = renderToStaticMarkup(createElement(CadSchritte, { ...basis, schritt: 3, wahl: 'offen' }))
    for (const t of ['Vorderseite komplett bauen', 'Rückseite komplett bauen', 'Links komplett bauen', 'Rechts komplett bauen', 'Alle Seiten bauen', 'Leer starten']) expect(html).toContain(t)
  })
  it('Schritt 4 zeigt je nach Wahl den passenden Hinweis, keine Auswahl mehr', () => {
    const leer = renderToStaticMarkup(createElement(CadSchritte, { ...basis, schritt: 4, wahl: 'leer', seiten: [] }))
    expect(leer).toContain('Leer gestartet')
    expect(leer).not.toContain('komplett bauen')
    const wand = renderToStaticMarkup(createElement(CadSchritte, { ...basis, schritt: 4, seiten: ['left'] }))
    expect(wand).toContain('Gerüst steht (Links)')
  })
})

describe('Startauswahl', () => {
  it('zwei Wege: KI-basiert und Manuell anlegen, Grundriss im manuellen Weg', () => {
    const html = renderToStaticMarkup(createElement(CadStart, { onDateien: h, onGrundriss: h, onZeichnen: h, onRechteck: h }))
    expect(html).toContain('KI-basiert')
    expect(html).toContain('Manuell anlegen')
    expect(html).toContain('Plan oder Bild hochladen')
    expect(html).toContain('Grundriss hochladen')
    expect(html).toContain('Umriss per Klick zeichnen')
  })
})

describe('Projektdatei: ohne Gerüst gestartet', () => {
  const haus = { lengthM: 10, widthM: 8, heightM: 6, eavesHeightM: 6, roofHeightM: 0, roofForm: 'flachdach', floors: 2, floorHeightsM: [3, 3], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] } as BuildingParams
  const statik = {} as never
  it('geruestLeer überlebt Speichern und Laden', () => {
    const d = erzeugeProjektdatei({ building: haus, systemId: 'layher-allround', statikDaten: statik, notizen: [], geruestLeer: true })
    const r = liesProjektdatei(JSON.stringify(d))
    expect(r.ok && r.daten.geruestLeer).toBe(true)
  })
  it('fehlt bei normalen Projekten (ältere Dateien unverändert)', () => {
    const d = erzeugeProjektdatei({ building: haus, systemId: 'layher-allround', statikDaten: statik, notizen: [] })
    expect('geruestLeer' in d).toBe(false)
    const r = liesProjektdatei(JSON.stringify(d))
    expect(r.ok && r.daten.geruestLeer).toBeFalsy()
  })
})
