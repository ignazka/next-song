import { useEffect, useState } from 'react';
import { api, Unauthorized } from './api';
import type { Settings } from '../../shared/types';

export default function SettingsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ settings: Settings }>('/api/admin/settings')
      .then((d) => setS(d.settings))
      .catch((e) => e instanceof Unauthorized && onUnauthorized());
  }, [onUnauthorized]);

  if (!s) return <p className="empty">Lädt …</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api<{ settings: Settings }>('/api/admin/settings', {
        method: 'PUT',
        body: {
          eventTitle: s!.eventTitle,
          welcomeText: s!.welcomeText,
          publicUrl: s!.publicUrl,
          reviewUrl: s!.reviewUrl,
          hostFormal: s!.hostFormal,
          dedicationsEnabled: s!.dedicationsEnabled,
        },
      });
      setS(r.settings);
      setMsg({ ok: true, text: 'Gespeichert.' });
    } catch (e) {
      if (e instanceof Unauthorized) return onUnauthorized();
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <form className="card" style={{ maxWidth: 620 }} onSubmit={save}>
      <h2 className="card-title">Event-Einstellungen</h2>
      <div className="field">
        <label htmlFor="e-title">Überschrift für die Gäste</label>
        <input
          id="e-title"
          className="input"
          maxLength={80}
          placeholder="z. B. Hochzeit von Anna & Ben"
          value={s.eventTitle}
          onChange={(e) => setS({ ...s, eventTitle: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="switch">
          <input
            type="checkbox"
            checked={s.dedicationsEnabled}
            onChange={(e) => setS({ ...s, dedicationsEnabled: e.target.checked })}
          />
          <span className="knob" />
          Gäste können eine Widmung schreiben
        </label>
        <span className="hint">
          Für dieses Event ausschalten, wenn Widmungen nicht passen (z. B. Firmenfeier). Gäste sehen dann kein
          Widmungsfeld mehr. Ein eigener Begrüßungstext sollte Widmungen dann auch nicht erwähnen.
        </span>
      </div>
      <div className="field">
        <label htmlFor="e-welcome">Begrüßungstext</label>
        <textarea
          id="e-welcome"
          className="textarea"
          maxLength={300}
          value={s.welcomeText}
          onChange={(e) => setS({ ...s, welcomeText: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="e-url">Öffentliche Adresse der App (für den QR-Code)</label>
        <input
          id="e-url"
          className="input"
          placeholder="https://songwunsch.example.de/"
          value={s.publicUrl}
          onChange={(e) => setS({ ...s, publicUrl: e.target.value })}
        />
        <span className="hint">Leer lassen = die Adresse, unter der du diese Seite gerade geöffnet hast.</span>
      </div>

      <h2 className="card-title" style={{ marginTop: 28 }}>
        Danke-Seite für den Gastgeber
      </h2>
      <div className="field">
        <label htmlFor="e-review">Google-Bewertungslink</label>
        <input
          id="e-review"
          className="input"
          placeholder="https://g.page/r/…/review"
          value={s.reviewUrl}
          onChange={(e) => setS({ ...s, reviewUrl: e.target.value })}
        />
        <span className="hint">
          Im Google-Unternehmensprofil unter „Bewertungen einholen“ (bzw. „Nach Rezensionen fragen“) kopieren. Leer
          lassen = die Danke-Seite zeigt keinen Bewertungs-Button.
        </span>
      </div>
      <div className="field">
        <label className="switch">
          <input
            type="checkbox"
            checked={s.hostFormal}
            onChange={(e) => setS({ ...s, hostFormal: e.target.checked })}
          />
          <span className="knob" />
          Gastgeber siezen
        </label>
        <span className="hint">
          Für Firmenfeiern und Trauerfeiern. Aus = du-Form für Paare und private Feiern.
        </span>
      </div>
      {msg &&<p className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</p>}
      <button className="btn btn-primary">Speichern</button>
      <p className="dim small" style={{ marginTop: 18 }}>
        Das Musiker-Passwort wird über die Umgebungsvariable <code>ADMIN_PASSWORD</code> festgelegt.
      </p>
    </form>
  );
}
