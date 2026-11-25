import { useCallback, useEffect, useMemo, useState } from 'react';
import SongFilterBar from './SongFilterBar';
import Klangkreis from './Klangkreis';
import { InfoIcon, PlusIcon } from './Icons';
import { BookingLinks, BrandBar } from './Brand';
import { BRAND } from '../../shared/brand';
import { decadeLabel, decadeOf, EMPTY_FILTER, filterSongs, type SongFilter } from '../../shared/songs';
import type { PublicData, PublicSong } from '../../shared/types';

/**
 * Im Browser-Tab des Gastes (sessionStorage, keine Cookies, weg beim Schließen) liegen nur:
 * - ein zufälliger Code für das Limit offener Wünsche
 * - ob die Begrüßung schon gezeigt wurde
 * Welche Lieder sich der Gast gewünscht hat, wird nirgends gemerkt – auch nicht auf dem Handy.
 */
const TOKEN_KEY = 'songwunsch:token';
const INTRO_KEY = 'songwunsch:intro-seen';

function guestToken(): string {
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = randomToken();
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

/**
 * Zufälliger Code. Bewusst nicht crypto.randomUUID():
 * das gibt es nur über HTTPS/localhost, die App soll aber auch per http:// im WLAN laufen.
 */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function GuestApp() {
  const [data, setData] = useState<PublicData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<SongFilter>(EMPTY_FILTER);
  const [selected, setSelected] = useState<PublicSong | null>(null);
  const [introOpen, setIntroOpen] = useState(false);

  // Begrüßung + Datenschutz-Hinweis einmal pro Besuch als Popup zeigen, danach über das Info-Icon
  useEffect(() => {
    if (!sessionStorage.getItem(INTRO_KEY)) setIntroOpen(true);
  }, []);
  const closeIntro = useCallback(() => {
    sessionStorage.setItem(INTRO_KEY, '1');
    setIntroOpen(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/public', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLoadError('');
    } catch {
      setLoadError('Die Songliste konnte nicht geladen werden. Bitte versuche es gleich noch einmal.');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const songs = useMemo(() => (data ? filterSongs(data.songs, filter) : []), [data, filter]);

  if (!data) {
    return (
      <main className="wrap">
        <BrandBar />
        <div className="hero">
          {!loadError && <Klangkreis size={96} animated className="loading-kk" />}
          <p style={{ marginTop: 18 }}>{loadError || 'Lieder werden geladen …'}</p>
          {loadError && (
            <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={load}>
              Erneut versuchen
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <BrandBar />

      <header className="hero hero-compact">
        <h1>{data.eventTitle}</h1>
        <button
          type="button"
          className="icon-btn info-btn"
          onClick={() => setIntroOpen(true)}
          aria-label="So funktioniert's und Datenschutz"
          title="So funktioniert's"
        >
          <InfoIcon />
        </button>
      </header>

      {introOpen && <IntroSheet title={data.eventTitle} welcomeText={data.welcomeText} onClose={closeIntro} />}

      <SongFilterBar songs={data.songs} filter={filter} onChange={setFilter} resultCount={songs.length} />

      {songs.length === 0 ? (
        <div className="empty">Keine passenden Lieder gefunden.</div>
      ) : (
        <ul className="song-list">
          {songs.map((s) => (
            <li key={s.id}>
              <button className="song-btn" onClick={() => setSelected(s)}>
                <div className="song-main">
                  <div className="song-title">{s.title}</div>
                  <div className="song-artist">{s.artist}</div>
                  <div className="song-tags">
                    {s.year && <span className="tag">{decadeLabel(decadeOf(s.year))}</span>}
                    {s.wished > 0 && <span className="tag">schon gewünscht</span>}
                  </div>
                </div>
                <span className="song-plus">
                  <PlusIcon size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Gleicher Aufbau wie der untere Teil der Bestätigung nach dem Wunsch */}
      <footer className="guest-footer">
        <div className="label">Gefällt dir die Musik?</div>
        <BookingLinks eventTitle={data.eventTitle} />
      </footer>

      {selected && (
        <WishSheet
          song={selected}
          limits={data.limits}
          dedicationsEnabled={data.dedicationsEnabled}
          eventTitle={data.eventTitle}
          guestToken={guestToken()}
          onClose={() => setSelected(null)}
          onSent={load}
        />
      )}
    </main>
  );
}

/** Begrüßung und Datenschutz – erscheint beim ersten Öffnen und über das Info-Icon. */
function IntroSheet({ title, welcomeText, onClose }: { title: string; welcomeText: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="sheet intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="close-x intro-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
        <div className="label">{BRAND.name}</div>
        <h2 id="intro-title">{title}</h2>
        {welcomeText && <p className="intro-text">{welcomeText}</p>}
        <p className="intro-note">
          Kein Login, keine Cookies. Gespeichert wird nur dein Wunsch. Er wird gelöscht, sobald dein Lied gespielt wurde, sonst automatisch nach 2 Stunden.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={onClose} autoFocus>
          Los geht's
        </button>
      </div>
    </div>
  );
}

function WishSheet({
  song,
  limits,
  dedicationsEnabled,
  eventTitle,
  guestToken,
  onClose,
  onSent,
}: {
  song: PublicSong;
  limits: PublicData['limits'];
  dedicationsEnabled: boolean;
  eventTitle: string;
  guestToken: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [name, setName] = useState('');
  const [dedication, setDedication] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id, name, dedication: dedicationsEnabled ? dedication : '', guestToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Das hat leider nicht geklappt.');
      onSent();
      setDone(true);
    } catch (e) {
      setErr((e as Error).message || 'Keine Verbindung. Bitte nochmal versuchen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Lied wünschen" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="success">
            <Klangkreis size={140} animated />
            <h2>Dein Wunsch ist angekommen</h2>
            <p>
              <strong>{song.title}</strong> steht jetzt auf Simons Liste. Lehn dich zurück, du hörst es, wenn es so weit ist.
            </p>
            <button className="btn btn-outline btn-block" onClick={onClose}>
              Zurück zur Liste
            </button>
            <div className="after-wish">
              <div className="label">Gefällt dir die Musik?</div>
              <BookingLinks eventTitle={eventTitle} />
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="sheet-head">
              <div>
                <div className="label">Dein Liedwunsch</div>
                <h2>{song.title}</h2>
                <div className="muted">{song.artist}</div>
              </div>
              <button type="button" className="close-x" onClick={onClose} aria-label="Schließen">
                ×
              </button>
            </div>

            <div className="field">
              <label htmlFor="wish-name">Dein Name (optional)</label>
              <input
                id="wish-name"
                className="input"
                placeholder="Anonym"
                maxLength={limits.name}
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {dedicationsEnabled && (
              <div className="field">
                <label htmlFor="wish-dedication">Widmung (optional)</label>
                <textarea
                  id="wish-dedication"
                  className="textarea"
                  placeholder="z. B. Für das Brautpaar: auf die nächsten 50 Jahre!"
                  maxLength={limits.dedication}
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value)}
                />
                <span className="hint">
                  Simon liest sie vor, wenn dein Lied dran ist · {dedication.length}/{limits.dedication}
                </span>
              </div>
            )}

            <p className="privacy">
              {dedicationsEnabled ? 'Name und Widmung sieht' : 'Deinen Namen sieht'} nur Simon. Dein Wunsch wird gelöscht, sobald dein Lied gespielt ist,
              sonst automatisch nach 2 Stunden. Kein Login, keine Cookies.
            </p>
            {err && <p className="error-text">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Wird gesendet …' : 'Lied wünschen'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
