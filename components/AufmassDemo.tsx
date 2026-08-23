'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList, Ruler, Building2, ShieldCheck, Package, FileCheck2,
  ArrowLeft, ArrowRight, Check, Sparkles,
} from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Aufmaß-Demo (Marketing)
//
// Durchklickbare Schritt-für-Schritt-Show auf der Startseite.
// Zeigt den echten 6-Schritte-Aufmaß-Ablauf der App mit
// festen Beispieldaten – ohne Login, ohne Backend.
// Besucher klicken sich durch und sehen am Ende das Ergebnis.
// ============================================================

const SCHRITTE = [
  { icon: ClipboardList, titel: 'Projekt anlegen' },
  { icon: Ruler, titel: 'Maße erfassen' },
  { icon: Building2, titel: 'Gerüsttyp & Aufbau' },
  { icon: ShieldCheck, titel: 'Sicherheit & Umgebung' },
  { icon: Package, titel: 'Material & Termine' },
  { icon: FileCheck2, titel: 'Angebot fertig' },
];

function Feld({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="bg-[#f5f5f7] rounded-xl px-4 py-3">
      <p className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">{label}</p>
      <p className="text-[15px] text-[#1d1d1f] font-medium mt-0.5">{wert}</p>
    </div>
  );
}

function Checkzeile({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[15px] text-[#1d1d1f]">
      <span className="w-5 h-5 rounded-full bg-[#e8590c]/10 flex items-center justify-center shrink-0">
        <Check className="w-3 h-3 text-[#e8590c]" strokeWidth={3} />
      </span>
      {text}
    </div>
  );
}

function SchrittInhalt({ schritt }: { schritt: number }) {
  switch (schritt) {
    case 0:
      return (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Feld label="Kunde" wert="Musterbau GmbH" />
            <Feld label="Baustelle" wert="Musterstraße 12, 60311 Frankfurt" />
            <Feld label="Ansprechpartner" wert="Herr Mayer · +49 171 2345678" />
            <Feld label="Standzeit" wert="4 Wochen" />
          </div>
          <p className="text-[13px] text-[#86868b] pt-1">
            Kundendaten einmal erfassen – sie fließen automatisch in Angebot und Rechnung.
          </p>
        </div>
      );
    case 1:
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Feld label="Länge" wert="20 m" />
            <Feld label="Höhe" wert="8 m" />
            <Feld label="Breite" wert="2,5 m" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Feld label="Dachform" wert="Satteldach · Überstand 0,5 m" />
            <Feld label="Fassadenmaterial" wert="Klinker" />
          </div>
          <Checkzeile text="Hauseingang bleibt frei (Gitterträger geplant)" />
          <Checkzeile text="Fluchtwege berücksichtigt" />
        </div>
      );
    case 2:
      return (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Feld label="Gerüsttyp" wert="Fassadengerüst" />
            <Feld label="System / Hersteller" wert="Layher Allround" />
            <Feld label="Belagtyp" wert="Holzbelag" />
            <Feld label="Standard-Feldlänge" wert="2,57 m" />
          </div>
          <Checkzeile text="Diagonale Aussteifung ab 6 m Höhe empfohlen" />
          <Checkzeile text="Aufbau nach DIN EN 12811-1" />
        </div>
      );
    case 3:
      return (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Feld label="Ankerung" wert="Ja · Abstand 2,00 m" />
            <Feld label="Untergrund" wert="Asphalt · tragfähig" />
          </div>
          <Checkzeile text="Schutzdach über dem Hauseingang" />
          <Checkzeile text="Hinweis: Anlieferung nur Mo–Fr ab 7 Uhr" />
        </div>
      );
    case 4:
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-black/10 overflow-hidden">
            <div className="bg-[#f5f5f7] px-4 py-2 text-[12px] font-semibold text-[#6e6e73] flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#e8590c]" />
              Automatische Material-Schätzung
            </div>
            {[
              ['Stahlrahmen 2,00 m', '90 Stk'],
              ['Holzbelag 3,07 m', '240 Stk'],
              ['Gerüstanker 40 cm', '180 Stk'],
              ['Schutznetz 3 × 10 m', '25 Stk'],
            ].map(([name, menge]) => (
              <div key={name} className="flex justify-between px-4 py-2.5 text-[14px] border-t border-black/5">
                <span className="text-[#1d1d1f]">{name}</span>
                <span className="font-semibold text-[#1d1d1f]">{menge}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Feld label="Liefertermin" wert="Mo, 24.08." />
            <Feld label="Abholtermin" wert="Mo, 21.09." />
          </div>
        </div>
      );
    default:
      return (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#1d1d1f] text-white p-5 text-center">
            <p className="text-[12px] uppercase tracking-widest text-white/60">Gerüstfläche</p>
            <p className="text-3xl font-semibold mt-1">160 m²</p>
            <p className="text-[12px] uppercase tracking-widest text-white/60 mt-4">Angebotssumme (netto)</p>
            <p className="text-3xl font-semibold text-[#ff922b] mt-1">4.890 €</p>
          </div>
          <Checkzeile text="Angebot als PDF erstellt – bereit zum Versand" />
          <Checkzeile text="Digitale Unterschrift & QR-Code für den Kunden" />
          <Checkzeile text="Material automatisch im Lager reserviert" />
        </div>
      );
  }
}

export default function AufmassDemo() {
  const [schritt, setSchritt] = useState(0);
  const istLetzter = schritt === SCHRITTE.length - 1;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_16px_60px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* Fensterleiste */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-black/5 bg-[#fbfbfd]">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[13px] font-medium text-[#6e6e73]">
            SCAFFOLD OS · Aufmaß – Schritt {schritt + 1} von 6
          </span>
        </div>

        {/* Schritt-Pills */}
        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
          {SCHRITTE.map((s, i) => (
            <button
              key={s.titel}
              onClick={() => setSchritt(i)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                i === schritt
                  ? 'bg-[#e8590c] text-white'
                  : i < schritt
                    ? 'bg-[#e8590c]/10 text-[#e8590c]'
                    : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'
              }`}
            >
              {i + 1}. {s.titel}
            </button>
          ))}
        </div>

        {/* Inhalt */}
        <div className="px-5 py-5 min-h-[320px]">
          <div className="flex items-center gap-3 mb-4">
            {(() => {
              const Icon = SCHRITTE[schritt].icon;
              return <Icon className="w-6 h-6 text-[#e8590c]" strokeWidth={1.5} />;
            })()}
            <h3 className="text-lg font-semibold tracking-tight text-[#1d1d1f]">
              {SCHRITTE[schritt].titel}
            </h3>
          </div>
          <SchrittInhalt schritt={schritt} />
        </div>

        {/* Fortschritt + Navigation */}
        <div className="px-5 pb-5">
          <div className="h-1.5 bg-[#f5f5f7] rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-[#e8590c] rounded-full transition-all duration-300"
              style={{ width: `${((schritt + 1) / SCHRITTE.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSchritt((s) => Math.max(0, s - 1))}
              disabled={schritt === 0}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Zurück
            </button>
            {istLetzter ? (
              <Link
                href="/kaufen"
                className="inline-flex items-center gap-2 bg-[#e8590c] hover:bg-[#d9480f] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors"
              >
                So einfach geht's – jetzt selbst testen <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button
                onClick={() => setSchritt((s) => Math.min(SCHRITTE.length - 1, s + 1))}
                className="inline-flex items-center gap-1.5 bg-[#e8590c] hover:bg-[#d9480f] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors"
              >
                Weiter <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-center text-[13px] text-[#86868b] mt-4">
        Beispieldaten · In der echten Anwendung speichert jeder Schritt direkt in Ihrem System
      </p>
    </div>
  );
}
