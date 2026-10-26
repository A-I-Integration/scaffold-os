import { describe, it, expect } from 'vitest'
import { pruefeAnhang, sichererName, anhangPfad, groesseText, MAX_BYTES } from '@/lib/rechnung-anhang'

describe('pruefeAnhang', () => {
  it('nimmt erlaubte Typen an und bestimmt den Typ aus der Endung', () => {
    expect(pruefeAnhang({ name: 'Foto.JPG', size: 1000 })).toEqual({ ok: true, name: 'Foto.JPG', mime: 'image/jpeg' })
    expect(pruefeAnhang({ name: 'Mail.eml', size: 10 })).toMatchObject({ ok: true, mime: 'message/rfc822' })
  })
  it('lehnt HTML, SVG, Skripte und Dateien ohne Endung ab', () => {
    for (const n of ['a.html', 'a.svg', 'a.js', 'a.exe', 'datei']) expect(pruefeAnhang({ name: n, size: 10 }).ok).toBe(false)
  })
  it('prüft Größe', () => {
    expect(pruefeAnhang({ name: 'a.pdf', size: 0 }).ok).toBe(false)
    expect(pruefeAnhang({ name: 'a.pdf', size: MAX_BYTES + 1 }).ok).toBe(false)
    expect(pruefeAnhang({ name: 'a.pdf', size: MAX_BYTES }).ok).toBe(true)
    expect(pruefeAnhang({ name: 'a.pdf', size: 'x' }).ok).toBe(false)
  })
})

describe('Namen und Pfade', () => {
  it('säubert Namen', () => {
    expect(sichererName('../../etc/Rechnung März Süd.pdf')).toBe('Rechnung_Marz_Sud.pdf')
    expect(sichererName('..\\x\\y.xlsx')).toBe('y.xlsx')
    expect(sichererName('.hidden.png')).toBe('hidden.png')
  })
  it('baut Pfad unter der Rechnungs-ID', () => {
    expect(anhangPfad('inv1', 'a1', 'Foto 1.png')).toBe('inv1/a1-Foto_1.png')
  })
  it('formatiert Größen', () => {
    expect(groesseText(500)).toBe('500 B')
    expect(groesseText(2048)).toBe('2 KB')
    expect(groesseText(1572864)).toBe('1,5 MB')
  })
})

describe('Videos', () => {
  it('erlaubt Videos bis 50 MB, andere Dateien nur bis 10 MB', () => {
    expect(pruefeAnhang({ name: 'Zugang.mp4', size: 40 * 1024 * 1024 })).toMatchObject({ ok: true, mime: 'video/mp4' })
    expect(pruefeAnhang({ name: 'Zugang.MOV', size: 10 }).ok).toBe(true)
    expect(pruefeAnhang({ name: 'Zugang.mp4', size: 51 * 1024 * 1024 }).ok).toBe(false)
    expect(pruefeAnhang({ name: 'a.pdf', size: 11 * 1024 * 1024 }).ok).toBe(false)
  })
})
