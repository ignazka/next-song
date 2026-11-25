import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import QueueView from './QueueView';
import SongsView from './SongsView';
import QrView from './QrView';
import SettingsView from './SettingsView';

type Tab = 'queue' | 'songs' | 'qr' | 'settings';

export default function AdminApp() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'in'>('loading');
  const [configured, setConfigured] = useState(true);
  const [tab, setTab] = useState<Tab>('queue');
  const [openCount, setOpenCount] = useState(0);

  const check = useCallback(async () => {
    try {
      const me = await api<{ loggedIn: boolean; passwordConfigured: boolean }>('/api/admin/me');
      setConfigured(me.passwordConfigured);
      setAuth(me.loggedIn ? 'in' : 'out');
    } catch {
      setAuth('out');
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const onUnauthorized = useCallback(() => setAuth('out'), []);

  if (auth === 'loading') return <main className="wrap"><p className="empty">Lädt …</p></main>;
  if (auth === 'out') return <Login configured={configured} onLogin={() => setAuth('in')} />;

  const tabs: [Tab, string][] = [
    ['queue', 'Warteschlange'],
    ['songs', 'Songliste'],
    ['qr', 'QR-Code'],
    ['settings', 'Einstellungen'],
  ];

  return (
    <main className="wrap wrap-wide">
      <div className="topbar no-print">
        <div className="wordmark">
          <span className="wordmark-name">Simon Weichert</span>
          <span className="wordmark-claim label">Musiker-Bereich</span>
        </div>
        <span className="spacer" />
        <a className="btn btn-sm btn-ghost" href="/" target="_blank" rel="noreferrer">
          Gäste-Ansicht ↗
        </a>
        <button
          className="btn btn-sm btn-ghost"
          onClick={async () => {
            await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
            setAuth('out');
          }}
        >
          Abmelden
        </button>
      </div>
      <nav className="tabs no-print">
        {tabs.map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
            {id === 'queue' && openCount > 0 && <span className="badge">{openCount}</span>}
          </button>
        ))}
      </nav>
      {/* Die Wunschliste bleibt im Hintergrund aktiv, damit neue Wünsche auch in anderen Tabs gemeldet werden. */}
      <div hidden={tab !== 'queue'}>
        <QueueView onUnauthorized={onUnauthorized} onCount={setOpenCount} visible={tab === 'queue'} />
      </div>
      {tab === 'songs' && <SongsView onUnauthorized={onUnauthorized} />}
      {tab === 'qr' && <QrView />}
      {tab === 'settings' && <SettingsView onUnauthorized={onUnauthorized} />}
    </main>
  );
}

function Login({ configured, onLogin }: { configured: boolean; onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      onLogin();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <form className="card login" onSubmit={submit}>
        <h1 style={{ fontSize: 32, marginBottom: 16 }}>Musiker-Login</h1>
        {!configured && (
          <p className="banner">
            Es ist noch kein Passwort eingerichtet. Bitte <code>ADMIN_PASSWORD</code> in der Datei <code>.env</code> setzen
            und die App neu starten.
          </p>
        )}
        <div className="field">
          <label htmlFor="pw">Passwort</label>
          <input
            id="pw"
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && <p className="error-text">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </main>
  );
}
