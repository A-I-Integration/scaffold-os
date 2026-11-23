'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Invoice } from '@/lib/invoice-pdf';
import { heuteIso, monatsGrenzen, type ZahlungKurz } from '@/lib/faktura-kennzahlen';
import type { EntwurfArt } from '@/lib/rechnung-entwurf';
import { versandJeRechnung, type VersandEintrag } from '@/lib/versand-status';

// Gemeinsame Daten aller Faktura-Bereiche: einmal laden, überall verwenden (keine doppelten Abfragen, keine doppelte Rechnung).

export interface EntwurfKurz { id: string; updated_at: string; customer_name: string; invoice_type: EntwurfArt; netto_vorschau: number | string; customer_id?: string | null; project_id?: string | null }

// Umfang: im Kundenordner nur Rechnungen/Entwürfe/Zahlungen dieses Kunden (und der gewählten Baustelle).
// `rechnungen` kann die Kundenakte schon geladen mitgeben – dann wird nichts doppelt abgefragt.
export interface FakturaUmfang { kundeId: string; projektId?: string | null; rechnungen: Invoice[]; /** zählt hoch, wenn von außen neu geladen werden soll (z. B. nach einem Versand) */ nachladen?: number }

export function useFakturaDaten(umfang?: FakturaUmfang) {
  const hatUmfang = !!umfang;
  const umfangKunde = umfang?.kundeId ?? null;
  const nachladen = umfang?.nachladen ?? 0;
  const heute = useMemo(() => heuteIso(), []);
  const [alleRechnungen, setRechnungen] = useState<Invoice[]>([]);
  const [alleZahlungen, setZahlungenMonat] = useState<ZahlungKurz[]>([]);
  const [alleEntwuerfe, setEntwuerfe] = useState<EntwurfKurz[]>([]);
  const [versandEintraege, setVersandEintraege] = useState<VersandEintrag[]>([]);
  const [versandHinweis, setVersandHinweis] = useState<string | null>(null);
  const [entwurfFehler, setEntwurfFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [stand, setStand] = useState(0);

  const neuLaden = useCallback(() => setStand((s) => s + 1), []);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const { von, bis } = monatsGrenzen(heute);
        const [r, z, e, v] = await Promise.all([
          hatUmfang ? Promise.resolve({ success: true, invoices: [] }) : fetch('/api/invoices').then((x) => x.json()),
          fetch(`/api/invoice-payments?von=${von}&bis=${bis}`).then((x) => x.json()).catch(() => null),
          fetch('/api/invoice-drafts').then((x) => x.json()).catch(() => null),
          fetch(`/api/invoice-dispatches${umfangKunde ? `?customer_id=${encodeURIComponent(umfangKunde)}` : ''}`).then((x) => x.json()).catch(() => null),
        ]);
        if (!aktiv) return;
        if (!r?.success) throw new Error(r?.error || 'Rechnungen konnten nicht geladen werden');
        setRechnungen(r.invoices as Invoice[]);
        setZahlungenMonat(z?.success ? (z.payments as ZahlungKurz[]) : []);
        if (e?.success) { setEntwuerfe(e.entwuerfe as EntwurfKurz[]); setEntwurfFehler(null); }
        else setEntwurfFehler(e?.error || 'Entwürfe konnten nicht geladen werden');
        if (v?.success) { setVersandEintraege(v.eintraege as VersandEintrag[]); setVersandHinweis(null); }
        else setVersandHinweis(v?.error || 'Versandprotokoll konnte nicht geladen werden');
        setFehler(null);
      } catch (err) {
        if (aktiv) setFehler(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        if (aktiv) setLaedt(false);
      }
    })();
    return () => { aktiv = false; };
  }, [heute, stand, hatUmfang, umfangKunde, nachladen]);

  const kundeId = umfang?.kundeId, projektId = umfang?.projektId, mitgegeben = umfang?.rechnungen;
  const rechnungen = useMemo(() => {
    if (!hatUmfang) return alleRechnungen;
    return projektId ? (mitgegeben ?? []).filter((i) => i.project_id === projektId) : (mitgegeben ?? []);
  }, [hatUmfang, alleRechnungen, mitgegeben, projektId]);
  const zahlungenMonat = useMemo(() => {
    if (!hatUmfang) return alleZahlungen;
    const ids = new Set(rechnungen.map((r) => r.id));
    return alleZahlungen.filter((z) => ids.has(z.invoice_id));
  }, [hatUmfang, alleZahlungen, rechnungen]);
  const entwuerfe = useMemo(() => {
    if (!hatUmfang) return alleEntwuerfe;
    return alleEntwuerfe.filter((d) => (projektId ? d.project_id === projektId : d.customer_id === kundeId));
  }, [hatUmfang, alleEntwuerfe, kundeId, projektId]);

  const versandKarte = useMemo(() => versandJeRechnung(versandEintraege), [versandEintraege]);

  return { heute, rechnungen, zahlungenMonat, entwuerfe, setEntwuerfe, versandKarte, versandHinweis, entwurfFehler, setEntwurfFehler, laedt, fehler, neuLaden };
}

export type FakturaDaten = ReturnType<typeof useFakturaDaten>;

export const eur = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
