import { describe, it, expect } from 'vitest'
import { waehleCadAnsicht, passeBildEin } from '@/lib/angebot-3d-ansicht'

describe('3D-Ansicht im Angebot', () => {
  const z = (file_name: string, created_at: string, file_type = 'image/png') => ({ file_name, file_type, storage_path: 'p/' + file_name, created_at })
  it('nimmt das neueste CAD-Ansicht-Bild', () => {
    const r = waehleCadAnsicht([z('foto.jpg', '2026-10-01'), z('CAD-Ansicht-2026-10-20.png', '2026-10-20'), z('CAD-Ansicht-Praesentation-2026-10-25.png', '2026-10-25')])
    expect(r?.file_name).toBe('CAD-Ansicht-Praesentation-2026-10-25.png')
  })
  it('ignoriert Nicht-Bilder und andere Dateien', () => {
    expect(waehleCadAnsicht([z('CAD-Ansicht-x.pdf', '2026-10-20', 'application/pdf'), z('foto.png', '2026-10-21')])).toBeNull()
    expect(waehleCadAnsicht([])).toBeNull()
  })
  it('passt Bilder ein, ohne das Seitenverhältnis zu ändern', () => {
    expect(passeBildEin(1200, 800, 180, 120)).toEqual({ w: 180, h: 120 })
    expect(passeBildEin(800, 1200, 180, 120)).toEqual({ w: 80, h: 120 })
    expect(passeBildEin(0, 10, 180, 120)).toEqual({ w: 0, h: 0 })
  })
})
