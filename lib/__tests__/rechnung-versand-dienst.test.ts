import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/invoice-pdf', () => ({
  holeVersandAnhang: vi.fn(),
  fmtDate: (d: string) => `fmt(${d})`,
}));
import { holeVersandAnhang } from '@/lib/invoice-pdf';
import { versendeRechnung, istGueltigeEmailAdresse, versandMeldung, belegBezeichnung } from '@/lib/rechnung-versand-dienst';

const inv = { id: 'i1', invoice_number: 'RE-2026-0001', customer_name: 'Ahaus', project_id: 'p1', gross_amount: '119', due_date: '2026-12-01' } as never;

beforeEach(() => {
  vi.mocked(holeVersandAnhang).mockReset();
  vi.restoreAllMocks();
});

describe('versendeRechnung', () => {
  it('sendet mit ZUGFeRD-PDF und gleichen Feldern wie bisher', async () => {
    vi.mocked(holeVersandAnhang).mockResolvedValue({ pdfBase64: 'PDF', projektnummer: 'P-1' });
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', f);
    const erg = await versendeRechnung(inv, ' a@b.de ');
    expect(erg).toEqual({ an: 'a@b.de', format: 'zugferd', istZugferd: true });
    expect(vi.mocked(holeVersandAnhang)).toHaveBeenCalledWith(inv, 'zugferd');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(f.mock.calls[0][0]).toBe('/api/email');
    expect(body).toMatchObject({ type: 'rechnung', to: 'a@b.de', projectId: 'p1', invoiceNumber: 'RE-2026-0001', grossAmount: 119, dueDate: 'fmt(2026-12-01)', pdfBase64: 'PDF', projektnummer: 'P-1' });
  });

  it('XRechnung: XML-Anhang und Format gehen mit', async () => {
    vi.mocked(holeVersandAnhang).mockResolvedValue({ pdfBase64: 'PDF', xmlBase64: 'XML', projektnummer: null });
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', f);
    const erg = await versendeRechnung(inv, 'a@b.de', { format: 'xrechnung' });
    expect(erg.format).toBe('xrechnung');
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ format: 'xrechnung', xmlBase64: 'XML', pdfBase64: 'PDF' });
  });

  it('Nur PDF nur auf ausdrückliche Wahl, mit Warnzeichen in der Meldung', async () => {
    vi.mocked(holeVersandAnhang).mockResolvedValue({ pdfBase64: 'PDF', projektnummer: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    const erg = await versendeRechnung(inv, 'a@b.de', { format: 'pdf' });
    expect(erg.istZugferd).toBe(false);
    expect(versandMeldung('RE-2026-0001', erg)).toContain('⚠️');
  });

  it('Kein stiller Rückfall: scheitert die E-Rechnung, wird nichts versendet, der Versuch wird protokolliert', async () => {
    vi.mocked(holeVersandAnhang).mockRejectedValue(new Error('Die E-Rechnung (ZUGFeRD) konnte nicht erstellt werden: USt-IdNr fehlt. Es wurde nichts versendet.'));
    const f = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', f);
    await expect(versendeRechnung(inv, 'a@b.de')).rejects.toThrow('nichts versendet');
    expect(f).toHaveBeenCalledTimes(1);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body).toMatchObject({ type: 'rechnung', invoiceNumber: 'RE-2026-0001', format: 'zugferd' });
    expect(body.vorabFehler).toContain('USt-IdNr');
    expect(body.pdfBase64).toBeUndefined();
  });

  it('Fehler der Versandroute werden geworfen, nichts bleibt still', async () => {
    vi.mocked(holeVersandAnhang).mockResolvedValue({ pdfBase64: 'PDF', projektnummer: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: 'Projektnummer veraltet' }) }));
    await expect(versendeRechnung(inv, 'a@b.de')).rejects.toThrow('Projektnummer veraltet');
  });

  it('ungültige Adresse: kein Abruf, kein Versand', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(versendeRechnung(inv, 'keine-adresse')).rejects.toThrow('gültige E-Mail');
    expect(holeVersandAnhang).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it('Optionen überschreiben Projekt, Namen und Fälligkeitstext (Aufmaß-Assistent)', async () => {
    vi.mocked(holeVersandAnhang).mockResolvedValue({ pdfBase64: 'PDF', projektnummer: null });
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', f);
    await versendeRechnung(inv, 'a@b.de', { projectId: 'p9', projectName: 'Baustelle X', customerName: 'Kunde X', faelligText: '01.12.2026' });
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ projectId: 'p9', projectName: 'Baustelle X', customerName: 'Kunde X', dueDate: '01.12.2026' });
  });
});

describe('Hilfen', () => {
  it('Adressprüfung und Bezeichnung', () => {
    expect(istGueltigeEmailAdresse('a@b.de')).toBe(true);
    expect(istGueltigeEmailAdresse('')).toBe(false);
    expect(istGueltigeEmailAdresse(null)).toBe(false);
    expect(belegBezeichnung('schluss')).toBe('Schlussrechnung');
    expect(belegBezeichnung(undefined)).toBe('Rechnung');
  });
});
