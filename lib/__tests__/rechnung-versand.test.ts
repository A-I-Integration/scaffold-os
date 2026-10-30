import { describe, it, expect } from 'vitest'
import { unversendeteRechnungen } from '../rechnung-versand'

describe('unversendeteRechnungen', () => {
  const r = (nr: string, status = 'offen', datum = '2026-10-01') => ({ invoice_number: nr, status, invoice_date: datum })
  it('meldet offene Rechnungen ohne Rechnungs-Mail', () => {
    expect(unversendeteRechnungen([r('RE-1'), r('RE-2')], [{ type: 'rechnung', invoice_number: 'RE-1' }]).map((x) => x.invoice_number)).toEqual(['RE-2'])
  })
  it('ignoriert stornierte und bezahlte Rechnungen', () => {
    expect(unversendeteRechnungen([r('RE-1', 'storniert'), r('RE-2', 'bezahlt'), r('RE-3', 'ueberfaellig')], [])).toHaveLength(1)
  })
  it('zählt nur Mails vom Typ rechnung (nicht Mahnung oder Angebot)', () => {
    expect(unversendeteRechnungen([r('RE-1')], [{ type: 'mahnung', invoice_number: 'RE-1' }, { type: 'angebot', invoice_number: 'RE-1' }])).toHaveLength(1)
  })
  it('sortiert nach Datum, dann Nummer', () => {
    expect(unversendeteRechnungen([r('RE-9', 'offen', '2026-10-05'), r('RE-2', 'offen', '2026-10-02')], []).map((x) => x.invoice_number)).toEqual(['RE-2', 'RE-9'])
  })
  it('leer bei keiner Rechnung', () => { expect(unversendeteRechnungen([], [])).toEqual([]) })
})
