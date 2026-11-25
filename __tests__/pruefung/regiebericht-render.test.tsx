import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RegieberichtBlock, { RegieUebernahme } from '@/components/RegieberichtBlock'

describe('Regiebericht Darstellung', () => {
  it('Block zeigt zunächst den Ladezustand (Daten kommen im Browser)', () => {
    expect(renderToStaticMarkup(<RegieberichtBlock projectId="p1" />)).toContain('Regieberichte werden geladen')
  })
  it('Übernahme zeigt ohne offene Berichte nichts', () => {
    expect(renderToStaticMarkup(<RegieUebernahme projectId="p1" uebernommen={[]} onUebernehmen={() => {}} />)).toBe('')
  })
})
