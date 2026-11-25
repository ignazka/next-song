import { GlobeIcon, InstagramIcon, MailIcon, WhatsAppIcon } from './Icons';
import { BRAND, bookingMailto } from '../../shared/brand';

/** Kopfzeile: Wortmarke und Kontakt-Icons. */
export function BrandBar() {
  return (
    <div className="brandbar">
      <a className="wordmark" href={BRAND.website} target="_blank" rel="noopener noreferrer">
        <span className="wordmark-name">{BRAND.name}</span>
        <span className="wordmark-claim label">{BRAND.claim}</span>
      </a>
      <nav className="social" aria-label="Kontakt">
        <a className="icon-btn" href={`mailto:${BRAND.email}`} aria-label={`E-Mail an ${BRAND.email}`} title="E-Mail">
          <MailIcon />
        </a>
        <a
          className="icon-btn"
          href={BRAND.instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          title="Instagram"
        >
          <InstagramIcon />
        </a>
        <a
          className="icon-btn"
          href={BRAND.website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Homepage"
          title="simonweichert.com"
        >
          <GlobeIcon />
        </a>
      </nav>
    </div>
  );
}

/**
 * Kontakt-Buttons nach dem Wunsch und unten auf der Seite (Wunsch von Simon):
 * Instagram zuerst, darunter „Schreibe Simon“ (+ WhatsApp, sobald hinterlegt).
 */
export function BookingLinks({ eventTitle }: { eventTitle?: string }) {
  return (
    <div className="cta-stack">
      <a className="btn btn-primary" href={BRAND.instagram} target="_blank" rel="noopener noreferrer">
        <InstagramIcon size={18} /> Simon auf Instagram
      </a>
      <a className="btn btn-outline" href={bookingMailto(eventTitle)}>
        <MailIcon size={18} /> Schreibe Simon
      </a>
      {BRAND.whatsapp && (
        <a className="btn btn-outline" href={BRAND.whatsapp} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon size={18} /> Per WhatsApp
        </a>
      )}
    </div>
  );
}
