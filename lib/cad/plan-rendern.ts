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

import { flaechenAusOperatoren, type VektorFlaeche } from './pdf-vektoren'
import type { PlanText } from './grundriss-finden'

export interface PlanQuelle {
  seiten: number
  /** Gefüllte Flächen und Linien einer PDF-Seite in Seiten-Punkten (leer bei Bildern/Scans) */
  vektoren: (nr: number, drehungGrad: number) => Promise<VektorFlaeche[]>
  /** Texte einer PDF-Seite mit Position in Seiten-Punkten (leer bei Bildern/Scans) */
  texte: (nr: number, drehungGrad: number) => Promise<PlanText[]>
  zeige: (nr: number, drehungGrad: number) => Promise<PlanSeite>
  /** Ausschnitt (Seiten-Punkte) in höherer Auflösung als Bildpunkte; null bei Bildern/Scans ohne Vektorseite */
  ausschnitt: (nr: number, drehungGrad: number, x: number, y: number, w: number, h: number, pxProPt: number) => Promise<{ data: Uint8ClampedArray; width: number; height: number } | null>
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
      vektoren: async () => [],
      texte: async () => [],
      ausschnitt: async () => null,
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
  const O = pdfjs.OPS
  return {
    seiten: dok.numPages,
    vektoren: async (nr, drehung) => {
      const seite = await dok.getPage(Math.min(Math.max(1, nr), dok.numPages))
      const rot = (((seite.rotate + drehung) % 360) + 360) % 360
      const vp = seite.getViewport({ scale: 1, rotation: rot })
      const ol = await seite.getOperatorList()
      return flaechenAusOperatoren(ol.fnArray, ol.argsArray, {
        save: O.save, restore: O.restore, transform: O.transform, constructPath: O.constructPath,
        fill: O.fill, eoFill: O.eoFill, fillStroke: O.fillStroke, eoFillStroke: O.eoFillStroke, closePath: O.closePath,
        setFillRGBColor: O.setFillRGBColor, stroke: O.stroke, closeStroke: O.closeStroke,
        closeFillStroke: O.closeFillStroke, closeEOFillStroke: O.closeEOFillStroke, setStrokeRGBColor: O.setStrokeRGBColor,
      }, vp.transform)
    },
    texte: async (nr, drehung) => {
      const seite = await dok.getPage(Math.min(Math.max(1, nr), dok.numPages))
      const rot = (((seite.rotate + drehung) % 360) + 360) % 360
      const vp = seite.getViewport({ scale: 1, rotation: rot })
      const tc = await seite.getTextContent()
      const out: PlanText[] = []
      for (const it of tc.items) {
        if (!('str' in it) || !it.str.trim()) continue
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
        out.push({ s: it.str, x, y, h: it.height })
      }
      return out
    },
    ausschnitt: async (nr, drehung, x, y, w, h, pxProPt) => {
      const seite = await dok.getPage(Math.min(Math.max(1, nr), dok.numPages))
      const rot = (((seite.rotate + drehung) % 360) + 360) % 360
      const vp = seite.getViewport({ scale: pxProPt, rotation: rot })
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * pxProPt)); c.height = Math.max(1, Math.ceil(h * pxProPt))
      if (c.width * c.height > 40_000_000) return null
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
      await seite.render({ canvas: c, canvasContext: g, viewport: vp, transform: [1, 0, 0, 1, -x * pxProPt, -y * pxProPt] }).promise
      const d = g.getImageData(0, 0, c.width, c.height)
      return { data: d.data, width: d.width, height: d.height }
    },
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
