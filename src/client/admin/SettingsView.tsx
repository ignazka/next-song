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
      {msg && <p className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</p>}
      <button className="btn btn-primary">Speichern</button>
    </form>
  );
}
