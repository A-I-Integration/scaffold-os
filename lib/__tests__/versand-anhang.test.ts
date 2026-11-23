import { describe, it, expect, vi, beforeEach } from 'vitest';
import { holeVersandAnhang } from '@/lib/invoice-pdf';
import { bereinigeFormat, baueProtokollZeile } from '@/lib/versand-protokoll';

const inv = { id: 'i1', invoice_number: 'RE-1', customer_name: 'K', gross_amount: 119, net_amount: 100, projektnummer: null, positions: [], invoice_date: '2026-11-01' } as never;
beforeEach(() => { vi.restoreAllMocks(); });

describe('holeVersandAnhang (F5, strikt)', () => {
  it('ZUGFeRD: bei Fehler wird geworfen, kein Rückfall auf normale PDF', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: false, error: 'USt-IdNr fehlt' }) }));
    await expect(holeVersandAnhang(inv, 'zugferd')).rejects.toThrow(/USt-IdNr fehlt.*nichts versendet.*Nur PDF/s);
  });
  it('ZUGFeRD: Dienst nicht erreichbar wirft ebenfalls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    await expect(holeVersandAnhang(inv, 'zugferd')).rejects.toThrow('nicht erreichbar');
  });
  it('ZUGFeRD: Erfolg liefert die PDF des Servers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true, pdfBase64: 'ZF', projektnummer: 'P-1' }) }));
    expect(await holeVersandAnhang(inv, 'zugferd')).toEqual({ pdfBase64: 'ZF', projektnummer: 'P-1' });
  });
  it('XRechnung: fehlende Angaben (Leitweg-ID) stoppen mit Einzelheiten', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: false, error: 'Für die XRechnung fehlen Angaben.', details: [{ field: 'LEITWEG_ID', message: 'Leitweg-ID fehlt' }] }) }));
    await expect(holeVersandAnhang(inv, 'xrechnung')).rejects.toThrow(/Leitweg-ID fehlt/);
  });
  it('XRechnung: XML kommt als Base64 mit Umlauten unversehrt, dazu die Lesekopie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true, xml: '<a>Gerüst</a>' }) }));
    const r = await holeVersandAnhang(inv, 'xrechnung');
    expect(Buffer.from(r.xmlBase64!, 'base64').toString('utf8')).toBe('<a>Gerüst</a>');
    expect(r.pdfBase64).toContain('data:application/pdf');
  });
  it('Nur PDF braucht keinen Dienst', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    const r = await holeVersandAnhang(inv, 'pdf');
    expect(r.pdfBase64).toContain('data:application/pdf');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('Versandprotokoll kennt XRechnung', () => {
  it('Format xrechnung bleibt erhalten, unbekannte Werte werden verworfen', () => {
    expect(bereinigeFormat('xrechnung', 'rechnung')).toBe('xrechnung');
    expect(bereinigeFormat('docx', 'rechnung')).toBeNull();
    expect(baueProtokollZeile({ invoiceNumber: 'RE-1', kind: 'rechnung', to: 'a@b.de', status: 'versendet', format: 'xrechnung', pdfBase64: 'WE1M' }).dokument_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
