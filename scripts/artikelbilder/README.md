# Artikelbilder aus den Layher-Preislisten

Liest die Produktbilder aus den Preislisten (Allround, Schutz, Zubehör) und ordnet sie über die Positionsnummer der Preistabelle den Artikelnummern zu.
Das Bild einer Position wird der Zahl in der Abbildung (auf der Tabellenseite oder bis zwei Seiten davor) zugeordnet.

    pip install pymupdf pillow
    cd scripts/artikelbilder && python3 export.py DE_Preisliste_Allround.pdf DE_Preisliste_Schutz.pdf DE_Preisliste_Zubehoer.pdf

Schreibt `public/artikelbilder/*.jpg` und `index.json` (`{ "Artikelnummer": "datei.jpg" }`). Automatische Zuordnung, Stichproben geprüft; nicht jede Position hat ein Bild.
