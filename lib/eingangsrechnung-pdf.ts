// Browser-seitig: Text und eingebettetes XML aus einer PDF holen (pdf.js, wie im CAD-Planimport). Die Datei verlässt dabei das Gerät nicht.

export async function leseEingangsPdf(datei: File): Promise<{ text: string; xml: string | null }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const dok = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise
  const seiten: string[] = []
  for (let n = 1; n <= Math.min(dok.numPages, 6); n++) {
    const inhalt = await (await dok.getPage(n)).getTextContent()
    const zeilen = new Map<number, { x: number; s: string }[]>()
    for (const it of inhalt.items as any[]) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue
      const y = Math.round(it.transform[5] / 3)
      const l = zeilen.get(y) || []
      l.push({ x: it.transform[4], s: it.str })
      zeilen.set(y, l)
    }
    seiten.push([...zeilen.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => l.sort((a, b) => a.x - b.x).map((t) => t.s).join(' ')).join('\n'))
  }
  let xml: string | null = null
  try {
    const anh = await dok.getAttachments()
    for (const a of Object.values(anh || {}) as any[]) {
      if (/\.xml$/i.test(String(a.filename || '')) && a.content) { xml = new TextDecoder('utf-8').decode(a.content); break }
    }
  } catch { /* kein Anhang */ }
  return { text: seiten.join('\n'), xml }
}
