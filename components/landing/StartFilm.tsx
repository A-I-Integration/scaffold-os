'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import './start-film.css'

// ============================================================
// SCAFFOLD OS – Startseiten-Film (Scroll-Story in 3D)
//
// Sieben Kapitel vom Drohnenscan bis zum Dashboard. Text und Karte kommen im Wechsel von links und rechts herein.
// Die 3D-Szene (three.js) wird erst geladen, wenn der Film im Bild ist; ohne WebGL bleibt die dunkle Bühne mit den Texten.
// Alle Zahlen in den Karten sind Demo-Daten und so gekennzeichnet. Es werden nur vorhandene Funktionen gezeigt.
// ============================================================

const TERMIN = '/anfrage?art=demo'

export default function StartFilm() {
  const wurzel = useRef<HTMLDivElement>(null)
  const story = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const root = wurzel.current, st = story.current, sg = stage.current, cv = canvas.current
    if (!root || !st || !sg || !cv) return
    let szene: { dispose: () => void; resize: () => void; sichtbar: (an: boolean) => void } | null = null
    let beendet = false
    let io: IntersectionObserver | null = null
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Höhe der Kopfzeile (Meldungsleiste und Menü) messen, damit die Bühne darunter beginnt
    const misse = () => {
      const kopf = document.querySelector('[data-landing-kopf]') as HTMLElement | null
      root.style.setProperty('--sf-top', (kopf ? kopf.getBoundingClientRect().height : 0) + 'px')
      szene?.resize()
    }
    misse()
    window.addEventListener('resize', misse)

    import('./start-film-szene').then(({ starteSzene }) => {
      if (beendet) return
      szene = starteSzene(st, sg, cv, reduce)
      if (!szene) { root.classList.add('sf-nogl'); return }
      io = new IntersectionObserver((es) => szene?.sichtbar(es[0].isIntersecting), { rootMargin: '200px 0px' })
      io.observe(st)
    }).catch(() => root.classList.add('sf-nogl'))

    return () => { beendet = true; window.removeEventListener('resize', misse); io?.disconnect(); szene?.dispose() }
  }, [])

  const springe = (p: number) => {
    const st = story.current, sg = stage.current
    if (!st || !sg) return
    const span = st.offsetHeight - sg.clientHeight
    window.scrollTo({ top: st.getBoundingClientRect().top + window.scrollY + p * span, behavior: 'smooth' })
  }

  return (
    <div className="sf-root" ref={wurzel} aria-label="SCAFFOLD OS im Überblick: vom Drohnenscan bis zur Rechnung">
      <div className="sf-story" ref={story}>
        <div className="sf-stage" ref={stage}>
          <canvas className="sf-gl" ref={canvas} aria-hidden="true" />
          <div className="sf-vignette" />
          <a className="sf-skip" href="#funktionen">Überspringen</a>
          <div className="sf-rail" aria-hidden="true">{Array.from({ length: 7 }).map((_, i) => <span key={i} className={i === 0 ? 'sf-on' : ''} />)}</div>
          <div className="sf-hint" id="sf-hint">Scrollen</div>
          <div className="sf-dim" id="sf-dimL">Länge 14,20 m</div>
          <div className="sf-dim" id="sf-dimH">Traufhöhe 7,20 m</div>

          <section className="sf-chap sf-on" aria-labelledby="sf-h0">
            <div className="sf-copy">
              <p className="sf-eyebrow">Drohnen-Scan</p>
              <h2 id="sf-h0" className="sf-h1">Vom ersten Scan bis zur Rechnung.</h2>
              <p className="sf-lead">Ein System für den ganzen Gerüstbau-Auftrag. Die Drohne erfasst das Gebäude, SCAFFOLD OS wertet die Punktwolke aus und liefert Länge, Breite und Höhe.</p>
              <div className="sf-cta-row"><Link className="sf-btn" href={TERMIN}>Demo anfordern</Link><button type="button" className="sf-btn sf-ghost" onClick={() => springe(0.16)}>Film ansehen</button></div>
            </div>
            <div className="sf-card"><span className="sf-tag">Demo-Daten</span><h3>Punktwolke</h3>
              <div className="sf-row"><span>Punkte</span><b id="sf-sPts">0</b></div>
              <div className="sf-row"><span>Gebäudeteile erkannt</span><b id="sf-sTeile">0</b></div>
              <div className="sf-row"><span>Genauigkeit</span><b>± 2 cm</b></div>
              <div className="sf-bar"><i id="sf-sBar" /></div>
            </div>
          </section>

          <section className="sf-chap sf-flip" aria-labelledby="sf-h1">
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
          </section>

          <section className="sf-chap" aria-labelledby="sf-h2">
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
          </section>

          <section className="sf-chap sf-flip" aria-labelledby="sf-h3">
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
          </section>

          <section className="sf-chap" aria-labelledby="sf-h4">
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
          </section>

          <section className="sf-chap sf-flip" aria-labelledby="sf-h5">
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
          </section>

          <section className="sf-chap" aria-labelledby="sf-h6">
            <div className="sf-copy">
              <p className="sf-eyebrow">Dashboard</p>
              <h2 id="sf-h6">Angebote, Aufträge, Lager, Personal. Ein Blick.</h2>
              <p className="sf-lead">Alles läuft in einer Oberfläche zusammen. Vom Scan bis zur Rechnung, ohne Medienbruch.</p>
              <div className="sf-cta-row"><Link className="sf-btn" href={TERMIN}>Demo anfordern</Link><button type="button" className="sf-btn sf-ghost" onClick={() => springe(0)}>Nochmal von vorn</button></div>
            </div>
            <div className="sf-card" style={{ width: 'min(100%, 420px)' }}><span className="sf-tag">Demo-Daten</span><h3>Übersicht</h3>
              <div className="sf-grid2">
                <div className="sf-tile"><small>Offene Angebote</small><strong id="sf-tA">0</strong></div>
                <div className="sf-tile"><small>Aktive Aufträge</small><strong id="sf-tB">0</strong></div>
                <div className="sf-tile"><small>Baustellen</small><strong id="sf-tC">0</strong></div>
                <div className="sf-tile"><small>Mitarbeiter heute</small><strong id="sf-tD">0</strong></div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div id="funktionen" />
    </div>
  )
}
