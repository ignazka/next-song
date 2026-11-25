/**
 * Marke und Kontaktwege – an einer Stelle, damit Links leicht angepasst werden können.
 * Quelle: Designsystem „Simon Weichert“ (Claim, Sprache: Gäste werden geduzt).
 */
export const BRAND = {
  name: 'Simon Weichert',
  claim: 'Musiker für besondere Anlässe',
  email: 'info@simonweichert.com',
  instagram: 'https://www.instagram.com/simon.weichert/',
  website: 'https://www.simonweichert.com/',
  /** Später, z. B. 'https://wa.me/49151…' – leer = WhatsApp-Button wird nicht angezeigt. */
  whatsapp: '',
  /**
   * Feste Adresse der Gäste-Seite – genau diese steckt im QR-Code.
   * Gleiche Adresse = gleicher QR-Code, d. h. einmal drucken und bei jedem Event wiederverwenden.
   * Leer = die Adresse, unter der der Musiker-Bereich gerade geöffnet ist (nur zum lokalen Testen).
   */
  guestUrl: '',
} as const;

/** E-Mail-Anfrage mit vorausgefülltem Betreff und kurzer Vorlage. */
export function bookingMailto(eventTitle?: string): string {
  const subject = 'Anfrage für unsere Feier';
  const body = [
    'Hallo Simon,',
    '',
    `ich habe dich${eventTitle ? ` bei „${eventTitle}“` : ''} gehört und würde dich gerne für unsere Feier anfragen.`,
    '',
    'Anlass:',
    'Datum:',
    'Ort:',
    '',
    'Viele Grüße',
  ].join('\n');
  return `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
