'use client'

// „Hohe Qualität": weiche Kontaktschatten (Umgebungsverdeckung) an Rohren und
// Verbindungen plus filmischer Farbton. Belastet die Grafik deutlich und ist
// deshalb nur auf Wunsch aktiv (Anzeige → Hohe Qualität), nicht standardmäßig.
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

export default function Nachbearbeitung3D() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.5} distanceFalloff={1} intensity={2.2} quality="medium" halfRes />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
