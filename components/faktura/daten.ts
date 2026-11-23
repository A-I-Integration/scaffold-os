'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Invoice } from '@/lib/invoice-pdf';
import { heuteIso, monatsGrenzen, type ZahlungKurz } from '@/lib/faktura-kennzahlen';
import type { EntwurfArt } from '@/lib/rechnung-entwurf';

// Gemeinsame Daten aller Faktura-Bereiche: einmal laden, überall verwenden (keine doppelten Abfragen, keine doppelte Rechnung).

export interface EntwurfKurz { id: string; updated_at: string; customer_name: string; invoice_type: EntwurfArt; netto_vorschau: number | string }

export function useFakturaDaten() {
  const heute = useMemo(() => heuteIso(), []);
  const [rechnungen, setRechnungen] = useState<Invoice[]>([]);
  const [zahlungenMonat, setZahlungenMonat] = useState<ZahlungKurz[]>([]);
  const [entwuerfe, setEntwuerfe] = useState<EntwurfKurz[]>([]);
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
        const [r, z, e] = await Promise.all([
          fetch('/api/invoices').then((x) => x.json()),
          fetch(`/api/invoice-payments?von=${von}&bis=${bis}`).then((x) => x.json()).catch(() => null),
          fetch('/api/invoice-drafts').then((x) => x.json()).catch(() => null),
        ]);
        if (!aktiv) return;
        if (!r?.success) throw new Error(r?.error || 'Rechnungen konnten nicht geladen werden');
        setRechnungen(r.invoices as Invoice[]);
        setZahlungenMonat(z?.success ? (z.payments as ZahlungKurz[]) : []);
        if (e?.success) { setEntwuerfe(e.entwuerfe as EntwurfKurz[]); setEntwurfFehler(null); }
        else setEntwurfFehler(e?.error || 'Entwürfe konnten nicht geladen werden');
        setFehler(null);
      } catch (err) {
        if (aktiv) setFehler(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        if (aktiv) setLaedt(false);
      }
    })();
    return () => { aktiv = false; };
  }, [heute, stand]);

  return { heute, rechnungen, zahlungenMonat, entwuerfe, setEntwuerfe, entwurfFehler, setEntwurfFehler, laedt, fehler, neuLaden };
}

export type FakturaDaten = ReturnType<typeof useFakturaDaten>;

export const eur = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
