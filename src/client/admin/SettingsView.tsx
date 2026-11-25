import { useEffect, useState } from 'react';
import { api, Unauthorized } from './api';
import type { Settings } from '../../shared/types';

type Props = {
  onUnauthorized: () => void;
  /** Meldet, ob es ungespeicherte Änderungen gibt (Markierung am Tab). */
  onDirty: (dirty: boolean) => void;
};

export default function SettingsView({ onUnauthorized, onDirty }: Props) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ settings: Settings }>('/api/admin/settings')
      .then((d) => {
        setS(d.settings);
        setSaved(d.settings);
      })
      .catch((e) => e instanceof Unauthorized && onUnauthorized());
  }, [onUnauthorized]);

  const dirty = !!s && !!saved && JSON.stringify(s) !== JSON.stringify(saved);

  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    // Beim Schließen oder Neuladen der Seite warnen, solange etwas nicht gespeichert ist
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, onDirty]);

  if (!s) return <p className="empty">Lädt …</p>;

  const edit = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setMsg(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const r = await api<{ settings: Settings }>('/api/admin/settings', {
        method: 'PUT',
        body: {
          eventTitle: s!.eventTitle,
          welcomeText: s!.welcomeText,
          welcomeTextNoDedication: s!.welcomeTextNoDedication,
          dedicationsEnabled: s!.dedicationsEnabled,
        },
      });
      setS(r.settings);
      setSaved(r.settings);
      setMsg({ ok: true, text: 'Gespeichert. Die Gäste sehen die Änderungen jetzt.' });
    } catch (e) {
      if (e instanceof Unauthorized) return onUnauthorized();
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`card settings-card ${dirty ? 'is-dirty' : ''}`} style={{ maxWidth: 620 }} onSubmit={save}>
      <h2 className="card-title">Event-Einstellungen</h2>
      <div className="field">
        <label htmlFor="e-title">Überschrift für die Gäste</label>
        <input
          id="e-title"
          className="input"
          maxLength={80}
          placeholder="z. B. Hochzeit von Anna & Ben"
          value={s.eventTitle}
          onChange={(e) => edit({ eventTitle: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="switch">
          <input
            type="checkbox"
            checked={s.dedicationsEnabled}
            onChange={(e) => edit({ dedicationsEnabled: e.target.checked })}
          />
          <span className="knob" />
          Gäste können eine Widmung schreiben
        </label>
      </div>
      <div className={`field ${s.dedicationsEnabled ? 'field-inactive' : 'field-live'}`}>
        <label htmlFor="e-welcome-nd">Begrüßungstext <strong>ohne</strong> Widmung</label>
        <textarea
          id="e-welcome-nd"
          className="textarea"
          maxLength={300}
          value={s.welcomeTextNoDedication}
          onChange={(e) => edit({ welcomeTextNoDedication: e.target.value })}
        />
        <StatusNote live={!s.dedicationsEnabled} savedLive={!saved?.dedicationsEnabled} />
      </div>
      <div className={`field ${s.dedicationsEnabled ? 'field-live' : 'field-inactive'}`}>
        <label htmlFor="e-welcome">Begrüßungstext <strong>mit</strong> Widmung</label>
        <textarea
          id="e-welcome"
          className="textarea"
          maxLength={300}
          value={s.welcomeText}
          onChange={(e) => edit({ welcomeText: e.target.value })}
        />
        <StatusNote live={s.dedicationsEnabled} savedLive={!!saved?.dedicationsEnabled} />
      </div>

      <div className={`save-bar ${dirty ? 'is-dirty' : ''}`}>
        {dirty && (
          <p className="unsaved" role="status">
            Noch nicht gespeichert. Erst mit „Speichern“ werden die Änderungen für die Gäste wirksam.
          </p>
        )}
        {msg && <p className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</p>}
        <div className="save-actions">
          <button className="btn btn-primary" disabled={!dirty || saving}>
            {saving ? 'Speichert …' : dirty ? 'Speichern' : 'Alles gespeichert'}
          </button>
          {dirty && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setS(saved);
                setMsg(null);
              }}
            >
              Verwerfen
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

/**
 * Zeigt, welcher Begrüßungstext bei den Gästen erscheint.
 * `live` folgt dem Schalter, `savedLive` dem gespeicherten Stand (den die Gäste wirklich sehen).
 */
function StatusNote({ live, savedLive }: { live: boolean; savedLive: boolean }) {
  const text =
    live === savedLive
      ? live
        ? 'Sehen die Gäste gerade'
        : 'Gerade nicht aktiv'
      : live
        ? 'Sehen die Gäste nach dem Speichern'
        : 'Nach dem Speichern nicht mehr aktiv';
  return <span className={`hint status-note ${live ? 'is-live' : ''}`}>{text}</span>;
}
