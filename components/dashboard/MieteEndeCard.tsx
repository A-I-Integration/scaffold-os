"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";

// ============================================================
// SCAFFOLD OS – Dashboard: Mietende in den nächsten 14 Tagen
// Zeigt aktive Projekte, deren Mietende bald erreicht ist, mit
// Ein-Klick-Verlängerung um 1 Woche. Blendet sich aus, wenn nichts
// ansteht oder der Nutzer keine Berechtigung hat (nur admin/disponent).
// Das ursprüngliche Projektende bleibt unverändert, die automatische
// Standzeit-Nachberechnung läuft wie bisher (siehe lib/miete.ts).
// ============================================================

interface Eintrag {
  id: string;
  name: string;
  kunde: string;
  adresse: string | null;
  ende: string;
  tage: number;
  verlaengert: boolean;
}

function deutsch(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

export default function MieteEndeCard() {
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [laedt, setLaedt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

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

  async function verlaengern(id: string) {
    setLaedt(id);
    setFehler(null);
    try {
      const res = await fetch("/api/miete/verlaengern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, wochen: 1 }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Verlängern fehlgeschlagen.");
      await laden();
    } catch (e: any) {
      setFehler(e.message || "Verlängern fehlgeschlagen.");
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
            <button
              onClick={() => verlaengern(e.id)}
              disabled={laedt === e.id}
              className="shrink-0 px-3 py-2 rounded-xl bg-[#E8590C] text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              {laedt === e.id && <Loader2 className="w-4 h-4 animate-spin" />}
              +1 Woche verlängern
            </button>
          </div>
        ))}
      </div>
      {fehler && <p className="mt-2 text-sm text-red-600">{fehler}</p>}
    </div>
  );
}
