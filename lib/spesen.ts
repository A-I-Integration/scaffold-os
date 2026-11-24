// ============================================================
// SCAFFOLD OS – Spesen-Berechnung (Tarif Gerüstbauer-Handwerk § 7 RTV und steuerliche Pauschalen, getrennt)
// Alle Beträge kommen aus den versionierten Sätzen (Tabelle spesen_saetze), nichts ist fest eingebaut.
// Das System prüft NICHT: mehr als 65 km zum Betrieb, Unzumutbarkeit der Heimfahrt (mehr als 1 Std. 15 Min. je Weg),
// getrennte Haushaltsführung, Wochenendheimfahrten und Krankenhaus-/Fehltage. Die Einsatzart wählt der Mensch;
// jeder Betrag lässt sich von Hand überschreiben.
// ============================================================

export const EINSATZARTEN = [
  { value: 'heimfahrt', label: 'Baustelle mit täglicher Heimfahrt' },
  { value: 'auswaerts_voll', label: 'Auswärtig – voller Tag' },
  { value: 'auswaerts_anreise', label: 'Auswärtig – Anreisetag' },
  { value: 'auswaerts_abreise', label: 'Auswärtig – Abreisetag' },
] as const;
export type Einsatzart = (typeof EINSATZARTEN)[number]['value'];
export const EINSATZ_LABEL: Record<string, string> = Object.fromEntries(EINSATZARTEN.map(e => [e.value, e.label]));

export interface Satz { regelwerk: string; schluessel: string; wert: number | string; gueltig_ab: string }

/** Satz, der am Stichtag gilt (jüngstes Gültig-ab, das nicht nach dem Stichtag liegt). */
export function satzAm(saetze: Satz[], regelwerk: string, schluessel: string, datum: string): number | null {
  const treffer = saetze
    .filter(s => s.regelwerk === regelwerk && s.schluessel === schluessel && s.gueltig_ab <= datum)
    .sort((a, b) => (a.gueltig_ab < b.gueltig_ab ? 1 : -1))[0];
  return treffer ? Number(treffer.wert) : null;
}

export interface SpesenEingabe {
  datum: string;
  einsatzart: string;
  abwesenheitStunden: number;
  fruehstueck?: boolean; mittag?: boolean; abend?: boolean;
  fortbildung?: boolean;
}
export interface Teil { betrag: number; begruendung: string[] }
export type SpesenErgebnis = { ok: true; tarif: Teil; steuer: Teil; hinweise: string[] } | { ok: false; fehler: string };

const cent = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export function berechneSpesen(e: SpesenEingabe, saetze: Satz[]): SpesenErgebnis {
  if (!EINSATZARTEN.some(x => x.value === e.einsatzart)) return { ok: false, fehler: 'Unbekannte Einsatzart.' };
  if (!Number.isFinite(e.abwesenheitStunden) || e.abwesenheitStunden < 0 || e.abwesenheitStunden > 24) return { ok: false, fehler: 'Die Abwesenheit muss zwischen 0 und 24 Stunden liegen.' };
  const s = (rw: string, k: string) => satzAm(saetze, rw, k, e.datum);
  const noetig = [['tarif', 'verpflegung_heimfahrt'], ['tarif', 'verpflegung_schwelle_stunden'], ['tarif', 'ausloesung_voll'], ['tarif', 'ausloesung_an_abreise'],
    ['steuer', 'pauschale_ueber_8h'], ['steuer', 'pauschale_schwelle_stunden'], ['steuer', 'pauschale_24h'], ['steuer', 'pauschale_an_abreise'],
    ['steuer', 'kuerzung_fruehstueck_prozent'], ['steuer', 'kuerzung_mittag_prozent'], ['steuer', 'kuerzung_abend_prozent']] as const;
  const fehlt = noetig.filter(([rw, k]) => s(rw, k) === null).map(([, k]) => k);
  if (fehlt.length) return { ok: false, fehler: `Für den ${e.datum} fehlen Spesensätze: ${fehlt.join(', ')}.` };

  const h = e.abwesenheitStunden;
  const hinweise: string[] = [];
  const tarif: Teil = { betrag: 0, begruendung: [] };
  const steuer: Teil = { betrag: 0, begruendung: [] };

  // Kürzung bei gestellten Mahlzeiten: Anteil der 24-Stunden-Pauschale
  const pauschale24 = s('steuer', 'pauschale_24h')!;
  const prozent = (e.fruehstueck ? s('steuer', 'kuerzung_fruehstueck_prozent')! : 0) + (e.mittag ? s('steuer', 'kuerzung_mittag_prozent')! : 0) + (e.abend ? s('steuer', 'kuerzung_abend_prozent')! : 0);
  const kuerzung = cent((pauschale24 * prozent) / 100);
  const mahlzeitenText = [e.fruehstueck && 'Frühstück', e.mittag && 'Mittagessen', e.abend && 'Abendessen'].filter(Boolean).join(', ');

  if (e.fortbildung) {
    tarif.begruendung.push('Fortbildung an diesem Tag: keine Zulagen.');
    steuer.begruendung.push('Fortbildung an diesem Tag: keine Zulagen.');
    return { ok: true, tarif, steuer, hinweise };
  }

  const heimfahrt = e.einsatzart === 'heimfahrt';
  // --- Tarif ---
  if (heimfahrt) {
    const schwelle = s('tarif', 'verpflegung_schwelle_stunden')!;
    if (h > schwelle) {
      tarif.betrag = s('tarif', 'verpflegung_heimfahrt')!;
      tarif.begruendung.push(`Verpflegungszuschuss ${eur(tarif.betrag)}: mehr als ${schwelle} Stunden Abwesenheit (${h.toLocaleString('de-DE')} h), keine Auslösung (§ 7 Nr. 3.2 RTV).`);
    } else tarif.begruendung.push(`Kein Verpflegungszuschuss: höchstens ${schwelle} Stunden Abwesenheit (${h.toLocaleString('de-DE')} h) (§ 7 Nr. 3.2 RTV).`);
  } else {
    const voll = e.einsatzart === 'auswaerts_voll';
    const brutto = voll ? s('tarif', 'ausloesung_voll')! : s('tarif', 'ausloesung_an_abreise')!;
    tarif.betrag = Math.max(0, cent(brutto - kuerzung));
    tarif.begruendung.push(`Auslösung ${eur(brutto)} (${voll ? 'voller Kalendertag' : e.einsatzart === 'auswaerts_anreise' ? 'Anreisetag' : 'Abreisetag'}) (§ 7 Nr. 4.2.2 RTV).`);
    if (kuerzung > 0) tarif.begruendung.push(`Gekürzt um ${eur(Math.min(kuerzung, brutto))} wegen gestellter Mahlzeiten (${mahlzeitenText}), nach den steuerlichen Pauschalen (§ 7 Nr. 4.2.2 RTV).`);
    hinweise.push('Nicht geprüft: mehr als 65 km zum Betrieb, Heimfahrt unzumutbar, getrennte Haushaltsführung (§ 7 Nr. 4.1 RTV).');
  }
  // --- Steuerliche Pauschale (Vergleichswert) ---
  let st = 0;
  if (heimfahrt) {
    const sw = s('steuer', 'pauschale_schwelle_stunden')!;
    if (h > sw) { st = s('steuer', 'pauschale_ueber_8h')!; steuer.begruendung.push(`Verpflegungspauschale ${eur(st)}: mehr als ${sw} Stunden Abwesenheit.`); }
    else steuer.begruendung.push(`Keine Verpflegungspauschale: höchstens ${sw} Stunden Abwesenheit.`);
  } else if (e.einsatzart === 'auswaerts_voll') { st = pauschale24; steuer.begruendung.push(`Verpflegungspauschale ${eur(st)} für 24 Stunden Abwesenheit.`); }
  else { st = s('steuer', 'pauschale_an_abreise')!; steuer.begruendung.push(`Verpflegungspauschale ${eur(st)} für An-/Abreisetag.`); }
  steuer.betrag = Math.max(0, cent(st - (st > 0 ? kuerzung : 0)));
  if (st > 0 && kuerzung > 0) steuer.begruendung.push(`Gekürzt um ${eur(Math.min(kuerzung, st))} wegen gestellter Mahlzeiten (${mahlzeitenText}).`);
  return { ok: true, tarif, steuer, hinweise };
}

/** Monat, in dem die Spesen eines Arbeitsmonats mit dem Lohn ausgezahlt werden (JJJJ-MM). versatz = Monate nach dem Arbeitsmonat. */
export function auszahlungsMonat(arbeitsMonat: string, versatz: number): string {
  const [y, m] = arbeitsMonat.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + Math.max(0, Math.round(versatz)), 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const SATZ_SCHLUESSEL: Record<string, string[]> = {
  tarif: ['verpflegung_heimfahrt', 'verpflegung_schwelle_stunden', 'ausloesung_voll', 'ausloesung_an_abreise'],
  steuer: ['pauschale_ueber_8h', 'pauschale_schwelle_stunden', 'pauschale_24h', 'pauschale_an_abreise', 'kuerzung_fruehstueck_prozent', 'kuerzung_mittag_prozent', 'kuerzung_abend_prozent'],
  betrieb: ['auszahlung_monate_versatz'],
};

/** Endbetrag (Tarif) eines Tages: manueller Wert hat Vorrang vor dem Vorschlag. */
export const endbetrag = (z: { betrag_manuell?: number | string | null; vorschlag_tarif?: number | string | null }) =>
  z.betrag_manuell !== null && z.betrag_manuell !== undefined ? Number(z.betrag_manuell) : Number(z.vorschlag_tarif || 0);
