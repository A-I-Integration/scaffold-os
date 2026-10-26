'use client'

import { useEffect } from 'react'

// Entfernt führende bunte Emoji vor Reitern, Knöpfen und Überschriften in der Desktop-Ansicht
// (ruhigere, sachliche Optik). Statussymbole (✅ ❌ ⚠️ ⏳ und farbige Punkte) bleiben, weil sie eine Bedeutung tragen.
const BEHALTEN = /^[\s]*(✅|❌|⚠️?|⏳|🔴|🟢|🟡|🟠|✓|✗|•)/u
const EMOJI_VORNE = /^\s*(?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u
const ZIELE = 'button, a, h1, h2, h3, h4, summary, th, label, legend'

export function bereinige(wurzel: ParentNode) {
  wurzel.querySelectorAll(ZIELE).forEach((el) => {
    const t = el.firstChild
    if (!t || t.nodeType !== Node.TEXT_NODE) return
    const v = t.nodeValue || ''
    if (BEHALTEN.test(v) || !EMOJI_VORNE.test(v)) return
    const neu = v.replace(EMOJI_VORNE, '')
    // Emoji allein im ersten Textknoten (Text folgt im Geschwisterknoten) ebenfalls entfernen
    if (neu.trim().length > 0 || (el.textContent || '').replace(v, '').trim().length > 0) t.nodeValue = neu
  })
}

export function useOhneBuntSymbole(aktiv: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wurzel = ref.current
    if (!aktiv || !wurzel) return
    let zeitgeber: ReturnType<typeof setTimeout> | null = null
    const lauf = () => { zeitgeber = null; bereinige(wurzel) }
    const mo = new MutationObserver(() => { if (!zeitgeber) zeitgeber = setTimeout(lauf, 50) })
    mo.observe(wurzel, { childList: true, subtree: true, characterData: true })
    lauf()
    return () => { mo.disconnect(); if (zeitgeber) clearTimeout(zeitgeber) }
  }, [aktiv, ref])
}
