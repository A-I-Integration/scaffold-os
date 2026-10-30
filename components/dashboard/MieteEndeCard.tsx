"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { tageBis, plusTageIso } from "@/lib/miete";

// ============================================================
// SCAFFOLD OS – Dashboard: Mietende in den nächsten 14 Tagen
// Zeigt aktive Projekte, deren Mietende bald erreicht ist, mit
// Verlängerung um frei wählbare Wochen (Standard 1) oder bis zu einem Datum. Blendet sich aus, wenn nichts
// ansteht oder der Nutzer keine Berechtigung hat (nur admin/disponent).
// Beim Verlängern wird – wenn im Angebot ein Wochenpreis steht – direkt eine
// Rechnung (Entwurf, status "offen") für die verlängerten Wochen angelegt, mit
// einer Rückfrage vorab. data.mietAbgerechnetBis wird auf das neue Ende gesetzt,
// damit die automatische Standzeit-Nachberechnung (lib/miete.ts, Cron) dieselben
// Wochen nicht noch einmal berechnet. Danach öffnet sich der Auftrag des Kunden.
// Das ursprüngliche Projektende (step1.projektende) bleibt unverändert.
// ============================================================

interface Eintrag {
  id: string;
  name: string;
  kunde: string;
  adresse: string | null;
  customer_id: string | null;
  wochenpreis: number;
  ende: string;
  tage: number;
  verlaengert: boolean;
}

function deutsch(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

export default function MieteEndeCard() {
  const router = useRouter();
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [laedt, setLaedt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [wahl, setWahl] = useState<Record<string, { modus: 'wochen' | 'datum'; wochen: string; bis: string }>>({});
  const holeWahl = (id: string) => wahl[id] || { modus: 'wochen' as const, wochen: '1', bis: '' };
  const setzeWahl = (id: string, teil: Partial<{ modus: 'wochen' | 'datum'; wochen: string; bis: string }>) => setWahl((w) => ({ ...w, [id]: { ...holeWahl(id), ...teil } }));

  const laden = useCallback(async () => {
    try {
      const res = await fetch("/api/miete/ende", { cache: "no-store" });
      const json = await res.json();
      setListe(json.success ? json.projekte || [] : []);
    } catch {
      setListe([]);
    }
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const heuteIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

  /** Legt die Rechnung für die verlängerten Wochen an (mit Prüfung/Freigabe wie auf der Seite Mietabrechnung). */
  async function rechnungAnlegen(e: Eintrag, neuesEnde: string, wochen: number, overrideGrund?: string): Promise<string> {
    const heute = heuteIso();
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: e.id,
        customer_name: e.kunde,
        customer_address: e.adresse || undefined,
        due_date: plusTageIso(heute, 14),
        notes: `Mietverlängerung: Standzeit „${e.name}“ um ${wochen} Wo. verlängert (${deutsch(e.ende)} bis ${deutsch(neuesEnde)}).`,
        positions: [{ bezeichnung: `Mietverlängerung ${e.name} – ${wochen} Wo. (${deutsch(e.ende)} bis ${deutsch(neuesEnde)})`, menge: wochen, einheit: "Wo.", einzelpreis: e.wochenpreis }],
        override_grund: overrideGrund || undefined,
      }),
    });
    const antwort = await res.json();
    if (!res.ok) {
      if (antwort.code === "FREIGABE_FEHLT_OVERRIDE_MOEGLICH") {
        const grund = prompt(antwort.error + "\n\nBegründung für die Überschreibung eingeben:");
        if (grund && grund.trim()) return rechnungAnlegen(e, neuesEnde, wochen, grund.trim());
        throw new Error("Ohne Freigabe oder Begründung wurde keine Rechnung angelegt.");
      }
      throw new Error(antwort.error || "Rechnung konnte nicht angelegt werden.");
    }
    return antwort.invoice?.invoice_number || "";
  }

  async function verlaengern(id: string) {
    const e = liste.find((x) => x.id === id);
    if (!e) return;
    const eingabe = holeWahl(id);
    const wochenEingabe = Math.round(Number(eingabe.wochen.replace(",", ".")));
    if (eingabe.modus === "wochen" && !(wochenEingabe >= 1 && wochenEingabe <= 52)) { setFehler("Bitte 1 bis 52 Wochen eingeben."); return; }
    if (eingabe.modus === "datum" && !eingabe.bis) { setFehler("Bitte ein Datum wählen."); return; }
    // Vorschau: neues Ende und Betrag, damit nichts versehentlich berechnet wird
    const vorschauEnde = eingabe.modus === "datum" ? eingabe.bis : plusTageIso(e.ende, 7 * wochenEingabe);
    const vorschauWochen = Math.max(1, Math.ceil(tageBis(vorschauEnde, e.ende) / 7));
    if (e.wochenpreis > 0 && !window.confirm(`Mietende bis ${deutsch(vorschauEnde)} verlängern und direkt eine Rechnung über ${vorschauWochen} Wo. à ${eur(e.wochenpreis)} netto anlegen?`)) return;
    setLaedt(id);
    setFehler(null);
    try {
      const res = await fetch("/api/miete/verlaengern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eingabe.modus === "datum" ? { project_id: id, bis: eingabe.bis } : { project_id: id, wochen: wochenEingabe }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Verlängern fehlgeschlagen.");
      const neuesEnde: string = json.ende;
      if (e.wochenpreis > 0) {
        const wochen = Math.max(1, Math.ceil(tageBis(neuesEnde, e.ende) / 7));
        try {
          await rechnungAnlegen(e, neuesEnde, wochen);
          // Bis wann abgerechnet ist: verhindert, dass die automatische Standzeit-Nachberechnung dieselben Wochen noch einmal berechnet
          const patch = await fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, data: { mietAbgerechnetBis: neuesEnde } }) });
          if (!patch.ok) throw new Error("Rechnung angelegt, aber der Abrechnungs-Merker konnte nicht gespeichert werden – bitte unter „Mietabrechnung“ prüfen, damit nichts doppelt berechnet wird.");
        } catch (err: any) {
          setFehler(`Mietende verlängert, aber: ${err.message || "Rechnung nicht angelegt."} Bitte im Auftrag eine Zusatzrechnung anlegen.`);
          await laden();
          return;
        }
      }
      if (e.customer_id) { router.push(`/kunden/${e.customer_id}?baustelle=${id}`); return; }
      await laden();
    } catch (err: any) {
      setFehler(err.message || "Verlängern fehlgeschlagen.");
    } finally {
      setLaedt(null);
    }
  }

  if (liste.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[#1d1d1f] mb-3">
        <CalendarClock className="w-5 h-5 text-[#E8590C]" /> Mietende in den nächsten 14 Tagen
      </h2>
      <div className="space-y-2">
        {liste.map((e) => (
          <div
            key={e.id}
            className={`flex items-center justify-between gap-3 p-4 rounded-2xl border ${e.tage <= 7 ? "bg-amber-50 border-amber-200" : "bg-white border-[#e5e5ea]"}`}
          >
            <div className="min-w-0">
              <p className="font-medium text-[#1d1d1f] truncate">{e.kunde}{e.adresse ? ` – ${e.adresse}` : ""}</p>
              <p className="text-sm text-[#86868b]">
                Mietende {deutsch(e.ende)} · {e.tage === 0 ? "heute" : e.tage === 1 ? "morgen" : `in ${e.tage} Tagen`}
                {e.verlaengert ? " · bereits verlängert" : ""}
              </p>
            </div>
            <div className="shrink-0 flex flex-wrap items-center justify-end gap-1.5">
              {holeWahl(e.id).modus === 'wochen' ? (
                <label className="flex items-center gap-1 text-sm text-[#424245]">
                  <input type="number" min={1} max={52} value={holeWahl(e.id).wochen} onChange={(ev) => setzeWahl(e.id, { wochen: ev.target.value })} className="w-16 rounded-lg border border-[#d2d2d7] px-2 py-1.5 text-sm" aria-label="Wochen" /> Wochen
                </label>
              ) : (
                <input type="date" min={e.ende} value={holeWahl(e.id).bis} onChange={(ev) => setzeWahl(e.id, { bis: ev.target.value })} className="rounded-lg border border-[#d2d2d7] px-2 py-1.5 text-sm" aria-label="Neues Mietende" />
              )}
              <button type="button" onClick={() => setzeWahl(e.id, { modus: holeWahl(e.id).modus === 'wochen' ? 'datum' : 'wochen' })} className="text-xs text-[#86868b] underline">
                {holeWahl(e.id).modus === 'wochen' ? 'oder Datum' : 'oder Wochen'}
              </button>
              <button
                onClick={() => verlaengern(e.id)}
                disabled={laedt === e.id}
                className="px-3 py-2 rounded-xl bg-[#E8590C] text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
              >
                {laedt === e.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Verlängern
              </button>
            </div>
          </div>
        ))}
      </div>
      {fehler && <p className="mt-2 text-sm text-red-600">{fehler}</p>}
    </div>
  );
}
