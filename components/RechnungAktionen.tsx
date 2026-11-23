'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Send, Euro, ChevronDown, Pencil, Scissors, FileText, Check, RotateCcw, Trash2, Receipt, Paperclip, Link2, AlertTriangle } from 'lucide-react';

// Aktionsleiste je Rechnung: die häufigen Schritte als beschriftete Knöpfe,
// alles Seltene (korrigieren, E-Rechnung, löschen …) beschriftet im Menü „Mehr“.

type Props = {
  gutschrift: boolean;
  storniert: boolean;
  bezahlt: boolean;
  zugferdLaeuft?: boolean;
  onPdf: () => void;
  onSenden: () => void;
  onZahlung?: () => void;
  onNeueVersion?: () => void;
  onGutschrift?: () => void;
  onTeilabbau?: () => void;
  onZugferd?: () => void;
  onXrechnung?: () => void;
  onBezahltToggle?: () => void;
  onLoeschen?: () => void;
  onAnhang?: () => void;
  onPruefLink?: () => void;
  mahnEintraege?: { key: string; titel: string; hinweis?: string; onClick: () => void }[];
};

const knopf = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors';

export default function RechnungAktionen(p: Props) {
  const [offen, setOffen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!offen) return;
    const zu = () => setOffen(false);
    window.addEventListener('scroll', zu, true);
    window.addEventListener('resize', zu);
    return () => { window.removeEventListener('scroll', zu, true); window.removeEventListener('resize', zu); };
  }, [offen]);

  function oeffne() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      // Auf der Seite mit mehr Platz öffnen; Höhe auf den freien Platz begrenzen (dann scrollt das Menü), nie aus dem Fenster ragen.
      const rand = 8;
      const platzUnten = window.innerHeight - r.bottom - rand;
      const platzOben = r.top - rand;
      const gewuenscht = 420;
      const unten = platzUnten >= Math.min(gewuenscht, platzOben);
      const maxH = Math.max(160, Math.min(gewuenscht, unten ? platzUnten : platzOben));
      const top = unten ? r.bottom + 4 : Math.max(rand, r.top - 4 - maxH);
      // Menü ist 288 px breit: linker Rand bleibt im Fenster
      const right = Math.min(Math.max(rand, window.innerWidth - r.right), Math.max(rand, window.innerWidth - 288 - rand));
      setPos({ top, right, maxH });
    }
    setOffen(true);
  }
  const lauf = (f?: () => void) => () => { setOffen(false); f?.(); };

  const eintraege: { key: string; icon: React.ReactNode; titel: string; hinweis?: string; onClick: () => void; rot?: boolean; trenner?: boolean }[] = [];
  if (!p.storniert && p.onNeueVersion) eintraege.push({ key: 'ver', icon: <Pencil className="h-4 w-4" />, titel: 'Neue Version anlegen', hinweis: 'Positionen ändern. Die alte Rechnung wird storniert.', onClick: p.onNeueVersion });
  if (!p.storniert && !p.gutschrift && p.onGutschrift) eintraege.push({ key: 'gs', icon: <Receipt className="h-4 w-4" />, titel: 'Gutschrift zu dieser Rechnung', hinweis: 'Einen Betrag gutschreiben (z. B. Rabatt, Korrektur).', onClick: p.onGutschrift });
  if (!p.storniert && !p.gutschrift && p.onTeilabbau) eintraege.push({ key: 'ta', icon: <Scissors className="h-4 w-4" />, titel: 'Teilabbau: Rechnung kürzen', hinweis: 'Rechnung anteilig reduzieren, wenn nur ein Teil abgebaut ist.', onClick: p.onTeilabbau });
  if (p.onZugferd) eintraege.push({ key: 'zf', icon: <FileText className="h-4 w-4" />, titel: p.zugferdLaeuft ? 'E-Rechnung wird erstellt …' : 'E-Rechnung (ZUGFeRD) laden', hinweis: 'PDF mit eingebetteter maschinenlesbarer Rechnung.', onClick: p.onZugferd });
  if (p.onXrechnung) eintraege.push({ key: 'xr', icon: <FileText className="h-4 w-4" />, titel: 'XRechnung (XML) laden', hinweis: 'Reine XML-Rechnung, z. B. für Behörden (braucht die Leitweg-ID des Kunden).', onClick: p.onXrechnung });
  if (!p.storniert && !p.gutschrift && p.onBezahltToggle) eintraege.push({ key: 'bz', icon: p.bezahlt ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />, titel: p.bezahlt ? 'Wieder auf „offen“ setzen' : 'Als vollständig bezahlt markieren', hinweis: p.bezahlt ? undefined : 'Ohne Zahlung zu erfassen.', onClick: p.onBezahltToggle });
  if (p.onAnhang) eintraege.push({ key: 'an', icon: <Paperclip className="h-4 w-4" />, titel: 'Dokumente und Anhänge', hinweis: 'Bilder, PDF, Excel, E-Mails an dieser Rechnung verwalten.', onClick: p.onAnhang });
  if (!p.storniert && p.onPruefLink) eintraege.push({ key: 'pl', icon: <Link2 className="h-4 w-4" />, titel: 'Prüflink für den Auftraggeber', hinweis: 'Link erstellen und kopieren (30 Tage gültig).', onClick: p.onPruefLink });
  if (!p.storniert && !p.gutschrift && !p.bezahlt) for (const m of p.mahnEintraege || []) eintraege.push({ key: m.key, icon: <AlertTriangle className="h-4 w-4" />, titel: m.titel, hinweis: m.hinweis, onClick: m.onClick });
  if (p.onLoeschen) eintraege.push({ key: 'del', icon: <Trash2 className="h-4 w-4" />, titel: 'Löschen', hinweis: 'Entfernt die Rechnung endgültig.', onClick: p.onLoeschen, rot: true, trenner: true });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button onClick={p.onPdf} className={`${knopf} bg-black/5 hover:bg-black/10 text-[#1d1d1f]`}><Download className="h-3.5 w-3.5" /> PDF</button>
      <button onClick={p.onSenden} className={`${knopf} bg-blue-600/15 hover:bg-blue-600/30 text-blue-700`}><Send className="h-3.5 w-3.5" /> Senden</button>
      {!p.storniert && !p.gutschrift && !p.bezahlt && p.onZahlung && (
        <button onClick={p.onZahlung} className={`${knopf} bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-800`}><Euro className="h-3.5 w-3.5" /> Zahlung erfassen</button>
      )}
      <button ref={btnRef} onClick={oeffne} aria-haspopup="menu" aria-expanded={offen} className={`${knopf} border border-black/10 bg-white hover:bg-black/5 text-[#1d1d1f]`}>Mehr <ChevronDown className="h-3.5 w-3.5" /></button>
      {offen && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOffen(false)} />
          <div role="menu" style={{ top: pos.top, right: pos.right, maxHeight: pos.maxH }} className="fixed z-50 w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-black/10 bg-white shadow-xl py-1">
            {eintraege.map((e) => (
              <div key={e.key} className={e.trenner ? 'border-t border-black/5 mt-1 pt-1' : ''}>
                <button role="menuitem" onClick={lauf(e.onClick)} className={`w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-black/5 ${e.rot ? 'text-red-600' : 'text-[#1d1d1f]'}`}>
                  <span className="mt-0.5">{e.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{e.titel}</span>
                    {e.hinweis && <span className={`block text-[11px] ${e.rot ? 'text-red-500' : 'text-[#86868b]'}`}>{e.hinweis}</span>}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
