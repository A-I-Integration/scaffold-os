import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const ordner = join(process.cwd(), 'public', 'artikelbilder')
const index = JSON.parse(readFileSync(join(ordner, 'index.json'), 'utf8')) as Record<string, string>
const katalog = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'data', 'layher-katalog.json'), 'utf8')) as { n: string }[]

describe('Artikelbilder', () => {
  it('jeder Eintrag zeigt auf eine vorhandene JPEG-Datei', () => {
    for (const datei of new Set(Object.values(index))) {
      expect(/\.jpg$/.test(datei)).toBe(true)
      expect(existsSync(join(ordner, datei))).toBe(true)
    }
  })
  it('nur Artikel aus dem Layher-Katalog haben ein Bild', () => {
    const nr = new Set(katalog.map((k) => k.n))
    expect(Object.keys(index).filter((a) => !nr.has(a))).toEqual([])
    expect(Object.keys(index).length).toBeGreaterThan(500)
  })
})
