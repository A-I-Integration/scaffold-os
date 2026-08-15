import Link from 'next/link';
import { HardHat, ArrowLeft } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Datenschutzerklärung
// Inhalt: Arbeitsfassung vom 11.08.2026 (Anwalt prüft final).
// Interne Prüf-/Arbeitsnotizen aus der PDF-Arbeitsfassung
// (z. B. offene Prüfpunkte zu Verträgen, Storage, Löschfristen)
// wurden hier bewusst NICHT übernommen.
// ============================================================

export const metadata = { title: 'Datenschutzerklärung – SCAFFOLD OS' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-amber-400 mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-400 text-sm transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Startseite
        </Link>

        <div className="flex items-center gap-2 mb-8">
          <HardHat className="w-7 h-7 text-amber-400" />
          <span className="text-lg font-bold tracking-tight">SCAFFOLD OS</span>
        </div>

        <h1 className="text-3xl font-bold mb-8">Datenschutzerklärung</h1>

        <div className="space-y-8 text-slate-300 leading-relaxed">
          <Section title="1. Verantwortlicher">
            <p>
              SCAFFOLD OS UG (haftungsbeschränkt) i. G., Ölbachstr. 48, 48691 Vreden.
              Vertreten durch Michelle Merola.
            </p>
            <p>
              Kontakt: <a href="mailto:info@scaffoldos.de" className="text-amber-400 hover:text-amber-300">info@scaffoldos.de</a>, Telefon: 0151 77266265.
            </p>
          </Section>

          <Section title="2. Verarbeitete Daten">
            <p>
              Projektname, Baustellenadresse, Aufmaßdaten, Maße, Fassaden-/Dachinformationen,
              Hindernisse, Baustellenfotos, LiDAR-Messwerte und digitale Unterschriften.
            </p>
            <p>
              Vor-/Nachname, E-Mail, Telefon, Rolle, Wochenstunden, Stundensatz,
              Führerscheinklasse und Ablaufdatum, Privatadresse, Skills/Qualifikationen mit
              Zertifikatsnummer, Arbeitszeiten, Pausen und Abwesenheiten.
            </p>
            <p>
              GPS-Daten werden während aktiver Touren erfasst: Position, Genauigkeit,
              Geschwindigkeit, Richtung, Fahrzeug und Fahrer.
            </p>
          </Section>

          <Section title="3. Krankmeldungen">
            <p>
              Gespeichert werden Abwesenheitstyp, Zeitraum, Status und ein optionales
              Freitextfeld. Bei Krankheit wird kein Krankheitsgrund aktiv abgefragt und kein
              Attest hochgeladen.
            </p>
          </Section>

          <Section title="4. Zwecke">
            <p>
              Bereitstellung und Administration der SaaS-Plattform, Projekt- und
              Baustellenverwaltung, Aufmaß, Touren- und Routenplanung, Mitarbeiterverwaltung,
              Zeiterfassung, Lager/Fuhrpark, Kommunikation, Support und KI-gestützte Funktionen.
            </p>
          </Section>

          <Section title="5. Mistral AI">
            <p>
              An Mistral werden Baustellenfotos für Fotoanalyse, Projektname und
              Baustellenadresse für Routenplanung, Mitarbeitername und Skills für
              Umdispositionsvorschläge sowie Lagermengen und Materialnamen für Prognosen
              übermittelt.
            </p>
            <p>
              Es werden keine Zeiterfassungs-, Gehalts- oder GPS-Daten an Mistral übermittelt.
            </p>
            <p>
              <strong className="text-slate-100">Grundsatz:</strong> Alle KI-Funktionen
              erstellen ausschließlich Vorschläge, die von einem Menschen geprüft und
              freigegeben werden. Es finden keine vollautomatisierten Entscheidungen
              im Sinne von Art. 22 DSGVO statt. Die KI analysiert Gebäude, Material
              und Abläufe – keine Bewertung oder Überwachung von Personen.
            </p>
          </Section>

          <Section title="6. Weitere Dienstleister">
            <p>
              <strong className="text-slate-100">Vercel:</strong> Hosting und Webverkehr
              einschließlich IP-Adressen (Auftragsverarbeitung).
            </p>
            <p>
              <strong className="text-slate-100">Supabase:</strong> Datenbank, Authentifizierung
              und Storage; Serverstandort Frankfurt/EU.
            </p>
            <p>
              <strong className="text-slate-100">Resend:</strong> Versand transaktionaler
              E-Mails mit Empfängeradressen und Inhalten (Auftragsverarbeitung mit
              EU-Standardvertragsklauseln).
            </p>
            <p>
              <strong className="text-slate-100">OpenStreetMap/Nominatim/OSRM:</strong>{' '}
              Baustellenadressen werden für Geocoding und Fahrzeit-/Distanzberechnung
              übermittelt.
            </p>
          </Section>

          <Section title="7. Website-Formular und Tracking">
            <p>
              Website-Anfragen werden nicht in der SCAFFOLD-OS-Datenbank gespeichert, sondern
              als E-Mail weitergeleitet.
            </p>
            <p>
              Es werden keine Google-, Meta-, LinkedIn-, Sentry-, Clarity- oder vergleichbaren
              Trackingdienste eingesetzt.
            </p>
          </Section>

          <Section title="8. Löschung">
            <p>
              Für Kundeninstallationen ist eine Löschung 30 Tage nach Vertragsende vorgesehen,
              nachdem ein Datenexport ermöglicht wurde. Gesetzliche Aufbewahrungspflichten
              bleiben unberührt.
            </p>
          </Section>

          <Section title="9. Auftragsverarbeitung">
            <p>
              Soweit SCAFFOLD OS personenbezogene Daten im Auftrag eines Kunden verarbeitet,
              wird ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO geschlossen.
            </p>
          </Section>

          <Section title="10. Betroffenenrechte">
            <p>
              Betroffene haben nach Maßgabe der DSGVO insbesondere Rechte auf Auskunft,
              Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch.
              Bei SaaS-Kundendaten ist regelmäßig der jeweilige Kunde Verantwortlicher und
              SCAFFOLD OS Auftragsverarbeiter.
            </p>
          </Section>

          <Section title="11. Rechtsgrundlagen">
            <p>
              Die Rechtsgrundlage ist je Verarbeitungsvorgang bestimmt. Für Vertragsleistungen
              kommen insbesondere Art. 6 Abs. 1 lit. b DSGVO und berechtigte Interessen nach
              Art. 6 Abs. 1 lit. f DSGVO in Betracht.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
