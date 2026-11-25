import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Klangkreis from '../components/Klangkreis';
import { BRAND } from '../../shared/brand';

/**
 * Nur der QR-Code. Die Adresse ist fest im Code hinterlegt (BRAND.guestUrl in src/shared/brand.ts) –
 * gleiche Adresse ergibt immer denselben Code, der Aufsteller ist also für jedes Event gleich.
 */
export default function QrView() {
  const [qr, setQr] = useState('');
  // Fest eingetragene Adresse oder – nur zum lokalen Testen – die aktuelle Adresse im Browser
  const url = BRAND.guestUrl || `${window.location.origin}/`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 1024, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  return (
    <>
      <section className="qr-only no-print">
        {qr && (
          <Klangkreis size="min(420px, 80vw)">
            <img src={qr} alt="QR-Code zur Wunschseite" />
          </Klangkreis>
        )}
        <div className="row qr-actions">
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!qr}>
            Drucken / als PDF speichern
          </button>
          {qr && (
            <a className="btn btn-outline" href={qr} download="songwunsch-qr.png">
              PNG herunterladen
            </a>
          )}
        </div>
      </section>

      {/* QR-Aufsteller laut Designsystem: dunkel, QR-Code im Klangkreis, darüber „Wünsch dir ein Lied“ */}
      <div className="print-only print-sheet">
        <h1>Wünsch dir ein Lied</h1>
        <p className="print-sub">QR-Code mit der Handykamera scannen und Lied aussuchen.</p>
        {qr && (
          <Klangkreis size="150mm">
            <img src={qr} alt="" />
          </Klangkreis>
        )}
        <div>
          <div className="wordmark-name">{BRAND.name}</div>
          <div className="label">{BRAND.claim}</div>
        </div>
      </div>
    </>
  );
}
