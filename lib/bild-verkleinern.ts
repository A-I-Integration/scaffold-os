// Foto im Browser verkleinern (längste Seite 1800 px, JPEG): kleiner Upload, schnellere Auswertung. Nur im Browser verwenden.
export async function verkleinereBild(datei: File): Promise<string> {
  const url = URL.createObjectURL(datei)
  try {
    const img = await new Promise<HTMLImageElement>((ok, fehl) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fehl(new Error('Das Bild konnte nicht gelesen werden.')); i.src = url })
    const f = Math.min(1, 1800 / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * f); c.height = Math.round(img.height * f)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}
