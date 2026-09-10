import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// ============================================================
// SCAFFOLD OS – Test-Setup (Phase 49)
//
// Fängt genau die Art Fehler ab, die in dieser Sitzung mehrfach erst
// nachträglich gefunden wurden (falsche API-Antwortformen, falsche
// Berechnungslogik) – bevor sie live gehen, nicht erst danach.
// ============================================================

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', '__tests__/**/*.test.ts', 'components/**/*.test.ts', 'app/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
})
