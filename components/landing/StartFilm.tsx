'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import './start-film.css'

// ============================================================
// SCAFFOLD OS – Startseite: sieben Abschnitte vom Drohnenscan bis zum Dashboard
//
// Jeder Abschnitt zeigt links oder rechts eine 3D-Animation, die beim Scrollen läuft, und daneben den Text. Die Seiten
// wechseln: Animation links, Text rechts, dann Text links, Animation rechts. Auf dem Handy steht die Animation über dem Text.
// Die Texte neben den Bildern sind die Inhalte der Startseite (Hero, Was ist SCAFFOLD OS, drei Säulen, Funktionen).
// Alle sieben Zeichenfelder teilen sich eine einzige WebGL-Szene (start-film-szene.ts), die erst geladen wird, wenn die
// Abschnitte in die Nähe des Fensters kommen. Ohne WebGL bleibt das Feld dunkel, die Texte stehen trotzdem da.
// Alle Zahlen in den Karten sind Demo-Daten und so gekennzeichnet. Es werden nur vorhandene Funktionen gezeigt.
// ============================================================

const TERMIN = '/anfrage?art=demo'

const PROZESS = ['Aufmaß', 'Angebot', 'Disposition', 'Lager', 'Touren', 'Zeiterfassung', 'Rechnung']

function Liste({ punkte }: { punkte: string[] }) {
  return (
    <ul className="sf-list">
      {punkte.map((p) => (
        <li key={p}><Check className="sf-check" aria-hidden="true" />{p}</li>
      ))}
    </ul>
  )
}

export default function StartFilm() {
  const wurzel = useRef<HTMLDivElement>(null)
  const abschnitt = useRef<(HTMLElement | null)[]>([])
  const pins = useRef<(HTMLElement | null)[]>([])
  const rahmen = useRef<(HTMLElement | null)[]>([])
  const felder = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    const root = wurzel.current
    if (!root) return
    let szene: { dispose: () => void; resize: () => void } | null = null
    let beendet = false
    let io: IntersectionObserver | null = null
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Höhe der Kopfzeile (Meldungsleiste und Menü) messen, damit die Abschnitte darunter stehen bleiben
    const kopfHoehe = () => {
      const kopf = document.querySelector('[data-landing-kopf]') as HTMLElement | null
      return kopf ? kopf.getBoundingClientRect().height : 0
    }
    const misse = () => { root.style.setProperty('--sf-top', kopfHoehe() + 'px'); szene?.resize() }
    misse()
    window.addEventListener('resize', misse)

    // Text und Karte gleiten ein, sobald der Abschnitt sichtbar wird
    const ein = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('sf-in'); ein.unobserve(e.target) } }), { threshold: 0.25 })
    abschnitt.current.forEach((a) => { if (a) ein.observe(a) })

    // 3D-Szene erst laden, wenn die Abschnitte in der Nähe sind
    const laden = () => {
      import('./start-film-szene').then(({ starteSzene }) => {
        if (beendet) return
        const slots = abschnitt.current.map((a, ci) => ({ ci, abschnitt: a as HTMLElement, pin: pins.current[ci] as HTMLElement, rahmen: rahmen.current[ci] as HTMLElement, canvas: felder.current[ci] as HTMLCanvasElement }))
        if (slots.some((s) => !s.abschnitt || !s.pin || !s.rahmen || !s.canvas)) return
        szene = starteSzene(slots, reduce, kopfHoehe)
        if (!szene) root.classList.add('sf-nogl')
      }).catch(() => root.classList.add('sf-nogl'))
    }
    io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io?.disconnect(); laden() } }, { rootMargin: '600px 0px' })
    io.observe(root)

    return () => { beendet = true; window.removeEventListener('resize', misse); io?.disconnect(); ein.disconnect(); szene?.dispose() }
  }, [])

  return (
    <div className="sf-root" ref={wurzel} aria-label="SCAFFOLD OS im Überblick: vom Drohnenscan bis zur Rechnung">
      <section className="sf-sec" aria-labelledby="sf-h0" ref={(el) => { abschnitt.current[0] = el }}>
        <div className="sf-pin" ref={(el) => { pins.current[0] = el }}>
          <div className="sf-vis" ref={(el) => { rahmen.current[0] = el }}>
            <canvas className="sf-gl" ref={(el) => { felder.current[0] = el }} aria-hidden="true" />
            <div className="sf-dim" id="sf-dimL">Länge 14,20 m</div>
            <div className="sf-dim" id="sf-dimH">Traufhöhe 7,20 m</div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Punktwolke</h3>
              <div className="sf-row"><span>Punkte</span><b><span id="sf-sPts">0</span></b></div>
              <div className="sf-row"><span>Gebäudeteile erkannt</span><b><span id="sf-sTeile">0</span></b></div>
              <div className="sf-row"><span>Genauigkeit</span><b>± 2 cm</b></div>

              <div className="sf-bar"><i id="sf-sBar" /></div>
            </div>
          </div>
          <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Software für Gerüstbau-Betriebe</p>
              <h1 id="sf-h0">Die Gerüstbau-Software <span className="sf-gray">vom Aufmaß bis zur Rechnung.</span></h1>
              <p className="sf-lead sf-lead-strong">Vom Kundenanruf bis zur Rechnung. Ein System.</p>
              <p className="sf-lead">SCAFFOLD OS ersetzt Zettel, Excel und Telefonkette. Ein System für alles: <strong>KI-Aufmaß &amp; CAD-Planung</strong>, Angebot in Minuten, Touren mit GPS, Zeiterfassung und <strong>GoBD-Rechnung</strong>. Alles läuft im Browser – auf Handy, Tablet und PC.</p>
              <div className="sf-cta-row">
                <Link className="sf-btn" href={TERMIN}>Demo anfordern <ArrowRight className="sf-arrow" aria-hidden="true" /></Link>
                <Link className="sf-btn sf-ghost" href="/login">Zum Login</Link>
              </div>
              <p className="sf-small">Keine Installation · Läuft auf Handy, Tablet &amp; PC · Daten in Frankfurt am Main</p>
            </div>
          </div>
        </div>
      </section>
      <section className="sf-sec sf-flip" aria-labelledby="sf-h1" ref={(el) => { abschnitt.current[1] = el }}>
        <div className="sf-pin" ref={(el) => { pins.current[1] = el }}>
          <div className="sf-vis" ref={(el) => { rahmen.current[1] = el }}>
            <canvas className="sf-gl" ref={(el) => { felder.current[1] = el }} aria-hidden="true" />
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Aufmaß · Schritt 2</h3>
              <div className="sf-row"><span>Länge</span><b><span id="sf-aL">0,00 m</span></b></div>
              <div className="sf-row"><span>Traufhöhe</span><b><span id="sf-aH">0,00 m</span></b></div>
              <div className="sf-row"><span>Gerüstfläche</span><b><span id="sf-aF">0 m²</span></b></div>
              <div className="sf-row"><span>Dachform</span><b>Satteldach</b></div>
              <div className="sf-row"><span>Lastklasse</span><b>3</b></div>

            </div>
          </div>
          <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Aufmaß</p>
              <h2 id="sf-h1">Vom Foto zum fertigen Angebot <span className="sf-gray">– in Minuten statt Stunden.</span></h2>
              <Liste punkte={[
                'Baustelle in 6 geführten Schritten erfassen – am Handy, direkt vor Ort',
                'Fotos, Drohnen-Upload und GPS-Position automatisch verknüpft',
                'Punktwolken-Auswertung (3D-Scans): Maße direkt aus dem Scan, mit Genauigkeitsangabe',
                'Hersteller-Systeme mit echten Maßen: Layher, MJ, Plettac, Alfix u. a.',
              ]} />
            </div>
          </div>
        </div>
      </section>
      <section className="sf-sec" aria-labelledby="sf-h2" ref={(el) => { abschnitt.current[2] = el }}>
        <div className="sf-pin" ref={(el) => { pins.current[2] = el }}>
          <div className="sf-vis" ref={(el) => { rahmen.current[2] = el }}>
            <canvas className="sf-gl" ref={(el) => { felder.current[2] = el }} aria-hidden="true" />
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Angebot</h3>
              <div className="sf-row"><span>Material</span><b><span id="sf-qM">0 €</span></b></div>
              <div className="sf-row"><span>Montage und Demontage</span><b><span id="sf-qA">0 €</span></b></div>
              <div className="sf-row"><span>Vorhaltung 4 Wochen</span><b><span id="sf-qV">0 €</span></b></div>
              <div className="sf-row"><span>Selbstkosten</span><b><span id="sf-qS">0 €</span></b></div>
              <div className="sf-row"><span>Marge</span><b><span id="sf-qG">0 %</span></b></div>
              <div className="sf-row sf-total"><span>Verkaufspreis</span><b id="sf-qP">0 €</b></div>
            </div>
          </div>
          <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">CAD und Angebot</p>
              <h2 id="sf-h2">Aus den Maßen wird ein Gerüstmodell <span className="sf-gray">und ein Angebot.</span></h2>
              <p className="sf-lead">Das CAD plant das Gerüst in 3D und rechnet die Stückliste. Daraus entsteht das Angebot mit Kosten, Marge und Verkaufspreis.</p>
              <Liste punkte={[
                'KI rechnet Materialliste und Kalkulation, DIN-EN-12811-Hinweis-Check (KI-gestützt, ersetzt keine Statik)',
                'Angebots-PDF mit QR-Code und Unterschrift – direkt per Mail an den Kunden',
                'Ein Aufmaß mit Angebot dauert nach unserer Einschätzung etwa 15 Minuten statt oft 2 bis 3 Stunden (Richtwert, keine Kundenstudie)',
              ]} />
            </div>
          </div>
        </div>
      </section>
      <section className="sf-sec sf-flip" aria-labelledby="sf-h3" ref={(el) => { abschnitt.current[3] = el }}>
        <div className="sf-pin" ref={(el) => { pins.current[3] = el }}>
          <div className="sf-vis" ref={(el) => { rahmen.current[3] = el }}>
            <canvas className="sf-gl" ref={(el) => { felder.current[3] = el }} aria-hidden="true" />
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Baufortschritt</h3>
              <div className="sf-row"><span>Lage</span><b><span id="sf-bL">0 von 4</span></b></div>
              <div className="sf-row"><span>Stiele</span><b><span id="sf-bP">0</span></b></div>
              <div className="sf-row"><span>Beläge</span><b><span id="sf-bD">0</span></b></div>
              <div className="sf-row"><span>Geländer und Diagonalen</span><b><span id="sf-bR">0</span></b></div>

              <div className="sf-bar"><i id="sf-bBar" /></div>
            </div>
          </div>
          <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Aufbau und Touren</p>
              <h2 id="sf-h3">Das Gerüst wächst Lage für Lage. <span className="sf-gray">Und das Team ist rechtzeitig da.</span></h2>
              <Liste punkte={[
                'Digitaler Zwilling: Jede Baustelle als digitales Modell – Änderungen am Gerüst bleiben dokumentiert',
                'Routen-KI plant den Tag, GPS zeigt die Fahrzeuge, Umdisposition bei Krankheit oder Wetter',
                'Fahrer navigieren direkt aus der App, die Zentrale sieht jede Position live',
              ]} />
            </div>
          </div>
        </div>
      </section>
      <section className="sf-sec" aria-labelledby="sf-h4" ref={(el) => { abschnitt.current[4] = el }}>
        <div className="sf-pin" ref={(el) => { pins.current[4] = el }}>
          <div className="sf-vis" ref={(el) => { rahmen.current[4] = el }}>
            <canvas className="sf-gl" ref={(el) => { felder.current[4] = el }} aria-hidden="true" />
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Lagerbestand</h3>
              <div className="sf-row"><span>Rahmen 2,07 m</span><b><span id="sf-lR">0</span> frei</b></div>
              <div className="sf-row"><span>Beläge 2,50 m</span><b><span id="sf-lB">0</span> frei</b></div>
              <div className="sf-row"><span>Diagonalen</span><b><span id="sf-lD">0</span> frei</b></div>
              <div className="sf-row"><span>Für diesen Auftrag reserviert</span><b><span id="sf-lX">0 %</span></b></div>

              <div className="sf-bar"><i id="sf-lBar" /></div>
            </div>
          </div>
          <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Lager</p>
              <h2 id="sf-h4">Du weißt immer, was wo liegt <span className="sf-gray">– bevor Material fehlt.</span></h2>
              <Liste punkte={[
                'Alle Bestände digital erfasst – vom Rahmen bis zur Klemme',
                'Automatische Stückliste aus jedem Aufmaß: Was muss auf den Lkw?',
                'Reservierung pro Baustelle – kein Material wird doppelt verplant',
                'Prognose-KI warnt, bevor Bestände knapp werden',
              ]} />
            </div>
          </div>
        </div>
      </section>
      <section className="sf-sec sf-flip" aria-labelledby="sf-h5" ref={(el) => { abschnitt.current[5] = el }}>
        <div className="sf-pin" ref={(el) => { pins.current[5] = el }}>
          <div className="sf-vis" ref={(el) => { rahmen.current[5] = el }}>
            <canvas className="sf-gl" ref={(el) => { felder.current[5] = el }} aria-hidden="true" />
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Zeiterfassung</h3>
              <div className="sf-row"><span>Eingestempelt</span><b>07:02</b></div>
              <div className="sf-row"><span>Ausgestempelt</span><b><span id="sf-zA">–</span></b></div>
              <div className="sf-row"><span>Arbeitszeit</span><b><span id="sf-zD">0 h 00 min</span></b></div>
              <div className="sf-row"><span>Zugeordnet</span><b>Auftrag Musterstraße</b></div>

            </div>
          </div>
          <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Mitarbeiter und Zeiterfassung</p>
              <h2 id="sf-h5">Jeder Kollege hat seinen Zugang <span className="sf-gray">– und du hast den Überblick.</span></h2>
              <Liste punkte={[
                'Zugänge mit Rollen: Admin, Disponent, Bauleiter, Mitarbeiter, Lager',
                'Zeiterfassung per Handy: stempeln, Pausen laufen automatisch',
                'Krank und Urlaub landen direkt in der Tagesplanung',
                'Soll-Ist-Vergleich und Überstunden auf einen Blick',
              ]} />
            </div>
          </div>
        </div>
      </section>
      <section className="sf-sec" aria-labelledby="sf-h6" ref={(el) => { abschnitt.current[6] = el }}>
        <div className="sf-pin" ref={(el) => { pins.current[6] = el }}>
          <div className="sf-vis" ref={(el) => { rahmen.current[6] = el }}>
            <canvas className="sf-gl" ref={(el) => { felder.current[6] = el }} aria-hidden="true" />
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Übersicht</h3>
              <div className="sf-grid2">
                <div className="sf-tile"><small>Offene Angebote</small><strong id="sf-tA">0</strong></div>
                <div className="sf-tile"><small>Aktive Aufträge</small><strong id="sf-tB">0</strong></div>
                <div className="sf-tile"><small>Baustellen</small><strong id="sf-tC">0</strong></div>
                <div className="sf-tile"><small>Mitarbeiter heute</small><strong id="sf-tD">0</strong></div>
              </div>
            </div>
          </div>
          <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Alles in einem System</p>
              <h2 id="sf-h6">Du erfasst jede Info nur einmal <span className="sf-gray">– und hast sie überall.</span></h2>
              <p className="sf-lead"><strong>Gerüstbau</strong> bedeutet Büroarbeit. Aufmaß per Hand, Angebot in Word, Stundenzettel auf Papier. SCAFFOLD OS macht Schluss damit: auf der Baustelle, im Büro, unterwegs.</p>
              <div className="sf-chips" aria-label="Prozesskette">
                {PROZESS.map((schritt, i) => (
                  <span key={schritt} className="sf-chipwrap"><span className="sf-chip">{schritt}</span>{i < PROZESS.length - 1 && <ArrowRight className="sf-chiparrow" aria-hidden="true" />}</span>
                ))}
              </div>
              <Liste punkte={[
                'Rechnungen nach GoBD-Grundsätzen (lückenlose Nummern, Storno statt Löschen) mit Mahnwesen – Buchungsstapel und Lohndaten für den Steuerberater',
                'Eigene Datenbank pro Betrieb, EU-Hosting in Frankfurt, Datenschutz nach DSGVO',
              ]} />
              <div className="sf-cta-row"><Link className="sf-btn" href={TERMIN}>Demo anfordern <ArrowRight className="sf-arrow" aria-hidden="true" /></Link></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
