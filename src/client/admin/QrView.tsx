import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, Unauthorized } from './api';
import Klangkreis from '../components/Klangkreis';
import { BRAND } from '../../shared/brand';
import { CopyIcon, MailIcon, WhatsAppIcon } from '../components/Icons';
import type { Settings } from '../../shared/types';

export default function QrView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');

  useEffect(() => {
    api<{ settings: Settings; lanAddresses: string[] }>('/api/admin/settings')
      .then((d) => {
        setSettings(d.settings);
        // Der Server kennt nur die IP-Adressen; Protokoll und Port nehmen wir von dieser Seite
        // (in der Entwicklung ist das der Vite-Port 5173, in Produktion der Server-Port).
        const { protocol, port } = window.location;
        setLanUrls(d.lanAddresses.map((ip) => `${protocol}//${ip}${port ? `:${port}` : ''}/`));
        setUrl(d.settings.publicUrl || `${window.location.origin}/`);
      })
      .catch((e) => e instanceof Unauthorized && onUnauthorized());
  }, [onUnauthorized]);

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 1024, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  if (!settings) return <p className="empty">Lädt …</p>;
  let thanksUrl = '';
  try {
    thanksUrl = new URL('danke', url).toString();
  } catch {}
  const isLocal = /\/\/(localhost|127\.0\.0\.1)/.test(url);

  return (
    <>
      <section className="grid-2 no-print">
        <div className="card">
          <h2 className="card-title">Adresse für die Gäste</h2>
          <div className="field">
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value.trim())} />
            <span className="hint">
              Dauerhaft festlegen kannst du die Adresse unter „Einstellungen“.
            </span>
          </div>
          {isLocal && (
            <div className="banner">
              „localhost“ funktioniert nur auf diesem Gerät. Für Gäste-Handys brauchst du die öffentliche Adresse der App
              {lanUrls.length > 0 && ' – oder, wenn alle im selben WLAN sind, eine dieser Adressen'}:
              <div className="row" style={{ marginTop: 8 }}>
                {lanUrls.map((u) => (
                  <button key={u} className="btn btn-sm" onClick={() => setUrl(u)}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn btn-primary" onClick={() => window.print()} disabled={!qr}>
              Drucken / als PDF speichern
            </button>
            {qr && (
              <a className="btn" href={qr} download="songwunsch-qr.png">
                PNG herunterladen
              </a>
            )}
          </div>
        </div>
        <div className="qr-preview">
          {qr && (
            <Klangkreis size="min(380px, 80vw)">
              <img src={qr} alt={`QR-Code für ${url}`} />
            </Klangkreis>
          )}
          <p className="muted small">{url}</p>
        </div>
      </section>

      {thanksUrl && (
        <HostThanks thanksUrl={thanksUrl} formal={settings.hostFormal} hasReview={!!settings.reviewUrl} />
      )}

      {/* QR-Aufsteller laut Designsystem: dunkel, QR-Code im Klangkreis, darüber „Wünsch dir ein Lied“ */}
      <div className="print-only print-sheet">
        {settings.eventTitle !== 'Wünsch dir ein Lied' && <div className="label">{settings.eventTitle}</div>}
        <h1>Wünsch dir ein Lied</h1>
        <p className="print-sub">QR-Code mit der Handykamera scannen, Lied aussuchen, gerne mit Widmung.</p>
        {qr && (
          <Klangkreis size="150mm">
            <img src={qr} alt="" />
          </Klangkreis>
        )}
        <div>
          <div className="wordmark-name">{BRAND.name}</div>
          <div className="label">{BRAND.claim}</div>
        </div>
        <p className="url">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
      </div>
    </>
  );
}

/** Danke-Seite an den Gastgeber schicken: Link, QR-Code, WhatsApp und E-Mail. */
function HostThanks({ thanksUrl, formal, hasReview }: { thanksUrl: string; formal: boolean; hasReview: boolean }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(thanksUrl, { width: 768, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [thanksUrl]);

  const message = formal
    ? `Vielen Dank, dass ich bei Ihrer Feier spielen durfte! Hier finden Sie einen kleinen Gruß von mir: ${thanksUrl}`
    : `Danke, dass ich bei eurer Feier spielen durfte! Hier ist ein kleiner Gruß von mir: ${thanksUrl}`;
  const subject = formal ? 'Vielen Dank für Ihre Feier' : 'Danke für eure Feier';

  async function copy() {
    try {
      await navigator.clipboard.writeText(thanksUrl);
    } catch {
      // Ohne HTTPS gibt es keine Zwischenablage-API → Feld markieren, damit man es selbst kopieren kann
      const el = document.getElementById('thanks-url') as HTMLInputElement | null;
      el?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="grid-2 no-print" style={{ marginTop: 18 }}>
      <div className="card">
        <h2 className="card-title">Für den Gastgeber</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Nach dem Event an das Paar oder die Gastgeber schicken: eine Danke-Seite mit der Bitte um eine
          Google-Bewertung ({formal ? 'Sie-Form' : 'du-Form'}, umstellbar unter „Einstellungen“).
        </p>
        {!hasReview && (
          <div className="banner">
            Noch kein Google-Bewertungslink hinterlegt. Die Seite zeigt dann nur Dank und Kontakt. Link unter
            „Einstellungen“ eintragen.
          </div>
        )}
        <div className="field">
          <input id="thanks-url" className="input" readOnly value={thanksUrl} onFocus={(e) => e.target.select()} />
        </div>
        <div className="row">
          <button className="btn btn-sm btn-outline" onClick={copy}>
            <CopyIcon size={16} /> {copied ? 'Kopiert' : 'Link kopieren'}
          </button>
          <a
            className="btn btn-sm btn-outline"
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon size={16} /> WhatsApp
          </a>
          <a
            className="btn btn-sm btn-outline"
            href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
          >
            <MailIcon size={16} /> E-Mail
          </a>
          <a className="btn btn-sm btn-ghost" href={thanksUrl} target="_blank" rel="noopener noreferrer">
            Ansehen ↗
          </a>
        </div>
      </div>
      <div className="qr-preview">
        {qr && (
          <div className="host-qr">
            <img src={qr} alt={`QR-Code für ${thanksUrl}`} />
          </div>
        )}
        {qr && (
          <a className="btn btn-sm btn-ghost" href={qr} download="danke-qr.png">
            QR-Code als PNG
          </a>
        )}
      </div>
    </section>
  );
}
