// ============================================================
// SCAFFOLD OS – Wissensbasis des Hilfe-Assistenten
//
// Der Assistent antwortet NUR aus diesen Einträgen. Quellen:
//  1. Das Menü (components/shell/nav-config.ts): automatisch, immer aktuell, mit den Rollen, die den Punkt sehen.
//  2. Die Hilfe-Abschnitte der Seite /hilfe (HANDBUCH, hier als Text; ein Test hält die Titel mit der Seite in Einklang).
//  3. Wenige geprüfte Funktionsbeschreibungen (FUNKTIONEN). Neue Funktionen hier ergänzen, sonst kennt der Assistent sie nicht.
// Was hier nicht steht, beantwortet der Assistent nicht, sondern verweist auf den Support.
// ============================================================

import { NAV_GRUPPEN, NAV_UEBERSICHT, ROLLEN_NAME, type Rolle } from '@/components/shell/nav-config'

export interface WissensEintrag {
  id: string
  titel: string
  text: string
  /** Seite in der App, zu der der Eintrag gehört (nur dann wird ein Link angeboten) */
  pfad?: string
  /** Rollen, die diese Seite sehen; leer = alle */
  rollen?: readonly Rolle[]
  /** zusätzliche Suchwörter */
  stichwoerter?: string
}

export const SUPPORT_MAIL = 'info@scaffoldos.de'

export const HANDBUCH: { titel: string; text: string; pfad?: string }[] = [
  { titel: 'Erste Schritte nach dem Kauf', text: 'Willkommens-E-Mail öffnen: dort stehen Adresse und Admin-Zugangsdaten. Auf der Firmen-Adresse (z. B. ihr-name.scaffoldos.de) einloggen. Einstellungen öffnen und das Firmenprofil ausfüllen (Pflicht für Rechnungen). Unter Zugänge die Mitarbeiter anlegen und Rollen vergeben. Unter Datenpflege Fahrzeuge, Fahrer und Lagerbestand eintragen.' },
  { titel: 'Aufmaß und Angebot erstellen (Schritt 1–6)', pfad: '/aufmass/schritt1', text: 'Menü Aufmaß, Projekt anlegen (Kunde, Adresse, Fotos möglich). Schritte 2 bis 5 ausfüllen: Maße, Gerüst, Umgebung, Zusammenfassung. In Schritt 6 „KI Planung starten“: Materialliste, Preis und Risiko prüfen. Bei Bedarf Skonto, Mietverlängerung, Nachtrag oder Rabatt anpassen. Projekt speichern, dann Angebot als PDF oder direkt per E-Mail an den Kunden. Vor Ort kann der Kunde digital unterschreiben, dann steht der Status auf Angenommen. Projekte lassen sich später über das Dashboard wieder öffnen, alle Daten inklusive KI-Ergebnis bleiben gespeichert.' },
  { titel: 'Rechnungen schreiben', text: 'Menü Rechnungen, „Neue Rechnung“, oder aus einem angenommenen Angebot per Klick auf „Rechnung erstellen“ (Positionen werden übernommen). Typ wählen: Vollrechnung, Abschlags- oder Schlussrechnung. Positionen eintragen, USt-Satz wählen, Zahlungsziel prüfen (automatisch plus 14 Tage). Anlegen: die Nummer (RE-JAHR-0001 …) wird automatisch vergeben. PDF herunterladen oder per E-Mail an den Kunden senden (Briefumschlag-Symbol). Status pflegen: offen, bezahlt, überfällig, storniert.' },
  { titel: 'Mahnungen erstellen', text: 'Überfällige Rechnungen zeigen ein Warn-Symbol (gelbes Dreieck). Klick darauf erstellt die 1. Mahnung als PDF, optional direkt per E-Mail. Bleibt die Rechnung offen, erzeugt ein Klick die 2. Mahnung (mit Hinweis auf Verzugszinsen). Die Mahnstufe steht in der Liste als Badge „1. Mahnung“ oder „2. Mahnung“.' },
  { titel: 'Touren, Routen-KI und Disposition', pfad: '/routenoptimierung', text: 'Depot-Adresse einmalig unter Einstellungen hinterlegen, sie ist in der Routen-KI vorbefüllt. Morgens Routen-KI öffnen, Datum wählen, optimale Touren generieren und übernehmen. Im Touren-Cockpit Status und GPS der Fahrzeuge verfolgen. Bei kurzfristigen Änderungen: Umdisposition in der Routen-KI.' },
  { titel: 'Zeiterfassung und DATEV', pfad: '/zeiterfassung', text: 'Mitarbeiter tragen Zeiten über Meine Touren (Handy) ein. Admin oder Disposition prüft in der Zeiterfassung: Soll/Ist, Pausen, Überstunden; Korrekturen direkt dort. Exporte: CSV für Excel, DATEV Lohn für die Lohnabrechnung, DATEV-Buchungsstapel (im Rechnungsmodul) für die Buchhaltung. Vor dem ersten DATEV-Import Personalnummern, Kontenrahmen und Berater-/Mandantennummer mit dem Steuerberater abstimmen.' },
  { titel: 'Rollen und Rechte', text: 'Admin: alles, inklusive Datenpflege und Einstellungen. Disponent: Büro-Arbeit, Planung, Touren, Rechnungen, Zugänge. Bauleiter: Aufmaß, Planung, Lager, Zeiterfassung. Mitarbeiter: nur „Meine Touren“ (Einsätze, Zeiten, Fotos). Lager: Lager und Prognose.' },
  { titel: 'Künstliche Intelligenz in SCAFFOLD OS', text: 'SCAFFOLD OS nutzt KI an mehreren Stellen, jeweils mit dem Hinweis „KI-gestützt“: KI-Materialberechnung (Aufmaß Schritt 6: Stückliste, Preis, Risiko als Vorschlag), Foto- und Grundriss-Analyse (Schritt 1: erkannte Maße und Merkmale vorbefüllen das Aufmaß), Routen-KI (schlägt Touren vor, die Disposition entscheidet), Lager-Prognose (Einschätzung, was wann knapp wird). Grundsatz: Die KI macht Vorschläge, die fachliche Entscheidung trifft immer ein Mensch. KI-Ergebnisse vor dem Angebot oder einer Bestellung prüfen. Die KI analysiert Gebäude und Material, keine Personen.' },
  { titel: 'Häufige Probleme', text: '„Länge und Höhe fehlen“: Projekt über das Dashboard öffnen (Daten werden geladen), dann KI-Berechnung erneut starten. Rechnung ohne Bankdaten oder Steuernummer: Firmenprofil unter Einstellungen ausfüllen, Rechnung neu erstellen (alte Rechnungen bleiben bewusst unverändert, GoBD). Menüpunkt fehlt: Rolle prüfen, der Admin kann sie unter Zugänge anpassen. Passwort vergessen: auf der Login-Seite „Passwort vergessen“ nutzen.' },
]

export const FUNKTIONEN: WissensEintrag[] = [
  {
    id: 'f-ki-angebot', titel: 'KI-Angebot (Anfrage → Vorab-Kalkulation → Angebot)', pfad: '/aufmass/ki-angebot', rollen: ['admin', 'disponent'],
    stichwoerter: 'ki angebot anfrage telefon diktat chat vorab kalkulation entwurf mail pdf preis',
    text: 'Menü Aufmaß & Planung, KI-Angebot (nur Chef und Disposition). Die Anfrage des Kunden als Text eintippen oder diktieren; die KI liest die Angaben heraus (Kunde, Ort, Leistung, Fläche, Höhe, Standzeit) und zeigt sie als Entwurf. Der Kunde lässt sich aus dem Kundenordner zuordnen oder neu anlegen. Danach die Vorab-Kalkulation berechnen. Daraus gibt es drei Aktionen: „Angebot erstellen (PDF)“, „Entwurf speichern“ (legt Kunde und Baustelle an, ohne Angebot) und „Per Mail versenden“ (schickt das Angebots-PDF an die eingetragene E-Mail, nach einer Sicherheitsfrage). Das Angebot beruht auf der vorläufigen Vorab-Kalkulation, nicht auf einem Aufmaß. Im Chat lassen sich einzelne Angaben ändern (zum Beispiel der Preis); es wird nur das Genannte ergänzt oder geändert.',
  },
]

/** Alle Einträge: Menü (Rollen aus dem Menü), Handbuch, Funktionen. */
export function alleEintraege(): WissensEintrag[] {
  const liste: WissensEintrag[] = []
  const menue = (g: string, e: { href: string; label: string; roles?: Rolle[]; stichwoerter?: string }, gruppe: string) => {
    const wer = e.roles ? e.roles.map((r) => ROLLEN_NAME[r]).join(', ') : 'alle Rollen'
    liste.push({
      id: `m-${e.href}`, titel: e.label, pfad: e.href.split('?')[0], rollen: e.roles, stichwoerter: e.stichwoerter,
      text: `Menüpunkt „${e.label}“ in der Gruppe „${gruppe}“ der linken Menüleiste. Sichtbar für: ${wer}.`,
    })
    void g
  }
  menue('start', NAV_UEBERSICHT, 'Start (oben im Menü)')
  for (const g of NAV_GRUPPEN) for (const e of g.eintraege) menue(g.key, e, g.label)
  HANDBUCH.forEach((h, i) => liste.push({ id: `h-${i}`, titel: h.titel, text: h.text, pfad: h.pfad }))
  liste.push(...FUNKTIONEN)
  return liste
}

// ---------- Suche (lokal, ohne KI) ----------

const STOPP = new Set(['der', 'die', 'das', 'ein', 'eine', 'einen', 'wo', 'wie', 'was', 'ist', 'sind', 'kann', 'ich', 'man', 'finde', 'finden', 'mache', 'machen', 'und', 'oder', 'in', 'im', 'am', 'an', 'auf', 'zu', 'zum', 'zur', 'mit', 'von', 'fuer', 'für', 'bei', 'wird', 'werden', 'mein', 'meine', 'meinen', 'muss', 'soll', 'gibt', 'es', 'nicht', 'den', 'dem', 'des', 'mir', 'bitte'])

const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
export const woerter = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOPP.has(w))
/** Wortanfang als Stamm, damit „Rechnung“ auch „Rechnungen“ findet */
const stamm = (w: string) => (w.length > 6 ? w.slice(0, 6) : w.length > 4 ? w.slice(0, w.length - 1) : w)

export interface Treffer { eintrag: WissensEintrag; punkte: number }

export function sucheEintraege(frage: string, rolle: Rolle, max = 5, liste: WissensEintrag[] = alleEintraege()): Treffer[] {
  const q = [...new Set(woerter(frage))]
  if (q.length === 0) return []
  const out: Treffer[] = []
  for (const e of liste) {
    const titelW = new Set(woerter(`${e.titel} ${e.stichwoerter ?? ''}`)); const restW = new Set(woerter(e.text))
    const trifft = (menge: Set<string>, w: string) => (w.length <= 3 ? menge.has(w) : [...menge].some((x) => x.startsWith(stamm(w)) || stamm(x) === stamm(w)))
    let p = 0
    for (const w of q) { if (trifft(titelW, w)) p += 3; else if (trifft(restW, w)) p += 1 }
    // ein einzelner Zufallstreffer im Fließtext reicht nicht
    if (p >= 2) out.push({ eintrag: e, punkte: p })
  }
  void rolle
  return out.sort((a, b) => b.punkte - a.punkte).slice(0, max)
}

/** Darf diese Rolle die Seite des Eintrags sehen? (für die Links unter der Antwort) */
export const sichtbarFuer = (e: WissensEintrag, rolle: Rolle): boolean => !e.rollen || e.rollen.includes(rolle)

export const KEINE_ANTWORT = `Dazu habe ich keine gesicherten Informationen. Bitte schau unter Hilfe nach oder schreib an ${SUPPORT_MAIL}.`
