import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { erzeugeRegiebericht, type RegiePdfDaten } from '@/lib/regiebericht-pdf'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const basis: RegiePdfDaten = {
  nummer: 'RB-2026-0007', datum: '2026-11-20', anlass: 'Zusätzliche Verankerung', beschreibung: 'Anker gesetzt auf Wunsch des Bauherrn.\nZweite Zeile.',
  stunden: [{ name: 'Max Muster', stunden: 8, satz: 50 }], material: [{ bezeichnung: 'Ankerbolzen', menge: 10, einheit: 'Stk.', einzelpreis: 3 }],
  fotos: [PNG, PNG], projektName: 'Haus Müller', baustelle: 'Rue de la Gare 1, Luxembourg', kundeName: 'Lux Bau S.A.', firma: { company_name: 'Muster Gerüstbau GmbH' },
}
let pdftotextDa = true
try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }) } catch { pdftotextDa = false }
const text = (pdf: Uint8Array) => { const d = mkdtempSync(join(tmpdir(), 'rb-')); const f = join(d, 'a.pdf'); writeFileSync(f, pdf); return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }) }

describe('Regiebericht-PDF', () => {
  it('erzeugt ein gültiges PDF', async () => {
    const pdf = await erzeugeRegiebericht(basis)
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(2000)
  })
  it.skipIf(!pdftotextDa)('zeigt Nummer, Baustelle, Stunden, Material und Summe', async () => {
    const t = text(await erzeugeRegiebericht(basis))
    for (const s of ['REGIEBERICHT', 'RB-2026-0007', '20.11.2026', 'Haus Müller', 'Lux Bau S.A.', 'Max Muster', 'Ankerbolzen', 'Fotodokumentation', 'Name, Unterschrift Bauherr']) expect(t).toContain(s)
    expect(t).toContain('430,00') // 8 × 50 + 10 × 3
  })
  it.skipIf(!pdftotextDa)('ohne Preise keine Beträge', async () => {
    const t = text(await erzeugeRegiebericht({ ...basis, mitPreisen: false }))
    expect(t).not.toContain('430,00')
    expect(t).not.toContain('Betrag')
    expect(t).toContain('Max Muster')
  })
  it.skipIf(!pdftotextDa)('mit Unterschrift steht der Name statt der Leerzeile', async () => {
    const t = text(await erzeugeRegiebericht({ ...basis, unterschrift: PNG, unterschrieben_von: 'Herr Bauherr', unterschrieben_am: '2026-11-20T10:00:00Z' }))
    expect(t).toContain('Herr Bauherr')
    expect(t).not.toContain('Name, Unterschrift Bauherr')
  })
  it('lange Berichte laufen auf eine zweite Seite ohne Fehler', async () => {
    const stunden = Array.from({ length: 60 }, (_, i) => ({ name: `Mitarbeiter ${i}`, stunden: 1, satz: 40 }))
    const pdf = await erzeugeRegiebericht({ ...basis, stunden, beschreibung: 'Text '.repeat(900) })
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1)
  })
})
