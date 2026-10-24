// ============================================================
// SCAFFOLD OS – Leistungstexte für das LV im Stil „Auftraggeber“ (Turmeinrüstung)
//
// Wortlaut der Leistungsbeschreibungen wie im Auftraggeber-LV. Rechtschreibfehler der Vorlage sind berichtigt,
// projektspezifische Angaben (Ortsnamen, Zeichnungsnummern, Namen Dritter, feste Maße) sind allgemein gefasst
// oder werden aus dem CAD-Modell eingesetzt. Jeder Eintrag ist eine Liste von Absätzen.
// ============================================================

const pt = (...zeilen: string[]): string[] => zeilen
const punkt = (s: string): string => `• ${s}`

export const LV_TEXTE = {
  baustelleneinrichtung: pt(
    'Baustelleneinrichtung für den eigenen Bedarf einrichten und später wieder demontieren:',
    punkt('An- und Rücklieferung sämtlicher Materialien und Geräte'),
    punkt('Vorhaltung von Tagesunterkünften'),
    punkt('Hebezeuge für horizontale und vertikale Transporte'),
    punkt('Sonstiges'),
    punkt('Vorhaltungsbeginn nach der Anlieferung der Gerüstbauteile'),
  ),
  wc: pt('Baustellen-Container-WC für Damen und Herren, inklusive Handwaschbecken und Desinfektion einrichten, mit wöchentlicher Reinigung. Das WC steht allen am Projekt beteiligten Handwerkerinnen und Handwerkern zur Verfügung. Vorhaltungsbeginn nach der Anlieferung.'),
  bauzaun: pt('Schutzzaun zur Sicherung der Baustelle gegen unbefugtes Betreten und zur Sicherung der Baustelleneinrichtung. Der vergitterte Schutzzaun besteht aus Einzelelementen, 2 m hoch, mit Standfüßen aus Beton. Einschließlich Transport, Montage, Demontage und Abtransport.'),
  bauzauntor: pt('Bewegliches Tor auf Rollen mit Kette und Zahlenschloss, Öffnungsbreite bis 4 m. Einschließlich Transport, Montage, Demontage und Abtransport.'),
  bodenabdeckung: pt('Baufolie und 18 mm OSB-Platten (Nut und Feder) auf den Bodenflächen innerhalb der BE-Flächen montieren, demontieren und entsorgen.'),
  genehmigung: pt(
    'Antrag auf Sondernutzung der öffentlichen Verkehrsflächen zur Erstellung der Arbeitsgerüste.',
    'Anfallende Gebühren zur Nutzung der öffentlichen Verkehrsflächen werden dem Bauherrn separat auf Nachweis berechnet.',
  ),
  halteverbot: pt(
    'Einrichten und Räumen einer Halteverbotszone zum Be- und Entladen der Fahrzeuge.',
    'Für die Ausnahmegenehmigung wird nach Gebührenordnung eine Gebühr durch die zuständige Behörde erhoben. Diese Gebühr wird dem Bauherrn separat auf Nachweis berechnet.',
  ),
  verkehrssicherung: pt('Kennzeichnung der Gerüste im öffentlichen Verkehrsraum mit Warnleuchten und Warnbaken, inklusive Transport, Montage, Demontage und Abtransport.'),

  ueberbrueckung: pt(
    'Gitterträger und Stahlträger zur Schaffung von Überbrückungen, Abfangungen und als lastenverteilende Unterkonstruktion über allen angrenzenden Dachflächen am Turm, zur Aufnahme des Gerüstes am Turm, nach statisch-konstruktiven Erfordernissen montieren und wieder demontieren.',
    'Die Art der Lastabtragung und Überbrückung ist durch den Auftragnehmer zu wählen und mit der Bauleitung abzustimmen, falls sie von der Entwurfsplanung abweicht.',
  ),
  schutzdach: pt('Schutzgerüst nach DIN 4420-1 und den DGUV-Vorschriften 201-055 bei turmartigen Bauwerken, aus kreuzweise verlegten Bohlen (mindestens 25 cm × 5 cm) mit dazwischenliegender Dämmschicht (10 cm), einschließlich Unterkonstruktion nach statischen Erfordernissen montieren, demontieren.'),
  kederplane: pt(
    'Lieferung und Montage neuer Planen im Rastermaß des Gerüstes und spätere Demontage in zwei Bauabschnitten.',
    'Gerüstbekleidung als dichter Staubschutz mit lichtdurchlässigen, gewebeverstärkten Kederplanen mit Kedersaum, Baustoffklasse DIN 4102-1 B1 (schwerentflammbar), einschließlich erforderlicher Kederschienen mit Befestigungselementen am Gerüst sowie zusätzlich erforderlicher Gerüstverankerungen.',
    'Die Planen müssen neu, ungebraucht und sauber sein.',
    'Die Bekleidung ist dicht gegen den Straßenbelag anzuschließen, mit lückenlos verlegten Beschwerungen o. Ä., z. B. mit Sand gefüllten Schläuchen mit 10 cm Durchmesser. Der Staubschutz muss dicht ausgebildet werden. Er dient dem Staubschutz während folgender staubintensiver Arbeitsgänge: Fugen ausräumen, Ausbau von Steinen, Zuschnitt von Steinen mittels Flex o. Ä., Spritzverfugung mit Mörtel, Strahlen der Steinoberflächen mit Granulat. Die jeweiligen Haltestellen des Aufzuges sind mit Öffnungen zu versehen, welche leicht mittels Reißverschluss und/oder Klettverschluss zu bedienen sind. Maße siehe Grundrissplanung.',
  ),
  treppenturm: pt(
    'Aufstieg zum Erreichen der Arbeitsplätze, als Gerüsttreppe nach DGUV Regel 101-002, Laufbreite ca. 0,60 m, 1,5 kN Einzellast, Belastbarkeit nach DIN EN 12811 Zugänge, montieren und in zwei Abschnitten demontieren. Oberhalb des bauseitigen Podestes in ca. 0,5 m Höhe sind der Schutz der Oberfläche des Podestes und lastverteilende Unterlagen über mindestens 1,20 m Länge einzukalkulieren.',
    punkt('Belastbarkeit 100 kg/m², auf 5 Gerüstlagen maximal'),
    punkt('Einschließlich Außen- und Innengeländer mit Halterungen'),
    punkt('Gegebenenfalls Zwischenpodeste zum Gerüstübergang vorsehen'),
  ),
  aufzug: (personenKg: string, lastKg: string, hoeheM: string) => pt(
    'Transportbühne für Personen und Lasten nach DIN EN 16719.',
    'Technische Daten:',
    punkt(`Tragfähigkeit: 5 Personen / ${personenKg} kg oder ${lastKg} kg Material`),
    punkt('Hubgeschwindigkeit: 12 bzw. 24 m/min'),
    punkt(`Förderhöhe: ${hoeheM} m`),
    punkt('Plattformgröße: 1,60 m × 1,40 m'),
    punkt('Stromaufnahme: 32 Ampere, 400 Volt'),
    'Transportbühne nach EN 16719 und Maschinenrichtlinie 2006/42/EG geprüft. Transport, Montage sowie Demontage in zwei Abschnitten und Abtransport.',
    'Der Stromanschluss vom Baustromverteiler zur Aufzugseinheit sowie Schutzmaßnahmen gegen Kabeldiebstahl sind Sache des Auftraggebers.',
  ),
  haltestellen: pt('System-Haltestellen für die genannte Transportbühne, Haltestelle nach EN 16719 und Maschinenrichtlinie 2006/42/EG geprüft, montieren, demontieren.'),
  dachschutz: pt('Gummischrotmatten und Bohlenbelag als Lastverteilung sowie zum Schutz auf angrenzenden Dachflächen unter dem Gerüst am Turmschaft montieren und wieder demontieren. Einschließlich Mehraufwendungen für den vertikalen Materialtransport. Der Nachweis über die Tragfähigkeit des Bauwerks ist Sache des Bauherrn. Für Druckschäden durch Gerüste und Nutzer haftet der Auftraggeber.'),

  umbauBelaege1: pt(
    'An dem bestehenden Gerüst werden Umbauarbeiten vorgenommen, um die Beläge temporär entfernen zu können:',
    punkt('Ausbau (mechanische Zerspanung) der vorhandenen Aushubsicherung'),
    punkt('Entsorgung der ausgebauten Rahmenteile'),
    punkt('Ausbau der Beläge und Lagern/Sichern in der jeweiligen Gerüstlage'),
  ),
  umbauBelaege2: pt(
    'An dem bestehenden Gerüst werden Umbauarbeiten vorgenommen, um die Beläge temporär entfernen zu können:',
    punkt('Kontrolle der ausgebauten und bearbeiteten Bauteile'),
    punkt('Beläge wieder einbauen'),
    punkt('Aushubsicherung einbauen als Originalteil des Herstellers oder gleichwertig'),
  ),
  umbauErsatz: pt(
    'An dem bestehenden Gerüst werden Umbauarbeiten vorgenommen, um die Beläge temporär entfernen zu können:',
    punkt('Wiederbeschaffung der geänderten Bauteile (Rahmen 1,088 × 2,00)'),
    punkt('Beschaffung der neuen Aushubsicherung'),
    punkt('Material, Transport und Einbau'),
  ),
  umbauArbeitslage: pt(
    'Umbau der obersten Arbeitslage (Grundlage Entwurfszeichnung) zur Arbeitslage mit Aufnahme einer Hubeinrichtung.',
    'Lieferung und Montage des Gerüstaufsatzes, teilweise außerhalb des Rastermaßes des Gerüstes, und spätere Demontage in mehreren Bauabschnitten.',
    'Gerüstaufsatz in Form eines Modulgerüstes mit systemfreien Aussteifungen und Diagonalen auf dem bestehenden Gerüst sowie zusätzlich erforderlicher Aufstellpunkte.',
    'Die gezeichneten Stahlbauelemente werden hergestellt, geliefert und zurückgebaut, für alle Seiten gleichzeitig. Die Stahlbaumaßnahmen werden durch einen Betrieb ausgeführt, der für die Anforderungen der DIN EN 1090 mindestens nach EXC 2 zertifiziert ist. Das Zertifikat des Betriebes ist vorzulegen. Die Stahlbauelemente können gebraucht sein und müssen mindestens die Festigkeit S235 bzw. 8.8 besitzen. An den Schienen sind in Abstimmung mit dem ausführenden Gewerk geeignete Endanschläge vorzusehen. Die Hubeinrichtung wird vom ausführenden Gewerk geliefert und in Abstimmung eingebaut.',
  ),
  umbauFachwerk: pt(
    'Umbau der Gitterträger (Grundlage Entwurfszeichnung) in den oberen Arbeitslagen zur Schaffung einer weitgehend bauteilfreien Ansichtsfläche.',
    'Lieferung und Montage der zusätzlich erforderlichen Bauteile und spätere Demontage in mehreren Bauabschnitten.',
    'Die Fachwerkbinder werden in vertikaler Ebene durch zusätzliche Fachwerkbinder ersetzt. Die Länge ist identisch zur vorhandenen Länge, sowohl innen als auch außen. Der Ausbau der zurzeit tragenden Bauteile erfolgt nach Befestigung und Kontrolle (wir empfehlen eine Dokumentation) und der Wiedereinbau nach fertiger Bearbeitung der Mauerwerksflächen auf Anforderung der Bauleitung. Vorgehensweise:',
    punkt('Einbau der Fachwerkbinder inklusive Aussteifung'),
    punkt('Herstellen aller vertikalen Tragglieder, zug- und druckfeste Stielverbinder'),
    punkt('Ausbau der Fachwerkbinder innen'),
    punkt('In umgekehrter Reihenfolge Ebenen wiederherstellen'),
    punkt('Anpassen der Arbeitsebenen in Anlehnung an die Entwurfszeichnung'),
  ),

  technischeBearbeitung: pt(
    'Technische Bearbeitung gemäß Punkt 8, 9, 10 nach DIN EN 12811 sowie den „Technischen Vorbemerkungen“.',
    'Manuelles örtliches Einmessen des Bauwerks und Anfertigung der Ausführungszeichnungen zur Genehmigung durch die Bauleitung. Beim Einmessen sind alle Störkanten für die Gerüstständer zu berücksichtigen. Die Innenachse des Gerüstes ist mit genügend Abstand zu diesen Störkanten zu planen.',
    'Die Ausführungspläne für den Montagebeginn sollen unmittelbar nach der Auftragserteilung vom Auftragnehmer erstellt werden und spätestens 10 Werktage vor Montagebeginn zur Prüfung eingereicht werden. Ohne genehmigte Pläne dürfen die Montagearbeiten nicht begonnen werden.',
    'Aufstellen der statischen Berechnungen für alle Abweichungen von den Regelausführungen einschließlich Übersichtszeichnung mit Positionsplan. Hier müssen zusätzliche Montageanweisungen für die Monteure die Abweichungen zur Regelausführung kommentieren.',
    'Baubegleitende Konformitätsprüfung des Gerüstbau-Statikers auf Übereinstimmung der örtlichen Ausführung des Gerüstes mit der erstellten statischen Berechnung.',
    'Protokollierung und Bescheinigung der Standfestigkeit durch den Gerüstbau-Statiker nach Abschluss der statisch relevanten Gerüstbauarbeiten.',
    'Prüfung der Gerüstverankerungen sowie der montierten Verankerungen der Stahlbaukonsolen und Anfertigung des Verankerungsprotokolls mit beispielhafter Fotodokumentation der Auszugsprüfungen. Geprüfte Verankerungen sind während der Bauzeit dauerhaft zu kennzeichnen.',
    'Der Auftragnehmer hat zu prüfen, inwieweit er mit seinem System die Forderungen des Bauherrn erfüllen kann. Alternative Systeme, die den Anforderungen entsprechen und dem groben Entwurf nahekommen, können gerne mit angeboten werden.',
  ),

  stundenFach: pt('Für die Ausführung nicht vertraglich geregelter Leistungen, ohne Materialgestellung und ohne anteilige LKW-Kosten, die Monteure sind vor Ort. Ausführung nur auf Anweisung der Bauleitung, zum täglichen Nachweis.'),
  stundenFachMaterial: pt('Für die Ausführung nicht vertraglich geregelter Leistungen, einschließlich Materialgestellung und anteiliger LKW-Kosten bei notwendiger An- und Abfahrt. Ausführung nur auf Anweisung der Bauleitung, zum täglichen Nachweis.'),
  stundenHelfer: pt('Für die Ausführung nicht vertraglich geregelter Leistungen, ohne Materialgestellung und ohne anteilige LKW-Kosten, die Monteure sind vor Ort. Ausführung nur auf Anweisung der Bauleitung, zum täglichen Nachweis.'),
  stundenHelferMaterial: pt('Für die Ausführung nicht vertraglich geregelter Leistungen, einschließlich Materialgestellung und anteiliger LKW-Kosten bei notwendiger An- und Abfahrt. Ausführung nur auf Anweisung der Bauleitung, zum täglichen Nachweis.'),
  anfahrt: pt(
    'Anfahrtspauschale für unvorhergesehene Kleinsteinsätze zur Ausführung oder Teilausführung vertraglicher Leistungen.',
    'Einschließlich sämtlicher Personal- und Fahrzeugkosten. Ausführung nur auf Anweisung der Bauleitung, zum täglichen Nachweis.',
  ),
}
