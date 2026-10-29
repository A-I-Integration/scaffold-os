'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// ============================================================
// SCAFFOLD OS – Besucherzähler (Browser-Teil, nur Master-Website)
//
// Meldet bei jedem Seitenwechsel den Pfad an /api/track/besuch.
// Kein Cookie, keine Weitergabe an Dritte. Die Server-Route
// entscheidet, welche Pfade überhaupt gezählt werden.
//
// Eigene Besuche ausschließen: einmal die Startseite mit
// ?zaehler=aus öffnen (merkt sich der Browser), mit ?zaehler=an
// wieder einschalten.
// ============================================================

const SCHALTER = 'scaffold_zaehler_aus';

export default function BesucherZaehler() {
  const pfad = usePathname();

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const z = p.get('zaehler');
      if (z === 'aus') localStorage.setItem(SCHALTER, '1');
      if (z === 'an') localStorage.removeItem(SCHALTER);
      if (localStorage.getItem(SCHALTER)) return;

      const utm = p.get('utm_source') || p.get('ref') || '';
      const daten = JSON.stringify({ pfad, ref: document.referrer, utm });
      fetch('/api/track/besuch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: daten,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Zählen ist nebensächlich
    }
  }, [pfad]);

  return null;
}
