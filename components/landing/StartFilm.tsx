'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import './start-film.css'

// ============================================================
// SCAFFOLD OS – Startseite: sieben Abschnitte vom Drohnenscan bis zum Dashboard
//
// Jeder Abschnitt zeigt links oder rechts eine 3D-Animation, die beim Scrollen läuft, und daneben den Text. Die Seiten
// wechseln: Animation links, Text rechts, dann Text links, Animation rechts. Auf dem Handy steht die Animation über dem Text.
// Alle sieben Zeichenfelder teilen sich eine einzige WebGL-Szene (start-film-szene.ts), die erst geladen wird, wenn die
// Abschnitte in die Nähe des Fensters kommen. Ohne WebGL bleibt das Feld dunkel, die Texte stehen trotzdem da.
// Alle Zahlen in den Karten sind Demo-Daten und so gekennzeichnet. Es werden nur vorhandene Funktionen gezeigt.
// ============================================================

const TERMIN = '/anfrage?art=demo'

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
              </div>
              <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Drohnen-Scan</p>
              <h2 id="sf-h0" className="sf-h1">Vom ersten Scan bis zur Rechnung.</h2>
              <p className="sf-lead">Ein System für den ganzen Gerüstbau-Auftrag. Die Drohne erfasst das Gebäude, SCAFFOLD OS wertet die Punktwolke aus und liefert Länge, Breite und Höhe.</p>
              <div className="sf-cta-row"><Link className="sf-btn" href={TERMIN}>Demo anfordern</Link></div>
            </div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Punktwolke</h3>
              <div className="sf-row"><span>Punkte</span><b id="sf-sPts">0</b></div>
              <div className="sf-row"><span>Gebäudeteile erkannt</span><b id="sf-sTeile">0</b></div>
              <div className="sf-row"><span>Genauigkeit</span><b>± 2 cm</b></div>
              <div className="sf-bar"><i id="sf-sBar" /></div>
            </div>
              </div>
            </div>
          </section>

          <section className="sf-sec sf-flip" aria-labelledby="sf-h1" ref={(el) => { abschnitt.current[1] = el }}>
            <div className="sf-pin" ref={(el) => { pins.current[1] = el }}>
              <div className="sf-vis" ref={(el) => { rahmen.current[1] = el }}>
                <canvas className="sf-gl" ref={(el) => { felder.current[1] = el }} aria-hidden="true" />
              </div>
              <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Digitales Aufmaß</p>
              <h2 id="sf-h1">Aufmaß am Smartphone. Ohne Zettel.</h2>
              <p className="sf-lead">Maße, Fassadenflächen und Gerüstparameter landen direkt im Auftrag. Aus dem Scan sind die Werte schon vorbelegt.</p>
            </div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Aufmaß · Schritt 2</h3>
              <div className="sf-row"><span>Länge</span><b id="sf-aL">0,00 m</b></div>
              <div className="sf-row"><span>Traufhöhe</span><b id="sf-aH">0,00 m</b></div>
              <div className="sf-row"><span>Gerüstfläche</span><b id="sf-aF">0 m²</b></div>
              <div className="sf-row"><span>Dachform</span><b>Satteldach</b></div>
              <div className="sf-row"><span>Lastklasse</span><b>3</b></div>
            </div>
              </div>
            </div>
          </section>

          <section className="sf-sec" aria-labelledby="sf-h2" ref={(el) => { abschnitt.current[2] = el }}>
            <div className="sf-pin" ref={(el) => { pins.current[2] = el }}>
              <div className="sf-vis" ref={(el) => { rahmen.current[2] = el }}>
                <canvas className="sf-gl" ref={(el) => { felder.current[2] = el }} aria-hidden="true" />
              </div>
              <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">CAD und Angebot</p>
              <h2 id="sf-h2">Aus den Maßen wird ein Gerüstmodell und ein Angebot.</h2>
              <p className="sf-lead">Das CAD plant das Gerüst in 3D und rechnet die Stückliste. Daraus entsteht das Angebot mit Kosten, Marge und Verkaufspreis.</p>
            </div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Angebot</h3>
              <div className="sf-row"><span>Material</span><b id="sf-qM">0 €</b></div>
              <div className="sf-row"><span>Montage und Demontage</span><b id="sf-qA">0 €</b></div>
              <div className="sf-row"><span>Vorhaltung 4 Wochen</span><b id="sf-qV">0 €</b></div>
              <div className="sf-row"><span>Selbstkosten</span><b id="sf-qS">0 €</b></div>
              <div className="sf-row"><span>Marge</span><b id="sf-qG">0 %</b></div>
              <div className="sf-row sf-total"><span>Verkaufspreis</span><b id="sf-qP">0 €</b></div>
            </div>
              </div>
            </div>
          </section>

          <section className="sf-sec sf-flip" aria-labelledby="sf-h3" ref={(el) => { abschnitt.current[3] = el }}>
            <div className="sf-pin" ref={(el) => { pins.current[3] = el }}>
              <div className="sf-vis" ref={(el) => { rahmen.current[3] = el }}>
                <canvas className="sf-gl" ref={(el) => { felder.current[3] = el }} aria-hidden="true" />
              </div>
              <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Aufbau</p>
              <h2 id="sf-h3">Das Gerüst wächst Lage für Lage.</h2>
              <p className="sf-lead">Rahmen, Beläge, Diagonalen und Geländer stehen im Modell so, wie sie später gebaut werden.</p>
            </div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Baufortschritt</h3>
              <div className="sf-row"><span>Lage</span><b id="sf-bL">0 von 4</b></div>
              <div className="sf-row"><span>Stiele</span><b id="sf-bP">0</b></div>
              <div className="sf-row"><span>Beläge</span><b id="sf-bD">0</b></div>
              <div className="sf-row"><span>Geländer und Diagonalen</span><b id="sf-bR">0</b></div>
              <div className="sf-bar"><i id="sf-bBar" /></div>
            </div>
              </div>
            </div>
          </section>

          <section className="sf-sec" aria-labelledby="sf-h4" ref={(el) => { abschnitt.current[4] = el }}>
            <div className="sf-pin" ref={(el) => { pins.current[4] = el }}>
              <div className="sf-vis" ref={(el) => { rahmen.current[4] = el }}>
                <canvas className="sf-gl" ref={(el) => { felder.current[4] = el }} aria-hidden="true" />
              </div>
              <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Lager und Disposition</p>
              <h2 id="sf-h4">Das Material ist reserviert, bevor der LKW rollt.</h2>
              <p className="sf-lead">Bestände, Reservierungen und Transport laufen im selben System wie das Angebot.</p>
            </div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Lagerbestand</h3>
              <div className="sf-row"><span>Rahmen 2,07 m</span><b><span id="sf-lR">0</span> frei</b></div>
              <div className="sf-row"><span>Beläge 2,50 m</span><b><span id="sf-lB">0</span> frei</b></div>
              <div className="sf-row"><span>Diagonalen</span><b><span id="sf-lD">0</span> frei</b></div>
              <div className="sf-row"><span>Für diesen Auftrag reserviert</span><b id="sf-lX">0 %</b></div>
              <div className="sf-bar"><i id="sf-lBar" /></div>
            </div>
              </div>
            </div>
          </section>

          <section className="sf-sec sf-flip" aria-labelledby="sf-h5" ref={(el) => { abschnitt.current[5] = el }}>
            <div className="sf-pin" ref={(el) => { pins.current[5] = el }}>
              <div className="sf-vis" ref={(el) => { rahmen.current[5] = el }}>
                <canvas className="sf-gl" ref={(el) => { felder.current[5] = el }} aria-hidden="true" />
              </div>
              <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Mitarbeiter und Zeiterfassung</p>
              <h2 id="sf-h5">Stempeln am Handy. Die Zeit landet im Auftrag.</h2>
              <p className="sf-lead">Wer auf der Baustelle ist, stempelt ein und aus. Die Stunden gehören automatisch zum Auftrag.</p>
            </div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Zeiterfassung</h3>
              <div className="sf-row"><span>Eingestempelt</span><b>07:02</b></div>
              <div className="sf-row"><span>Ausgestempelt</span><b id="sf-zA">–</b></div>
              <div className="sf-row"><span>Arbeitszeit</span><b id="sf-zD">0 h 00 min</b></div>
              <div className="sf-row"><span>Zugeordnet</span><b>Auftrag Musterstraße</b></div>
            </div>
              </div>
            </div>
          </section>

          <section className="sf-sec" aria-labelledby="sf-h6" ref={(el) => { abschnitt.current[6] = el }}>
            <div className="sf-pin" ref={(el) => { pins.current[6] = el }}>
              <div className="sf-vis" ref={(el) => { rahmen.current[6] = el }}>
                <canvas className="sf-gl" ref={(el) => { felder.current[6] = el }} aria-hidden="true" />
              </div>
              <div className="sf-txt">
            <div className="sf-copy">
              <p className="sf-eyebrow">Dashboard</p>
              <h2 id="sf-h6">Angebote, Aufträge, Lager, Personal. Ein Blick.</h2>
              <p className="sf-lead">Alles läuft in einer Oberfläche zusammen. Vom Scan bis zur Rechnung, ohne Medienbruch.</p>
              <div className="sf-cta-row"><Link className="sf-btn" href={TERMIN}>Demo anfordern</Link></div>
            </div>
            <div className="sf-card" style={{ width: 'min(100%, 420px)' }}><span className="sf-tag">Demo-Daten</span><h3>Übersicht</h3>
              <div className="sf-grid2">
                <div className="sf-tile"><small>Offene Angebote</small><strong id="sf-tA">0</strong></div>
                <div className="sf-tile"><small>Aktive Aufträge</small><strong id="sf-tB">0</strong></div>
                <div className="sf-tile"><small>Baustellen</small><strong id="sf-tC">0</strong></div>
                <div className="sf-tile"><small>Mitarbeiter heute</small><strong id="sf-tD">0</strong></div>
              </div>
            </div>
              </div>
            </div>
          </section>
    </div>
  )
}
