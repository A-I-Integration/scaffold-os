'use client';

import type { ReactNode } from 'react';
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
