'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, Send, AlertTriangle } from 'lucide-react'

// ============================================================
// SCAFFOLD OS – "E-Mails"-Register bei Kunden (Phase 48)
// ============================================================

interface EMail {
  id: string
  betreff: string
  von: string
  an: string
  datum: string
  text: string
  richtung: 'eingehend' | 'ausgehend'
}

export default function KundeEmails({ customerId, kundenEmail }: { customerId: string; kundenEmail: string | null | undefined }) {
  const [emails, setEmails] = useState<EMail[]>([])
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState('')
  const [postfaecher, setPostfaecher] = useState<string[]>([])
  const [teilFehler, setTeilFehler] = useState<string[]>([])
  const [geoeffnet, setGeoeffnet] = useState<string | null>(null)
  const [antwortText, setAntwortText] = useState('')
  const [antwortSenden, setAntwortSenden] = useState(false)

  const laden_fn = useCallback(() => {
    setLaden(true)
    setFehler('')
    fetch(`/api/kunden/${customerId}/emails`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) { setFehler(j.error); return }
        setEmails(j.emails)
        setPostfaecher(j.durchsuchtePostfaecher || [])
        setTeilFehler(j.fehler || [])
      })
      .catch((e) => setFehler(e.message))
      .finally(() => setLaden(false))
  }, [customerId])

  useEffect(() => { if (kundenEmail) laden_fn() }, [laden_fn, kundenEmail])

  async function antworten(email: EMail) {
    if (!antwortText.trim()) return
    setAntwortSenden(true)
    try {
      const res = await fetch(`/api/kunden/${customerId}/emails/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ an: kundenEmail, betreff: `Re: ${email.betreff}`, text: antwortText }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setAntwortText('')
      laden_fn()
    } catch (err: any) {
      alert('❌ ' + err.message)
    }
    setAntwortSenden(false)
  }

  if (!kundenEmail) {
    return <p className="text-xs text-[#86868b] p-4">Für diesen Kunden ist keine E-Mail-Adresse hinterlegt – im Reiter „Kunde" ergänzen, um E-Mails hier zu sehen.</p>
  }

  if (fehler) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {fehler}
          {fehler.includes('Kein E-Mail-Konto') && (
            <> Unter <a href="/meine-email" className="underline font-medium">Meine E-Mail</a> verbinden.</>
          )}
        </p>
        <button onClick={laden_fn} className="text-xs text-[#e8590c] font-medium hover:underline">Erneut versuchen</button>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-[#86868b]">{postfaecher.length > 0 && `Durchsucht: ${postfaecher.join(', ')}`}</p>
        <button onClick={laden_fn} disabled={laden} className="flex items-center gap-1 text-xs text-[#e8590c] font-medium hover:underline disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${laden ? 'animate-spin' : ''}`} /> Aktualisieren
        </button>
      </div>
      {teilFehler.length > 0 && (
        <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2">Bei {teilFehler.length} Postfach/Postfächern gab es beim Abrufen ein Problem: {teilFehler.join(' · ')}</p>
      )}

      {laden && emails.length === 0 && <p className="text-xs text-[#86868b]">Lädt…</p>}
      {!laden && emails.length === 0 && <p className="text-xs text-[#86868b]">Keine E-Mails mit {kundenEmail} gefunden.</p>}

      <div className="space-y-2 mt-2">
        {emails.map((e) => (
          <div key={e.id} className="bg-white rounded-xl border border-black/10">
            <button onClick={() => setGeoeffnet(geoeffnet === e.id ? null : e.id)} className="w-full text-left p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#1d1d1f] truncate">
                  {e.richtung === 'ausgehend' && <span className="text-[10px] text-blue-600 mr-1">↗ gesendet</span>}
                  {e.betreff}
                </span>
                <span className="text-[10px] text-[#86868b] shrink-0">{new Date(e.datum).toLocaleDateString('de-DE')}</span>
              </div>
              <p className="text-xs text-[#86868b] truncate">{e.richtung === 'ausgehend' ? `An: ${e.an}` : e.von}</p>
            </button>
            {geoeffnet === e.id && (
              <div className="border-t border-black/5 p-3 space-y-3">
                <p className="text-sm text-[#424245] whitespace-pre-wrap">{e.text}</p>
                <div className="pt-2 border-t border-black/5">
                  <textarea
                    value={antwortText}
                    onChange={(ev) => setAntwortText(ev.target.value)}
                    placeholder={`Antwort an ${kundenEmail}…`}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                  <button
                    onClick={() => antworten(e)}
                    disabled={antwortSenden || !antwortText.trim()}
                    className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#e8590c] text-white font-medium disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" /> {antwortSenden ? 'Wird gesendet…' : 'Antworten'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
