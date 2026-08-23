'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cookie } from 'lucide-react'

// ============================================================
// SCAFFOLD OS – Cookie-/Einwilligungs-Banner (DSGVO/TTDSG)
//
// Wird NUR im Layout gerendert, wenn NEXT_PUBLIC_GOOGLE_ADS_ID
// gesetzt ist (= Master-Website). Ohne Marketing-Tracking auf
// der Instanz braucht es keinen Banner.
//
// Prinzipien:
//  - Kein Tracking vor Einwilligung (Consent Mode default:
//    „denied", siehe app/layout.tsx)
//  - „Ablehnen" ist genauso einfach wie „Akzeptieren"
//  - Entscheidung + Zeitstempel in localStorage
//  - Widerruf jederzeit über „Cookie-Einstellungen" (unten links)
// ============================================================

const STORAGE_KEY = 'scaffold-consent-v1'

type Entscheidung = 'accepted' | 'rejected'

function gtagConsentUpdate(granted: boolean) {
  const w = window as any
  w.dataLayer = w.dataLayer || []
  if (!w.gtag) {
    w.gtag = function gtag() {
      w.dataLayer.push(arguments)
    }
  }
  w.gtag('consent', 'update', {
    ad_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
    analytics_storage: granted ? 'granted' : 'denied',
  })
}

export default function CookieBanner() {
  const [zeigen, setZeigen] = useState(false)

  useEffect(() => {
    try {
      const roh = localStorage.getItem(STORAGE_KEY)
      if (!roh) {
        setZeigen(true)
        return
      }
      const gespeichert = JSON.parse(roh) as { entscheidung?: Entscheidung }
      // Gespeicherte Einwilligung bei jedem Seitenaufruf erneut an gtag melden
      if (gespeichert.entscheidung === 'accepted') {
        gtagConsentUpdate(true)
      }
    } catch {
      setZeigen(true)
    }
  }, [])

  function entscheiden(entscheidung: Entscheidung) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ entscheidung, zeitpunkt: new Date().toISOString() })
      )
    } catch {
      // localStorage nicht verfügbar → Banner einfach nur schließen
    }
    gtagConsentUpdate(entscheidung === 'accepted')
    setZeigen(false)
  }

  return (
    <>
      {/* Dauerhafter Widerrufs-Link (nur nach getroffener Entscheidung) */}
      {!zeigen && (
        <button
          onClick={() => setZeigen(true)}
          className="fixed bottom-4 left-4 z-40 text-[12px] text-[#86868b] hover:text-[#1d1d1f] underline underline-offset-2 bg-white/80 backdrop-blur px-2 py-1 rounded-lg"
        >
          Cookie-Einstellungen
        </button>
      )}

      {zeigen && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
          <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.16)] border border-black/[0.06] p-5 sm:p-6">
            <div className="flex items-start gap-3.5">
              <Cookie className="w-6 h-6 text-[#e8590c] shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-[#1d1d1f] mb-1">
                  Cookies &amp; Werbetracking
                </p>
                <p className="text-[13px] text-[#6e6e73] leading-relaxed mb-4">
                  Wir nutzen technisch notwendige Cookies, damit die Seite funktioniert.
                  Mit Ihrer Einwilligung setzen wir zusätzlich Google Ads ein, um die
                  Wirkung unserer Werbung zu messen. Ohne Einwilligung findet kein
                  Marketing-Tracking statt. Details in unserer{' '}
                  <Link href="/datenschutz" className="text-[#e8590c] underline underline-offset-2">
                    Datenschutzerklärung
                  </Link>
                  . Sie können Ihre Entscheidung jederzeit über „Cookie-Einstellungen"
                  unten links ändern.
                </p>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => entscheiden('accepted')}
                    className="flex-1 py-2.5 px-4 bg-[#e8590c] hover:bg-[#d9480f] text-white text-sm font-medium rounded-full transition-colors"
                  >
                    Alle akzeptieren
                  </button>
                  <button
                    onClick={() => entscheiden('rejected')}
                    className="flex-1 py-2.5 px-4 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-sm font-medium rounded-full transition-colors"
                  >
                    Nur notwendige
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
