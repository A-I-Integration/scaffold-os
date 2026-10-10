import { describe, it, expect } from 'vitest';
import { entferneTrackingPixel, istGueltigeEmail } from '../email-verlauf';

describe('E-Mail-Verlauf Hilfen', () => {
  it('entfernt den Tracking-Pixel, lässt den Rest', () => {
    const html = '<p>Hallo</p><img src="https://x.de/api/track/open?typ=angebot&ref=1" width="1" height="1" alt="" style="display:none" />';
    expect(entferneTrackingPixel(html)).toBe('<p>Hallo</p>');
  });
  it('lässt andere Bilder stehen', () => {
    expect(entferneTrackingPixel('<img src="logo.png">')).toBe('<img src="logo.png">');
  });
  it('prüft E-Mail-Adressen grob', () => {
    expect(istGueltigeEmail('a@b.de')).toBe(true);
    expect(istGueltigeEmail('a@b')).toBe(false);
    expect(istGueltigeEmail('')).toBe(false);
  });
});
