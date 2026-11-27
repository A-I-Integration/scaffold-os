// Browser-seitig: Text und eingebettetes XML aus einer PDF holen (pdf.js, wie im CAD-Planimport). Die Datei verlässt dabei das Gerät nicht.

export async function leseEingangsPdf(datei: File): Promise<{ text: string; xml: string | null; pdfjsDok: any }> {
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
  return { text: seiten.join('\n'), xml, pdfjsDok: dok }
}

/** Texterkennung (Tesseract) im Browser. Dateien kommen von der eigenen Seite (public/tesseract), es wird nichts an Dritte gesendet. */
async function erkenneBilder(quellen: (HTMLCanvasElement | File)[], fortschritt?: (t: string) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const w = await createWorker('deu', 1, {
    workerPath: '/tesseract/worker.min.js', corePath: '/tesseract', langPath: '/tesseract/lang', gzip: true, workerBlobURL: false,
    logger: (m: any) => { if (m?.status === 'recognizing text' && typeof m.progress === 'number') fortschritt?.(`Texterkennung ${Math.round(m.progress * 100)} %`) },
  })
  try {
    const teile: string[] = []
    for (const q of quellen) teile.push((await w.recognize(q as any)).data.text)
    return teile.join('\n')
  } finally { await w.terminate().catch(() => undefined) }
}

export interface DateiInhalt { text: string; xml: string | null; ocr: boolean }

/** PDF: Text und XML direkt; hat die PDF keinen Text (Scan), wird sie per Texterkennung gelesen. Bilder (JPG/PNG/WebP): Texterkennung. */
export async function leseEingangsDatei(datei: File, fortschritt?: (t: string) => void): Promise<DateiInhalt> {
  if (/\.(jpe?g|png|webp)$/i.test(datei.name)) {
    fortschritt?.('Texterkennung …')
    return { text: await erkenneBilder([datei], fortschritt), xml: null, ocr: true }
  }
  fortschritt?.('PDF wird gelesen …')
  const { text, xml, pdfjsDok } = await leseEingangsPdf(datei)
  if (xml || text.replace(/\s/g, '').length >= 30) return { text, xml, ocr: false }
  // Scan ohne Textebene: Seiten als Bild darstellen und erkennen (höchstens 3 Seiten)
  const bilder: HTMLCanvasElement[] = []
  for (let n = 1; n <= Math.min(pdfjsDok.numPages, 3); n++) {
    const seite = await pdfjsDok.getPage(n)
    const vp = seite.getViewport({ scale: 2.5 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
    await seite.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise
    bilder.push(canvas)
  }
  fortschritt?.('Texterkennung …')
  return { text: await erkenneBilder(bilder, fortschritt), xml: null, ocr: true }
}
