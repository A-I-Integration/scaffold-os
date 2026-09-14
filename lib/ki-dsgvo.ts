// ============================================================
// SCAFFOLD OS – KI-DSGVO-Härtung (Phase 64)
//
// ZWECK
// -----
// Texte, die an die externe KI-API (Mistral/OpenAI-kompatibel)
// gehen, werden VOR dem Versand pseudonymisiert. Ziel: möglichst
// wenig personenbezogene Daten (Art. 4 Nr. 1 DSGVO) verlassen
// die eigene Infrastruktur – unabhängig davon, was der Anbieter
// in seinem AVV zusichert.
//
// WAS ERSETZT WIRD (Mustererkennung, nicht NLP – bewusst
// konservativ, lieber ein Treffer zu viel als einer zu wenig):
//   • E-Mail-Adressen            -> [E-MAIL]
//   • Telefonnummern (DE)        -> [TELEFON]
//   • PLZ + Ort                  -> [PLZ-ORT]
//   • Straße + Hausnummer        -> [STRASSE]
//   • IBAN                       -> [IBAN]
//
// BEKANNTE GRENZEN (dokumentiert, keine Bugs):
//   • Personennamen (Müller, Schmidt…) werden NICHT erkannt –
//     Namenserkennung per Regex erzeugt zu viele Fehltreffer
//     in Fachwort-Texten. Das ist der Job der späteren
//     Stufe (NER-Modell oder Verbesserung der Prompts).
//   • Bilder/PDFs/Audio (Vision, OCR, Sprachnotiz) können
//     nicht im Textkanal pseudonymisiert werden. Dafür gilt:
//     AVV + EU-Endpoint (siehe README-Phase64).
//   • Die KI-Antwort kann Platzhalter ([E-MAIL] etc.) zurück-
//     spiegeln. Das ist kosmetisch und sogar informativ.
//
// FAIL-OPEN (bewusste Entscheidung): Tritt bei der Ersetzung
// ein Fehler auf, wird der ORIGINALTEXT gesendet und der Fehler
// serverseitig geloggt. Verfügbarkeit geht vor – die Vertrags-
// sicherung (AVV) fängt diesen Restfall ab.
//
// ABSCHALTBAR per Env, OHNE Re-Deploy-Zwang:
//   KI_PSEUDONYMIZE=false   (Default: aktiviert)
//
// Kein SQL, keine Migration, keine Daten-Veränderung.
// ============================================================

export function pseudonymisierungAktiv(): boolean {
  return (process.env.KI_PSEUDONYMIZE || 'true') !== 'false';
}

interface Muster {
  re: RegExp;
  ersatz: string;
}

// Reihenfolge beachten: spezifisch vor allgemein.
// RegExp-Flags: g = global, i = case-insensitive.
const MUSTER: Muster[] = [
  {
    // E-Mail
    re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/gi,
    ersatz: '[E-MAIL]',
  },
  {
    // IBAN (DE): DE + 20 Ziffern, beliebig gruppiert
    re: /\bDE\d{2}(?:[ ]?\d{4}){4}(?:[ ]?\d{2})?\b/gi,
    ersatz: '[IBAN]',
  },
  {
    // Telefon (DE): +49… oder 0…, mind. 8 Ziffern gesamt,
    // Trenner Leerzeichen / / - ( )
    re: /(?:\+49[\s\/().-]*|(?<![\d+])0)[1-9][\d\s\/().-]{6,}\d(?![\d.])/g,
    ersatz: '[TELEFON]',
  },
  {
    // PLZ (5 Ziffern) + Ort (Großschreibung)
    re: /\b\d{5}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:[ -][A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)*\b/g,
    ersatz: '[PLZ-ORT]',
  },
  {
    // Straße + Hausnummer: Wort endend auf typische Straßen-
    // suffixe, gefolgt von 1–4-stelliger Nummer (+optional Buchstabe)
    re: /\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*(?:str(?:aße|asse)?|weg|gasse|allee|platz|ring|damm|chaussee|pfad|steig|ufer|markt|graben|brücke|anger)\s+\d{1,4}[a-z]?\b/gi,
    ersatz: '[STRASSE]',
  },
];

/**
 * Ersetzt erkannte personenbezogene Muster durch Platzhalter.
 * Fail-open: bei jedem Fehler wird der Originaltext zurückgegeben.
 */
export function pseudonymisiereText(text: string): string {
  if (!pseudonymisierungAktiv()) return text;
  try {
    let ergebnis = text;
    for (const { re, ersatz } of MUSTER) {
      ergebnis = ergebnis.replace(re, ersatz);
    }
    return ergebnis;
  } catch (err) {
    console.error('[KI-DSGVO] Pseudonymisierung fehlgeschlagen, Original wird gesendet:', err);
    return text;
  }
}
