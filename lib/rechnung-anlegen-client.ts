// ============================================================
// SCAFFOLD OS – Rechnung anlegen mit Abrechnungsfreigabe (Faktura F6, Browser)
// Drop-in für fetch('/api/invoices', { method: 'POST', … }): meldet der Server eine Abweichung in der Abrechnung (409, ABRECHNUNG_ABWEICHUNG),
// wird sie mit Begründung abgefragt und die Anfrage mit der Begründung wiederholt. Ohne Begründung bleibt es beim Fehler – nichts wird still angelegt.
// ============================================================

import { MIN_GRUND_LAENGE } from '@/lib/abrechnung-pruefung'

export async function fetchRechnungAnlegen(input: string, init: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status !== 409) return res
  let json: { code?: string; error?: string } | null = null
  try { json = await res.clone().json() } catch { return res }
  if (json?.code !== 'ABRECHNUNG_ABWEICHUNG') return res
  const grund = typeof window !== 'undefined'
    ? window.prompt(`${json.error}\n\nBegründung für die Freigabe (mind. ${MIN_GRUND_LAENGE} Zeichen) – Abbrechen, um die Rechnung nicht anzulegen:`)
    : null
  if (!grund || grund.trim().length < MIN_GRUND_LAENGE) return res
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(String(init.body || '{}')) } catch { return res }
  return fetch(input, { ...init, body: JSON.stringify({ ...body, abrechnung_grund: grund.trim() }) })
}
