'use client';

import Link from 'next/link';
import { Settings, Building2, BellRing, Hash } from 'lucide-react';
import { WIN } from '@/components/win/Win';
import { Karte, knopf } from './ui';

// Einstellungen rund um Rechnungen. Geändert wird weiterhin in den Einstellungen (nur Admin); hier steht, was wo liegt und wie es heute geregelt ist.
export default function FakturaEinstellungen() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="faktura-einstellungen">
      <Karte titel="Firmenprofil auf der Rechnung" icon={<Building2 className="h-4 w-4" style={{ color: WIN.akzent }} />}>
        <p className="text-[13px] mb-3" style={{ color: WIN.textGedaempft }}>Anschrift, Steuernummer, USt-IdNr., IBAN, E-Mail und Ansprechpartner (für XRechnung). Bereits gestellte Rechnungen behalten ihren damaligen Firmenstand (GoBD).</p>
        <Link href="/einstellungen" className={knopf} style={{ borderColor: WIN.rand }}><Settings className="h-4 w-4" /> In den Einstellungen öffnen</Link>
      </Karte>
      <Karte titel="Mahnwesen" icon={<BellRing className="h-4 w-4" style={{ color: WIN.akzent }} />}>
        <p className="text-[13px] mb-3" style={{ color: WIN.textGedaempft }}>Verzugszinssatz, Mahnpauschale und Tage bis zur Zahlungserinnerung.</p>
        <Link href="/einstellungen" className={knopf} style={{ borderColor: WIN.rand }}><Settings className="h-4 w-4" /> In den Einstellungen öffnen</Link>
      </Karte>
      <Karte titel="Nummernkreis und Zahlungsziel" icon={<Hash className="h-4 w-4" style={{ color: WIN.akzent }} />} className="lg:col-span-2">
        <ul className="text-[13px] space-y-1" style={{ color: WIN.text }}>
          <li>• Rechnungsnummern werden automatisch fortlaufend vergeben (Format RE-Jahr-Nummer, Gutschriften mit eigenem Präfix). Das lässt sich hier nicht ändern.</li>
          <li>• Zahlungsziel: im Formular „Neue Rechnung“ vorbelegt mit 14 Tagen und dort je Rechnung änderbar.</li>
          <li>• Entwürfe bekommen keine Nummer; sie wird erst beim Anlegen der Rechnung vergeben.</li>
        </ul>
        <p className="text-[12px] mt-3" style={{ color: WIN.textGedaempft }}>Folgt in späteren Bundles: editierbare E-Mail-Vorlagen und einstellbare Zahlungsziele.</p>
      </Karte>
    </div>
  );
}
