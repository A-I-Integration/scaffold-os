import { describe, it, expect } from 'vitest'
import { istGeruestKnoten, istSockelKnoten, istTurmKoerperKnoten, sollEntfallen } from '../glb-teile'

describe('glb-teile', () => {
  it('Gerüst-Knoten', () => {
    for (const n of ['Geruest_Belaege_Bordbretter', 'Gerüst_Rahmen', 'geruest', 'Scaffold_Main']) expect(istGeruestKnoten(n)).toBe(true)
    for (const n of ['Kirchenschiff_Waende', 'Kirchturm_Baukörper', 'Fassade_Geruestfarbe']) expect(istGeruestKnoten(n)).toBe(false)
  })
  it('Sockel', () => { expect(istSockelKnoten('Modellsockel')).toBe(true); expect(sollEntfallen('Kirchenschiff_Schieferdach')).toBe(false) })
  it('Turmkörper', () => {
    expect(istTurmKoerperKnoten('Kirchturm_Baukörper')).toBe(true)
    expect(istTurmKoerperKnoten('Kirchturm_Helm_Laterne')).toBe(false)
    expect(istTurmKoerperKnoten('Kirchturm_Fenster_Gliederung')).toBe(false)
  })
})
