'use client'

// Liste der im CAD per Klick gewählten Hersteller-Artikel (zusammengefasst mit
// Stückzahl). Reine Anzeige; Preise = MJ-Listenpreise netto, keine Verkaufspreise.

import { useMemo } from 'react'
import { alleMjArtikel } from '@/lib/mj-katalog'
import { artikelLabel } from '@/lib/cad/katalog-zuordnung'

interface Props {
  /** Bauteil-ID → Artikelnummer */
  artikelWahl: Record<string, string>
  liste: string | null
  onZuruecksetzen: () => void
}

export default function KatalogWahlListe({ artikelWahl, liste, onZuruecksetzen }: Props) {
  const zeilen = useMemo(() => {
    const anzahl = new Map<string, number>()
    for (const nr of Object.values(artikelWahl)) anzahl.set(nr, (anzahl.get(nr) ?? 0) + 1)
    const alle = alleMjArtikel()
    return Array.from(anzahl, ([nr, n]) => ({ nr, n, a: alle.find((x) => x.nr === nr && (!liste || x.liste === liste)) ?? alle.find((x) => x.nr === nr) }))
  }, [artikelWahl, liste])
  if (zeilen.length === 0) return null
  const summe = zeilen.reduce((s, z) => s + (z.a?.preis ?? 0) * z.n, 0)
  return (
    <div className='mb-3 bg-white rounded-xl border border-black/5 p-3 text-xs' data-testid='katalog-wahl-liste'>
      <div className='flex items-center justify-between mb-1'>
        <span className='font-semibold text-[#424245] uppercase'>Gewählte Katalog-Artikel</span>
        <button type='button' onClick={onZuruecksetzen} className='text-[#86868b] hover:text-[#1d1d1f]'>zurücksetzen</button>
      </div>
      <ul className='space-y-1'>
        {zeilen.map((z) => (
          <li key={z.nr} className='flex justify-between gap-2'>
            <span>{z.n}× {z.a ? artikelLabel(z.a) : z.nr}</span>
          </li>
        ))}
      </ul>
      <p className='mt-2 text-[#424245]'>Listenpreis netto gesamt: {summe.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</p>
    </div>
  )
}
