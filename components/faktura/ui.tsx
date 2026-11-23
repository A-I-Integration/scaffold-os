'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { fakturaUrl, type FakturaBereich } from '@/lib/faktura-bereiche';
import { WIN } from '@/components/win/Win';
import type { AnzeigeStatus } from '@/lib/faktura-kennzahlen';

export const STATUS_STIL: Record<AnzeigeStatus, { label: string; bg: string; fg: string }> = {
  offen: { label: 'Offen', bg: '#fff4e5', fg: '#a65300' },
  ueberfaellig: { label: 'Überfällig', bg: '#fde8e8', fg: '#b42318' },
  teilbezahlt: { label: 'Teilbezahlt', bg: '#eef4ff', fg: '#1d4ed8' },
  bezahlt: { label: 'Bezahlt', bg: '#e7f6ec', fg: '#1a7f37' },
  storniert: { label: 'Storniert', bg: '#eeeeee', fg: '#605e5c' },
  gutschrift: { label: 'Gutschrift', bg: '#f3e8ff', fg: '#7e22ce' },
};
export const ART_LABEL: Record<string, string> = { standard: 'Rechnung', abschlag: 'Abschlag', schluss: 'Schlussrechnung', gutschrift: 'Gutschrift' };
export const knopf = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium hover:bg-black/5';
export const kopfZeile = 'text-left text-[12px] uppercase tracking-wide border-y';

export function Kachel({ icon, titel, wert, unten, ton }: { icon: ReactNode; titel: string; wert: string; unten?: ReactNode; ton: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 flex items-start gap-3" style={{ borderColor: WIN.rand }}>
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: ton + '1a', color: ton }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[13px]" style={{ color: WIN.textGedaempft }}>{titel}</p>
        <p className="text-2xl font-bold tabular-nums" style={{ color: WIN.text }}>{wert}</p>
        {unten && <p className="text-[13px] tabular-nums" style={{ color: WIN.textGedaempft }}>{unten}</p>}
      </div>
    </div>
  );
}

export function Karte({ titel, icon, children, className = '' }: { titel: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${className}`} style={{ borderColor: WIN.rand }}>
      <p className="font-semibold mb-3 flex items-center gap-2" style={{ color: WIN.text }}>{icon}{titel}</p>
      {children}
    </div>
  );
}

// Sprung zu einem anderen Bereich: auf der eigenen Seite als Link, im Kundenordner als Knopf (dort gibt es keine eigene Adresse je Bereich).
export type BereichSprung = (bereich: FakturaBereich, extra?: Record<string, string>) => void;
export function BereichLink({ bereich, extra, onBereich, className, style, children }: {
  bereich: FakturaBereich; extra?: Record<string, string>; onBereich?: BereichSprung; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  if (onBereich) return <button type="button" onClick={() => onBereich(bereich, extra)} className={className} style={style}>{children}</button>;
  return <Link href={fakturaUrl(bereich, extra)} className={className} style={style}>{children}</Link>;
}

// Aufklappbarer Themenbereich: Oberbegriff mit kurzer Zusammenfassung; darunter öffnet sich der Inhalt.
// Einmal geöffnet, bleibt der Inhalt im Hintergrund erhalten (verborgen), damit angefangene Eingaben nicht verloren gehen.
export function FakturaThema({ id, titel, untertitel, icon, badge, offen, besucht, onToggle, children }: {
  id: string; titel: string; untertitel?: string; icon?: ReactNode; badge?: number | null; offen: boolean; besucht: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-xl border bg-white overflow-hidden scroll-mt-24" style={{ borderColor: WIN.rand }}>
      <button type="button" onClick={onToggle} aria-expanded={offen} aria-controls={`${id}-inhalt`}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.03]">
        <span style={{ color: WIN.akzent }}>{icon}</span>
        <span className="font-semibold text-[15px]" style={{ color: WIN.text }}>{titel}</span>
        {badge ? <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold text-white" style={{ background: WIN.akzent }}>{badge}</span> : null}
        {untertitel && <span className="text-[13px] truncate" style={{ color: WIN.textGedaempft }}>{untertitel}</span>}
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${offen ? 'rotate-180' : ''}`} style={{ color: WIN.textGedaempft }} />
      </button>
      {(offen || besucht) && (
        <div id={`${id}-inhalt`} hidden={!offen} className="px-4 pb-4 pt-1 border-t" style={{ borderColor: WIN.randHell }}>{children}</div>
      )}
    </section>
  );
}
