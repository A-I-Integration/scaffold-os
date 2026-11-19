// Browser: XRechnung (XML) vom Server holen und als Datei speichern. Wirft bei Fehlern eine verständliche Meldung.
export async function ladeXrechnung(invoiceId: string): Promise<void> {
  const r = await fetch('/api/invoices/xrechnung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: invoiceId }) })
  const j = await r.json()
  if (!j.success) {
    const d = Array.isArray(j.details) ? '\n\n' + j.details.map((x: { field: string; message: string }) => `• ${x.field}: ${x.message}`).join('\n') : typeof j.details === 'string' ? '\n\n' + j.details : ''
    throw new Error((j.error || 'XRechnung konnte nicht erstellt werden.') + d)
  }
  const url = URL.createObjectURL(new Blob([j.xml], { type: 'application/xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = j.dateiname || 'xrechnung.xml'
  a.click()
  URL.revokeObjectURL(url)
  if (j.warnung) alert('⚠️ ' + j.warnung)
}
