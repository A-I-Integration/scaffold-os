import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { pruefeCronAufruf } from '../cron-auth'

const req = (auth?: string) => new Request('http://x/api/cron/test', { headers: auth ? { authorization: auth } : {} })

describe('pruefeCronAufruf', () => {
  it('ohne CRON_SECRET: gesperrt (500), nicht offen', () => {
    expect(pruefeCronAufruf(req(), undefined)?.status).toBe(500)
    expect(pruefeCronAufruf(req(), '')?.status).toBe(500)
    // auch ein "Bearer undefined"/"Bearer " Header öffnet nichts
    expect(pruefeCronAufruf(req('Bearer undefined'), undefined)?.status).toBe(500)
    expect(pruefeCronAufruf(req('Bearer '), '')?.status).toBe(500)
  })
  it('falsches oder fehlendes Token: 401', () => {
    expect(pruefeCronAufruf(req(), 'geheim')?.status).toBe(401)
    expect(pruefeCronAufruf(req('Bearer falsch'), 'geheim')?.status).toBe(401)
    expect(pruefeCronAufruf(req('geheim'), 'geheim')?.status).toBe(401)
    expect(pruefeCronAufruf(req('Bearer geheim2'), 'geheim')?.status).toBe(401)
  })
  it('richtiges Token: darf laufen (null)', () => {
    expect(pruefeCronAufruf(req('Bearer geheim'), 'geheim')).toBeNull()
  })
})

describe('Alle Cron-Routen sind abgesichert', () => {
  const ordner = join(process.cwd(), 'app/api/cron')
  const routen = readdirSync(ordner).filter(d => existsSync(join(ordner, d, 'route.ts')))

  it('es gibt Cron-Routen', () => { expect(routen.length).toBeGreaterThan(0) })
  for (const r of routen) {
    it(`${r}: ruft pruefeCronAufruf auf und hat keine "falls gesetzt"-Prüfung mehr`, () => {
      const code = readFileSync(join(ordner, r, 'route.ts'), 'utf-8')
      expect(code).toMatch(/pruefeCronAufruf\(req\)/)
      expect(code).not.toMatch(/if\s*\(\s*cronSecret\s*\)/)
    })
  }

  it('jeder Pfad aus vercel.json hat eine abgesicherte Route', () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8'))
    for (const c of cfg.crons as { path: string }[]) {
      const name = c.path.replace('/api/cron/', '')
      expect(routen, `${c.path} fehlt unter app/api/cron`).toContain(name)
    }
  })
})
