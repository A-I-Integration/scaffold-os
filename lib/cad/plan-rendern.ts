// ============================================================
// SCAFFOLD OS – Plan-PDF/Bild im Browser als Bild darstellen (für die Vorlage im Umriss-Zeichner).
// pdf.js wird erst beim Laden eines Plans geholt (nicht im Standard-Bundle der CAD-Seite).
// Nur im Browser aufrufen.
// ============================================================

export interface PlanSeite {
  url: string
  /** Seitengröße in PDF-Punkten (1 pt = 1/72 Zoll). Bei Bildern aus 150 dpi angenommen – dann Prüfmaß setzen. */
  breitePt: number
  hoehePt: number
}

export interface PlanQuelle {
  seiten: number
  zeige: (nr: number, drehungGrad: number) => Promise<PlanSeite>
  freigeben: () => void
}

const MAX_KANTE_PX = 6000
const BILD_DPI_ANNAHME = 150

export async function ladePlanQuelle(datei: File): Promise<PlanQuelle> {
  const urls: string[] = []
  const merke = (u: string) => { urls.push(u); return u }
  const freigeben = () => { for (const u of urls.splice(0)) URL.revokeObjectURL(u) }

  const name = datei.name.toLowerCase()
  if (datei.type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) {
    return {
      seiten: 1,
      freigeben,
      zeige: async (_nr, drehung) => {
        const bildUrl = merke(URL.createObjectURL(datei))
        const img = new Image()
        await new Promise<void>((ok, fehl) => { img.onload = () => ok(); img.onerror = () => fehl(new Error('Das Bild konnte nicht gelesen werden.')); img.src = bildUrl })
        const pt = (px: number) => (px * 72) / BILD_DPI_ANNAHME
        if (drehung % 180 === 0) return { url: bildUrl, breitePt: pt(img.naturalWidth), hoehePt: pt(img.naturalHeight) }
        const c = document.createElement('canvas'); c.width = img.naturalHeight; c.height = img.naturalWidth
        const g = c.getContext('2d')!
        g.translate(c.width / 2, c.height / 2); g.rotate((drehung * Math.PI) / 180); g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
        const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.9))
        if (!blob) throw new Error('Das Bild konnte nicht gedreht werden.')
        return { url: merke(URL.createObjectURL(blob)), breitePt: pt(c.width), hoehePt: pt(c.height) }
      },
    }
  }

  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const dok = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise
  return {
    seiten: dok.numPages,
    freigeben: () => { freigeben(); void dok.destroy() },
    zeige: async (nr, drehung) => {
      const seite = await dok.getPage(Math.min(Math.max(1, nr), dok.numPages))
      const rot = (((seite.rotate + drehung) % 360) + 360) % 360
      const vp1 = seite.getViewport({ scale: 1, rotation: rot })
      const scale = Math.min(4, MAX_KANTE_PX / Math.max(vp1.width, vp1.height))
      const vp = seite.getViewport({ scale, rotation: rot })
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
      const g = c.getContext('2d')!
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
      await seite.render({ canvas: c, canvasContext: g, viewport: vp }).promise
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.9))
      if (!blob) throw new Error('Die Plan-Seite konnte nicht dargestellt werden.')
      return { url: merke(URL.createObjectURL(blob)), breitePt: vp1.width, hoehePt: vp1.height }
    },
  }
}
