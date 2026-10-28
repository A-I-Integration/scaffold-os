import { describe, it, expect } from 'vitest'
import { sortiereDateien, texturDateiname } from '../obj-mtl-zu-glb'

describe('OBJ-Dateisatz sortieren', () => {
  it('erkennt OBJ, MTL und Bilder unabhängig von Groß-/Kleinschreibung', () => {
    const s = sortiereDateien([{ name: 'Kirche.OBJ' }, { name: 'kirche.mtl' }, { name: 'tex_0.JPG' }, { name: 'tex_1.png' }, { name: 'notizen.txt' }])
    expect(s.obj).toBe(0)
    expect(s.mtl).toBe(1)
    expect(s.bilder).toEqual([2, 3])
    expect(s.andere).toEqual([4])
    expect(s.mehrereObj).toBe(false)
  })
  it('meldet mehrere OBJ-Dateien', () => {
    expect(sortiereDateien([{ name: 'a.obj' }, { name: 'b.obj' }]).mehrereObj).toBe(true)
  })
  it('GLB allein ist keine OBJ-Auswahl', () => {
    const s = sortiereDateien([{ name: 'haus.glb' }])
    expect(s.obj).toBeNull()
    expect(s.andere).toEqual([0])
  })
})

describe('Texturname aus MTL-Pfad', () => {
  it('nimmt nur den Dateinamen, klein geschrieben', () => {
    expect(texturDateiname('C:\\Scans\\Haus\\Fassade_01.JPG')).toBe('fassade_01.jpg')
    expect(texturDateiname('textures/Dach%20neu.png')).toBe('dach neu.png')
    expect(texturDateiname('wand.jpg?x=1')).toBe('wand.jpg')
  })
})
