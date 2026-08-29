import Link from 'next/link';
import { HardHat, ArrowLeft } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – AGB / SaaS-Vertrag (B2B)
// Inhalt: Arbeitsfassung vom 11.08.2026 (Anwalt prüft final).
// Interne Prüf-/Arbeitsnotizen aus der PDF-Arbeitsfassung
// wurden hier bewusst NICHT übernommen.
// ============================================================

export const metadata = { title: 'AGB – SCAFFOLD OS' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#e8590c] mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function AgbPage() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-[#86868b] hover:text-[#e8590c] text-sm transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" /> Zurück zur Startseite
        </Link>

        <div className="flex items-center gap-2 mb-8">
          <HardHat className="w-7 h-7 text-[#e8590c]" />
          <span className="text-lg font-bold tracking-tight">SCAFFOLD OS</span>
        </div>

        <h1 className="text-3xl font-bold mb-8">Allgemeine Geschäftsbedingungen</h1>

        <div className="space-y-8 text-[#424245] leading-relaxed">
          <Section title="§ 1 Geltungsbereich">
            <p>
              Diese AGB gelten ausschließlich für Unternehmer im Sinne des § 14 BGB, die
              SCAFFOLD OS geschäftlich nutzen.
            </p>
            <p>
              Vertragspartner ist AI Integration, Inhaberin Michelle Merola (Einzelunternehmen),
              Ölbachstr. 48, 48691 Vreden. SCAFFOLD OS ist ein Produkt von AI Integration.
            </p>
          </Section>

          <Section title="§ 2 Vertragsgegenstand">
            <p>
              SCAFFOLD OS ist eine cloudbasierte Software zur digitalen Unterstützung
              insbesondere von Gerüstbau- und Bauunternehmen. Der Funktionsumfang kann unter
              anderem Aufmaß, Projektverwaltung, Tourenplanung, Mitarbeiter- und
              Zeitverwaltung, Lager- und Fuhrparkverwaltung, Kommunikation sowie KI-gestützte
              Funktionen umfassen.
            </p>
            <p>
              Maßgeblich ist der bei Vertragsschluss vereinbarte Leistungsumfang. Funktionen
              dürfen weiterentwickelt oder technisch angepasst werden, sofern der vertragliche
              Kernnutzen nicht unzumutbar beeinträchtigt wird.
            </p>
          </Section>

          <Section title="§ 3 Nutzungsrecht und Zugänge">
            <p>
              Der Kunde erhält für die Vertragslaufzeit ein einfaches, nicht ausschließliches
              und nicht übertragbares Recht, SCAFFOLD OS über die bereitgestellten Zugänge und
              Schnittstellen für eigene betriebliche Zwecke zu nutzen.
            </p>
            <p>
              Zugangsdaten sind vertraulich zu behandeln. Der Kunde ist für die von ihm
              angelegten Nutzer und deren Berechtigungen verantwortlich.
            </p>
          </Section>

          <Section title="§ 4 Preise und Zahlung">
            <p>
              Das SCAFFOLD-OS-Abonnement wird in drei Paketen angeboten: Starter 249 € netto pro
              Monat, Priority 495 € netto pro Monat und Enterprise 749 € netto pro Monat. Die
              Abrechnung erfolgt monatlich im Voraus über den Zahlungsdienstleister Stripe
              (Kreditkarte oder SEPA-Lastschrift). Die erste Abbuchung erfolgt nach Ablauf der
              Testphase gemäß § 5.
            </p>
            <p>
              Alternativ kann der Vertrag für eine Laufzeit von sechsunddreißig (36) Monaten mit
              vollständiger Vorauszahlung abgeschlossen werden. In diesem Fall gewähren wir einen
              Erlass von fünf Prozent (5 %) auf den Gesamtbetrag der 36 Monate. Die Abwicklung
              erfolgt per Rechnung und Überweisung; die Bereitstellung des Zugangs erfolgt nach
              Zahlungseingang. Während der 36-monatigen Laufzeit ist eine ordentliche Kündigung
              ausgeschlossen; danach verlängert sich der Vertrag auf unbestimmte Zeit und ist
              monatlich mit einer Frist von 30 Tagen zum Monatsende kündbar. Bei außerordentlicher
              Kündigung durch den Kunden aus wichtigem Grund, den wir zu vertreten haben, erstatten
              wir den anteiligen Betrag für die nicht genutzte Restlaufzeit.
            </p>
            <p>
              Optional buchbar: Onboarding 1.490 € netto. Ein erweitertes Paket in Höhe von
              zusätzlich 2.490 € netto umfasst Onboarding, Lagereinrichtung und Schulung der
              Mitarbeiter.
            </p>
            <p>
              Alle Preise verstehen sich zuzüglich gesetzlicher Umsatzsteuer, soweit diese
              anfällt. Bei Zahlungsverzug können der Zugang nach Mahnung vorübergehend
              gesperrt sowie Verzugszinsen in gesetzlicher Höhe berechnet werden.
            </p>
          </Section>

          <Section title="§ 5 Testphase, Laufzeit und Kündigung">
            <p>
              Der Vertrag beginnt mit einer kostenlosen Testphase von drei Tagen. Innerhalb der
              Testphase kann der Vertrag jederzeit ohne Angabe von Gründen beendet werden; es
              entstehen keine Kosten. Eine Beendigung während der Testphase ist per E-Mail an{' '}
              <a href="mailto:info@scaffoldos.de" className="text-[#e8590c] hover:text-[#e8590c]">info@scaffoldos.de</a>{' '}
              oder über den Zahlungsdienstleister möglich.
            </p>
            <p>
              Wird der Vertrag nicht innerhalb der Testphase beendet, verlängert er sich
              automatisch in ein kostenpflichtiges Abonnement mit einer Mindestvertragslaufzeit
              von sechsunddreißig (36) Monaten ab Ende der Testphase. Während der
              Mindestvertragslaufzeit ist eine ordentliche Kündigung ausgeschlossen.
            </p>
            <p>
              Nach Ablauf der Mindestvertragslaufzeit verlängert sich der Vertrag auf
              unbestimmte Zeit und ist dann monatlich mit einer Frist von 30 Tagen zum
              Monatsende kündbar. Kündigungen sind in Textform (z. B. per E-Mail an{' '}
              <a href="mailto:info@scaffoldos.de" className="text-[#e8590c] hover:text-[#e8590c]">info@scaffoldos.de</a>)
              zu richten.
            </p>
            <p>
              Für Verträge mit 36-monatiger Laufzeit und Vorauszahlung gilt § 4 Abs. 2; die Regelungen
              dieses Paragraphen zur Testphase und zur außerordentlichen Kündigung gelten entsprechend.
            </p>
            <p>
              Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.
            </p>
          </Section>

          <Section title="§ 6 Verfügbarkeit">
            <p>
              Es wird keine bestimmte Uptime oder Mindestverfügbarkeit garantiert. Wartungen,
              technische Störungen sowie Ausfälle oder Einschränkungen von Drittanbietern können
              die Nutzung beeinträchtigen.
            </p>
          </Section>

          <Section title="§ 7 Support">
            <p>
              Support: Montag bis Freitag von 08:00 bis 15:00 Uhr über{' '}
              <a href="mailto:info@scaffoldos.de" className="text-[#e8590c] hover:text-[#e8590c]">info@scaffoldos.de</a>{' '}
              und 0151 77266265. Eine bestimmte Reaktions- oder Lösungszeit wird nicht
              garantiert, sofern nicht individuell vereinbart.
            </p>
          </Section>

          <Section title="§ 8 KI-Funktionen">
            <p>
              KI-Ausgaben, insbesondere Fotoanalysen, Routenplanung, Personalvorschläge und
              Prognosen, sind Entscheidungshilfen. Sie können fehlerhaft oder unvollständig
              sein. Der Kunde prüft KI-Ergebnisse und trifft die endgültige fachliche
              Entscheidung.
            </p>
            <p>
              Automatisierte KI-Ergebnisse ersetzen keine gesetzlich oder betrieblich
              erforderliche menschliche Kontrolle.
            </p>
          </Section>

          <Section title="§ 9 Pflichten des Kunden">
            <p>
              Der Kunde darf nur Daten verarbeiten, für deren Verarbeitung und Übermittlung er
              rechtlich befugt ist. Er muss insbesondere Mitarbeiter und sonstige Betroffene
              über die Verarbeitung informieren, soweit dies seine Verantwortung als
              Verantwortlicher betrifft.
            </p>
            <p>Der Kunde muss Nutzerrechte angemessen vergeben und Zugangsdaten schützen.</p>
          </Section>

          <Section title="§ 10 Datenexport und Löschung">
            <p>
              Der Kunde kann seine Daten vor Vertragsende bzw. innerhalb eines angemessenen
              Zeitraums danach exportieren, soweit die jeweilige Exportfunktion vorhanden ist.
            </p>
            <p>
              Nach 30 Tagen ab Vertragsende werden Daten der Kundeninstallation gelöscht, soweit
              keine gesetzlichen Aufbewahrungspflichten oder andere zwingende Gründe
              entgegenstehen. Gesetzliche Aufbewahrungspflichten bleiben unberührt.
            </p>
          </Section>

          <Section title="§ 11 Datenschutz und AVV">
            <p>
              Soweit SCAFFOLD OS personenbezogene Daten im Auftrag des Kunden verarbeitet,
              schließen die Parteien einen Vertrag nach Art. 28 DSGVO. Der Kunde bleibt für
              seine eigenen Informations- und Rechtsgrundlagenpflichten verantwortlich.
            </p>
          </Section>

          <Section title="§ 12 Gewährleistung und Haftung">
            <p>
              Erhebliche reproduzierbare Mängel werden innerhalb angemessener Frist behoben.
              Keine Garantie besteht für fehlerfreie oder ununterbrochene Drittleistungen.
            </p>
            <p>
              Der Anbieter haftet unbeschränkt bei Vorsatz, grober Fahrlässigkeit, Schäden an
              Leben, Körper oder Gesundheit und in zwingenden gesetzlichen Fällen.
            </p>
            <p>
              Bei einfacher Fahrlässigkeit ist die Haftung auf die Verletzung wesentlicher
              Vertragspflichten und den typischerweise vorhersehbaren Schaden begrenzt, soweit
              gesetzlich zulässig.
            </p>
          </Section>

          <Section title="§ 13 Geistiges Eigentum">
            <p>
              Rechte an Software, Quellcode, Datenbankstruktur, Benutzeroberfläche, KI-Logik und
              Dokumentation verbleiben beim Anbieter bzw. den jeweiligen Rechtsinhabern. Rechte
              an Kundendaten verbleiben beim Kunden.
            </p>
          </Section>

          <Section title="§ 14 Vertraulichkeit">
            <p>
              Beide Parteien behandeln vertrauliche geschäftliche Informationen der jeweils
              anderen Partei vertraulich und verwenden sie nur zur Vertragsdurchführung.
            </p>
          </Section>

          <Section title="§ 15 Recht und Gerichtsstand">
            <p>
              Es gilt deutsches Recht. Gegenüber Unternehmern wird als Gerichtsstand, soweit
              gesetzlich zulässig, der Sitz des Anbieters vereinbart.
            </p>
            <p>Zwingende gesetzliche Zuständigkeiten bleiben unberührt.</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
