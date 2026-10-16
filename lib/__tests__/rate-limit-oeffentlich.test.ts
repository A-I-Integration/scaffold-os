import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { fensterPruefen, oeffentlichRateLimitPruefen } from '../rate-limit';

describe('fensterPruefen', () => {
  it('erlaubt bis max, sperrt danach und nennt die Wartezeit', () => {
    const m = new Map<string, number[]>();
    expect(fensterPruefen(m, 'a', 0, 3, 60_000).ok).toBe(true);
    expect(fensterPruefen(m, 'a', 1_000, 3, 60_000).ok).toBe(true);
    expect(fensterPruefen(m, 'a', 2_000, 3, 60_000).ok).toBe(true);
    const r = fensterPruefen(m, 'a', 3_000, 3, 60_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterS).toBe(57);
  });
  it('gibt nach Ablauf des Fensters wieder frei', () => {
    const m = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) fensterPruefen(m, 'a', i, 3, 60_000);
    expect(fensterPruefen(m, 'a', 61_000, 3, 60_000).ok).toBe(true);
  });
  it('zählt Schlüssel getrennt', () => {
    const m = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) fensterPruefen(m, 'a', i, 3, 60_000);
    expect(fensterPruefen(m, 'b', 10, 3, 60_000).ok).toBe(true);
  });
});

describe('oeffentlichRateLimitPruefen', () => {
  const req = (ip: string) => new NextRequest('http://localhost/api/x', { method: 'POST', headers: { 'x-forwarded-for': ip } });
  it('sperrt dieselbe IP nach dem Limit mit 429, andere IP bleibt frei', async () => {
    const opts = { max: 2, fensterMs: 60_000 };
    expect(oeffentlichRateLimitPruefen(req('1.1.1.1'), 'test-a', opts).ok).toBe(true);
    expect(oeffentlichRateLimitPruefen(req('1.1.1.1'), 'test-a', opts).ok).toBe(true);
    const r = oeffentlichRateLimitPruefen(req('1.1.1.1'), 'test-a', opts);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(429);
      expect(r.response.headers.get('Retry-After')).toBeTruthy();
    }
    expect(oeffentlichRateLimitPruefen(req('2.2.2.2'), 'test-a', opts).ok).toBe(true);
  });
  it('trennt die Bereiche', () => {
    const opts = { max: 1, fensterMs: 60_000 };
    expect(oeffentlichRateLimitPruefen(req('3.3.3.3'), 'test-b', opts).ok).toBe(true);
    expect(oeffentlichRateLimitPruefen(req('3.3.3.3'), 'test-c', opts).ok).toBe(true);
  });
});
