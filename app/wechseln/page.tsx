import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight, Check, MonitorDown, CloudUpload, CalendarCheck, FileSpreadsheet,
  RefreshCcw, ShieldCheck, X,
} from 'lucide-react';
import LandingHeader from '@/components/LandingHeader';

// ============================================================
// SCAFFOLD OS – /wechseln
// Landingpage für Betriebe, die bereits eine Gerüstbau-Software
// nutzen (CP-PRO, WinWorker, SORBA, Excel) und wechseln wollen.
// Kernbotschaft: Wir übernehmen die Daten, Parallelbetrieb
// möglich, monatlich kündbar.
// ============================================================

export const metadata: Metadata = {
  title: 'Von CP-PRO, WinWorker & Co. zu SCAFFOLD OS wechseln – Datenübernahme inklusive',
  description:
    'Wechseln Sie von Ihrer bisherigen Gerüstbau-Software zu SCAFFOLD OS: Wir übernehmen Kunden- und Materialdaten kostenlos, 30 Tage Parallelbetrieb, monatlich kündbar. Cloud statt Windows-Server – mit KI-Aufmaß.',
  alternates: { canonical: 'https://scaffoldos.de/wechseln' },
};

const VERGLEICH = [
  { alt: 'Windows-Server oder Remote-Zugriff nötig', neu: 'Läuft im Browser – auf jedem Gerät, überall' },
  { alt: 'Installation & Updates vor Ort', neu: 'Automatische Updates, immer die neueste Version' },
  { alt: 'Module einzeln dazukaufen', neu: 'Aufmaß, Disposition, Lager, Zeiterfassung – alles drin' },
  { alt: 'KI-Funktionen nicht vorhanden', neu: 'KI berechnet Material, Kalkulation und Lager-Prognose' },
  { alt: 'Datensicherung liegt in Ihrer Hand', neu: 'Server in Frankfurt (EU), automatisch gesichert' },
  { alt: 'Lange Vertragslaufzeiten & Wartungsverträge', neu: 'Monatlich kündbar, keine Einrichtungsgebühr' },
];

const SCHRITTE = [
  {
    icon: FileSpreadsheet,
    titel: '1. Daten exportieren',
    text: 'In Ihrer bisherigen Software Kunden und Material als CSV/Excel exportieren – wir sagen Ihnen im Termin genau, wie das bei Ihrem System geht.',
  },
  {
    icon: CloudUpload,
    titel: '2. Wir ziehen um',
    text: 'Sie laden die Dateien hoch oder schicken sie uns – wir übernehmen Kundenstamm und Materialliste in Ihr neues SCAFFOLD OS. Kostenlos.',
  },
  {
    icon: RefreshCcw,
    titel: '3. Parallel weiterarbeiten',
    text: 'Für Wechsler verlängern wir die Testphase auf 30 Tage: Beide Systeme laufen nebeneinander, Sie wechseln in Ruhe – ohne Druck.',
  },
];

const UEBERNAHME = [
  'Kundenstamm mit Ansprechpartnern und Adressen',
  'Materialliste mit Artikelnummern, Beständen und Preisen',
  'Lieferanten und Lagerorte',
  'Auf Wunsch: Mitarbeiterliste mit Rollen',
];

const FAQ_WECHSEL = [
  {
    frage: 'Was passiert mit meinen alten Daten?',
    antwort: 'Ihre bisherige Software bleibt unangetastet. Wir kopieren die Daten, die Sie uns geben, in Ihr neues System. Ihre alte Installation können Sie so lange behalten, wie Sie möchten.',
  },
  {
    frage: 'Kann ich meine Daten später wieder mitnehmen?',
    antwort: 'Ja. Ihre Daten gehören Ihnen – ein Export ist jederzeit möglich. Es gibt keine Kündigungsfalle und keine Weggesperrt-Garantie: monatlich kündbar, fertig.',
  },
  {
    frage: 'Was kostet der Umzug?',
    antwort: 'Nichts. Die Datenübernahme von Kunden- und Materialdaten ist für Wechsler kostenlos – inklusive persönlichem Einrichtungstermin.',
  },
  {
    frage: 'Wie läuft der Parallelbetrieb?',
    antwort: 'Nennen Sie uns im Termin oder per E-Mail, dass Sie wechseln – wir verlängern Ihre Testphase auf 30 Tage. In der Zeit arbeiten Sie mit beiden Systemen und entscheiden in Ruhe.',
  },
];

export default function WechselnPage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] flex flex-col">
      <LandingHeader />

      {/* ─── Hero ─── */}
      <section className="px-6 pt-20 pb-16 md:pt-28 md:pb-20 text-center">
        <p className="text-sm font-semibold tracking-widest text-[#e8590c] uppercase mb-4">
          Softwarewechsel ohne Bauchschmerzen
        </p>
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-3xl mx-auto leading-tight">
          Sie nutzen schon Gerüstbau-Software?{' '}
          <span className="text-[#86868b]">Der Wechsel ist leichter als gedacht.</span>
        </h1>
        <p className="mt-6 text-lg text-[#6e6e73] leading-relaxed max-w-2xl mx-auto">
          Ob CP-PRO, WinWorker, SORBA oder ein Excel-Kunstwerk: Wir übernehmen Ihre
          Kunden- und Materialdaten kostenlos, richten alles mit Ihnen ein – und Sie
          testen 30 Tage parallel zu Ihrer bisherigen Lösung.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/#termin"
            className="inline-flex items-center gap-2 rounded-full bg-[#e8590c] hover:bg-[#d14e06] text-white font-semibold px-7 py-3.5 transition shadow-lg shadow-[#e8590c]/25"
          >
            <CalendarCheck className="w-4 h-4" />
            Kostenlosen Wechsel-Termin buchen
          </Link>
          <Link
            href="/kaufen"
            className="inline-flex items-center gap-2 rounded-full border border-black/15 hover:border-black/40 font-semibold px-7 py-3.5 transition"
          >
            Erst selbst testen <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ─── Vergleich: Desktop vs. Cloud ─── */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Vom Büro-Server in die Cloud.{' '}
            <span className="text-[#86868b]">Einmal, dann für immer.</span>
          </h2>
          <div className="mt-10 rounded-3xl bg-white border border-black/5 shadow-xl shadow-black/5 overflow-hidden">
            <div className="grid grid-cols-2 text-sm font-semibold">
              <div className="px-6 py-4 bg-[#f5f5f7] text-[#86868b] flex items-center gap-2">
                <MonitorDown className="w-4 h-4" /> Bisherige Desktop-Software
              </div>
              <div className="px-6 py-4 bg-[#e8590c] text-white">SCAFFOLD OS</div>
            </div>
            {VERGLEICH.map((z) => (
              <div key={z.alt} className="grid grid-cols-2 border-t border-black/5 text-[15px]">
                <div className="px-6 py-4 text-[#6e6e73] flex items-start gap-2.5">
                  <X className="w-4 h-4 mt-0.5 text-black/25 shrink-0" /> {z.alt}
                </div>
                <div className="px-6 py-4 flex items-start gap-2.5">
                  <Check className="w-4 h-4 mt-0.5 text-[#e8590c] shrink-0" /> {z.neu}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 3 Schritte ─── */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            In drei Schritten umgezogen
          </h2>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {SCHRITTE.map((s) => (
              <div key={s.titel} className="rounded-3xl bg-white border border-black/5 shadow-sm p-7">
                <s.icon className="w-7 h-7 text-[#e8590c]" strokeWidth={1.5} />
                <h3 className="mt-4 font-semibold text-lg tracking-tight">{s.titel}</h3>
                <p className="mt-2 text-[#6e6e73] leading-relaxed text-[15px]">{s.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-3xl bg-[#1d1d1f] text-white px-8 py-8 md:px-12 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-semibold tracking-tight">Das übernehmen wir für Sie:</h3>
              <ul className="mt-4 space-y-2">
                {UEBERNAHME.map((u) => (
                  <li key={u} className="flex items-start gap-2.5 text-white/80 text-[15px]">
                    <Check className="w-4 h-4 mt-0.5 text-[#ff922b] shrink-0" /> {u}
                  </li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 text-center md:text-right">
              <p className="text-4xl font-semibold">0 €</p>
              <p className="text-white/60 text-sm mt-1">Umzugsservice für Wechsler</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ Wechsel ─── */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-center">
            Häufige Fragen zum Wechsel
          </h2>
          <div className="mt-10 space-y-4">
            {FAQ_WECHSEL.map((e) => (
              <details key={e.frage} className="bg-white rounded-2xl border border-black/5 px-6 py-5 shadow-sm group">
                <summary className="font-semibold tracking-tight cursor-pointer list-none flex items-center justify-between gap-4">
                  {e.frage}
                  <span className="text-[#e8590c] text-xl leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[#6e6e73] leading-relaxed text-[15px]">{e.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Abschluss-CTA ─── */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto rounded-3xl bg-white border border-black/5 shadow-xl shadow-black/5 px-8 py-12 text-center">
          <ShieldCheck className="w-10 h-10 text-[#e8590c] mx-auto" strokeWidth={1.5} />
          <h2 className="mt-4 text-2xl md:text-3xl font-semibold tracking-tight">
            Erst schauen, dann wechseln.
          </h2>
          <p className="mt-3 text-[#6e6e73] leading-relaxed max-w-xl mx-auto">
            Buchen Sie einen Termin – wir zeigen Ihnen SCAFFOLD OS live mit Ihren
            eigenen Beispielen und klären, welche Daten wir aus Ihrem bisherigen
            System übernehmen können.
          </p>
          <Link
            href="/#termin"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#e8590c] hover:bg-[#d14e06] text-white font-semibold px-8 py-3.5 transition shadow-lg shadow-[#e8590c]/25"
          >
            <CalendarCheck className="w-4 h-4" />
            Wechsel-Termin buchen
          </Link>
          <p className="mt-4 text-xs text-[#86868b]">
            60 Minuten, kostenlos & unverbindlich. Keine Vertragsfalle – monatlich kündbar.
          </p>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="mt-auto border-t border-black/5 pt-10 pb-16 text-center text-sm text-[#86868b]">
        <div className="flex items-center justify-center gap-3 mb-4 text-[13px]">
          <Link href="/impressum" className="hover:text-[#1d1d1f] transition-colors">Impressum</Link>
          <span className="text-black/10">·</span>
          <Link href="/datenschutz" className="hover:text-[#1d1d1f] transition-colors">Datenschutz</Link>
          <span className="text-black/10">·</span>
          <Link href="/agb" className="hover:text-[#1d1d1f] transition-colors">AGB</Link>
        </div>
        powered by <span className="font-semibold text-[#6e6e73]">AI Integration</span>
      </footer>
    </div>
  );
}
