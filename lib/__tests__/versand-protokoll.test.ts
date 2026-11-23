import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pdfPruefsumme, baueProtokollZeile, bereinigeFormat } from '@/lib/versand-protokoll';
import { versandZusammenfassung, versandJeRechnung, versandStandFuer, type VersandEintrag } from '@/lib/versand-status';

const e = (o: Partial<VersandEintrag>): VersandEintrag => ({ id: Math.random().toString(), created_at: '2026-11-23T10:00:00Z', invoice_id: 'i1', invoice_number: 'RE-1', kind: 'rechnung', to_email: 'a@b.de', subject: 's', status: 'versendet', ...o });

describe('pdfPruefsumme', () => {
  it('SHA-256 der Dateibytes, mit und ohne data-URI-Anfang gleich', () => {
    const b64 = Buffer.from('Rechnung-PDF-Inhalt').toString('base64');
    const soll = createHash('sha256').update('Rechnung-PDF-Inhalt').digest('hex');
    expect(pdfPruefsumme(b64)).toBe(soll);
    expect(pdfPruefsumme('data:application/pdf;base64,' + b64)).toBe(soll);
  });
  it('leer oder ungültig → null', () => { expect(pdfPruefsumme(undefined)).toBeNull(); expect(pdfPruefsumme('')).toBeNull(); });
});

describe('Protokollzeile', () => {
  it('Mahnung ist immer normale PDF, unbekanntes Format wird verworfen', () => {
    expect(bereinigeFormat('zugferd', 'mahnung')).toBe('pdf');
    expect(bereinigeFormat('zugferd', 'rechnung')).toBe('zugferd');
    expect(bereinigeFormat('xml', 'rechnung')).toBeNull();
  });
  it('Fehler nur bei Fehlschlag, Länge begrenzt', () => {
    const ok = baueProtokollZeile({ invoiceNumber: 'RE-1', kind: 'rechnung', to: 'a@b.de', status: 'versendet', error: 'egal' });
    expect(ok.error).toBeNull();
    const fehl = baueProtokollZeile({ invoiceNumber: 'RE-1', kind: 'rechnung', to: 'a@b.de', status: 'fehlgeschlagen', error: 'x'.repeat(900) });
    expect(fehl.error).toHaveLength(500);
    expect(baueProtokollZeile({ invoiceNumber: 'RE-1', kind: 'rechnung', to: 'a@b.de', status: 'fehlgeschlagen' }).error).toBe('Versand fehlgeschlagen');
  });
});

describe('Versandstand', () => {
  it('nichts protokolliert = keiner (nicht „nicht versendet“)', () => {
    expect(versandZusammenfassung([]).stand).toBe('keiner');
  });
  it('erst Fehler, dann Erfolg = versendet', () => {
    const z = versandZusammenfassung([e({ status: 'fehlgeschlagen', created_at: '2026-11-23T09:00:00Z' }), e({ created_at: '2026-11-23T09:05:00Z' })]);
    expect(z.stand).toBe('versendet'); expect(z.versuche).toBe(2);
  });
  it('erst Erfolg, danach Fehlversuch (z. B. zweiter Versand an andere Adresse) = weiter versendet', () => {
    expect(versandZusammenfassung([e({ created_at: '2026-11-23T09:00:00Z' }), e({ status: 'fehlgeschlagen', created_at: '2026-11-23T10:00:00Z' })]).stand).toBe('versendet');
  });
  it('nur Fehlversuche = fehlgeschlagen; Mahnungen zählen nicht als Rechnungsversand', () => {
    expect(versandZusammenfassung([e({ status: 'fehlgeschlagen' })]).stand).toBe('fehlgeschlagen');
    expect(versandZusammenfassung([e({ kind: 'mahnung' })]).stand).toBe('keiner');
  });
  it('Zuordnung je Rechnung über id, ersatzweise Nummer', () => {
    const karte = versandJeRechnung([e({ invoice_id: 'i1' }), e({ invoice_id: null, invoice_number: 'RE-9', format: 'zugferd' })]);
    expect(versandStandFuer(karte, { id: 'i1', invoice_number: 'RE-1' }).stand).toBe('versendet');
    expect(versandStandFuer(karte, { id: 'x', invoice_number: 'RE-9' }).format).toBe('zugferd');
    expect(versandStandFuer(karte, { id: 'y', invoice_number: 'RE-0' }).stand).toBe('keiner');
  });
});

describe('Anbindung an /api/email', () => {
  const route = readFileSync('app/api/email/route.ts', 'utf8');
  it('protokolliert Erfolg, Fehler und Sperre – nur für Rechnung und Mahnung', () => {
    expect(route).toContain("status: 'versendet'");
    expect(route.match(/status: 'fehlgeschlagen'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toContain("mailType !== 'angebot' && invoiceNumber");
  });
  it('das Protokoll wird nach dem Mailversand geschrieben und beeinflusst die Antwort nicht', () => {
    expect(route.indexOf("status: 'versendet'")).toBeGreaterThan(route.indexOf('gesendet = true'));
  });
});
