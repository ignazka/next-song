import { useEffect, useState } from 'react';
import Klangkreis from './Klangkreis';
import { BrandBar } from './Brand';
import { InstagramIcon, MailIcon, StarIcon } from './Icons';
import { BRAND } from '../../shared/brand';
import type { ThanksData } from '../../shared/types';

/**
 * Danke-Seite für den Gastgeber – Simon schickt den Link nach dem Event.
 * Anrede laut Designsystem: Paare werden geduzt, Firmen und Trauerfamilien gesiezt
 * (Schalter „Gastgeber siezen“ in den Einstellungen).
 */
const TEXT = {
  du: {
    title: 'Danke für eure Feier',
    lead: 'Es war schön, bei eurer Feier spielen zu dürfen. Danke für euer Vertrauen und die vielen schönen Momente.',
    ask: 'Wenn euch die Musik gefallen hat, freue ich mich sehr über eine kurze Bewertung bei Google. Sie hilft anderen Paaren, die passende Musik für ihren Tag zu finden.',
    review: 'Bewertung bei Google schreiben',
    noReview: 'Wenn euch die Musik gefallen hat, erzählt es gerne weiter – oder schreibt mir ein paar Zeilen.',
    photos: 'Habt ihr Fotos oder Videos von der Feier? Ich freue mich, wenn ihr sie mir schickt.',
    mail: 'Schreibt mir',
    mailSubject: 'Danke für die schöne Feier',
  },
  sie: {
    title: 'Vielen Dank',
    lead: 'Es war mir eine Freude, bei Ihrer Feier zu spielen. Herzlichen Dank für Ihr Vertrauen.',
    ask: 'Wenn Ihnen die Musik gefallen hat, freue ich mich über eine kurze Bewertung bei Google. Sie hilft anderen, die passende Musik für ihren Anlass zu finden.',
    review: 'Bewertung bei Google schreiben',
    noReview: 'Wenn Ihnen die Musik gefallen hat, empfehlen Sie mich gerne weiter – oder schreiben Sie mir ein paar Zeilen.',
    photos: 'Haben Sie Fotos oder Videos von der Feier? Ich freue mich, wenn Sie sie mir schicken.',
    mail: 'E-Mail schreiben',
    mailSubject: 'Rückmeldung zur Feier',
  },
} as const;

export default function ThanksPage() {
  const [data, setData] = useState<ThanksData | null>(null);

  useEffect(() => {
    fetch('/api/thanks', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData({ reviewUrl: '', formal: false }));
  }, []);

  if (!data) {
    return (
      <main className="wrap">
        <BrandBar />
      </main>
    );
  }

  const t = data.formal ? TEXT.sie : TEXT.du;

  return (
    <main className="wrap">
      <BrandBar />

      <section className="thanks">
        <Klangkreis size={120} animated />
        <h1>{t.title}</h1>
        <p className="thanks-lead">{t.lead}</p>

        <hr className="hairline thanks-rule" />

        {data.reviewUrl ? (
          <>
            <p>{t.ask}</p>
            <div className="cta-stack">
              <a className="btn btn-primary btn-xl" href={data.reviewUrl} target="_blank" rel="noopener noreferrer">
                <StarIcon size={20} /> {t.review}
              </a>
            </div>
          </>
        ) : (
          <p>{t.noReview}</p>
        )}

        <p className="thanks-photos">{t.photos}</p>
        <div className="cta-stack">
          <a
            className="btn btn-outline"
            href={`mailto:${BRAND.email}?subject=${encodeURIComponent(t.mailSubject)}`}
          >
            <MailIcon size={18} /> {t.mail}
          </a>
          <a className="btn btn-outline" href={BRAND.instagram} target="_blank" rel="noopener noreferrer">
            <InstagramIcon size={18} /> Simon auf Instagram
          </a>
        </div>
      </section>

      <footer className="guest-footer">
        <div className="wordmark-name">{BRAND.name}</div>
        <div className="label">{BRAND.claim}</div>
      </footer>
    </main>
  );
}
