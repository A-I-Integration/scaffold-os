import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/invoice-pdf', () => ({
  holePdfBase64FuerVersand: vi.fn(),
  fmtDate: (d: string) => `fmt(${d})`,
}));
import { holePdfBase64FuerVersand } from '@/lib/invoice-pdf';
import { versendeRechnung, istGueltigeEmailAdresse, versandMeldung, belegBezeichnung } from '@/lib/rechnung-versand-dienst';

const inv = { id: 'i1', invoice_number: 'RE-2026-0001', customer_name: 'Ahaus', project_id: 'p1', gross_amount: '119', due_date: '2026-12-01' } as never;

beforeEach(() => {
  vi.mocked(holePdfBase64FuerVersand).mockReset();
  vi.restoreAllMocks();
});

describe('versendeRechnung', () => {
  it('sendet mit ZUGFeRD-PDF und gleichen Feldern wie bisher', async () => {
    vi.mocked(holePdfBase64FuerVersand).mockResolvedValue({ pdfBase64: 'PDF', istZugferd: true, projektnummer: 'P-1' });
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', f);
    const erg = await versendeRechnung(inv, ' a@b.de ');
    expect(erg).toEqual({ an: 'a@b.de', istZugferd: true, hinweis: undefined });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(f.mock.calls[0][0]).toBe('/api/email');
    expect(body).toMatchObject({ type: 'rechnung', to: 'a@b.de', projectId: 'p1', invoiceNumber: 'RE-2026-0001', grossAmount: 119, dueDate: 'fmt(2026-12-01)', pdfBase64: 'PDF', projektnummer: 'P-1' });
  });

  it('Rückfall auf normale PDF bleibt erhalten und wird gemeldet', async () => {
    vi.mocked(holePdfBase64FuerVersand).mockResolvedValue({ pdfBase64: 'PDF', istZugferd: false, projektnummer: null, hinweis: 'Ohne E-Rechnung-Daten gesendet' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    const erg = await versendeRechnung(inv, 'a@b.de');
    expect(erg.istZugferd).toBe(false);
    expect(versandMeldung('RE-2026-0001', erg)).toContain('⚠️');
    expect(versandMeldung('RE-2026-0001', erg)).toContain('Ohne E-Rechnung-Daten');
  });

  it('Fehler der Versandroute werden geworfen, nichts bleibt still', async () => {
    vi.mocked(holePdfBase64FuerVersand).mockResolvedValue({ pdfBase64: 'PDF', istZugferd: true, projektnummer: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: 'Projektnummer veraltet' }) }));
    await expect(versendeRechnung(inv, 'a@b.de')).rejects.toThrow('Projektnummer veraltet');
  });

  it('ungültige Adresse: kein Abruf, kein Versand', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(versendeRechnung(inv, 'keine-adresse')).rejects.toThrow('gültige E-Mail');
    expect(holePdfBase64FuerVersand).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it('Optionen überschreiben Projekt, Namen und Fälligkeitstext (Aufmaß-Assistent)', async () => {
    vi.mocked(holePdfBase64FuerVersand).mockResolvedValue({ pdfBase64: 'PDF', istZugferd: true, projektnummer: null });
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
