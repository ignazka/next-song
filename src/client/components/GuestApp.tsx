import { useCallback, useEffect, useMemo, useState } from 'react';
import SongFilterBar from './SongFilterBar';
import Klangkreis from './Klangkreis';
import { PlusIcon } from './Icons';
import { BookingLinks, BrandBar } from './Brand';
import { BRAND } from '../../shared/brand';
import { decadeLabel, decadeOf, EMPTY_FILTER, filterSongs, type SongFilter } from '../../shared/songs';
import type { GuestWishStatus, PublicData, PublicSong, RequestStatus } from '../../shared/types';

/**
 * Gäste-Session: liegt nur im sessionStorage dieses Browser-Tabs (keine Cookies),
 * verschwindet beim Schließen des Tabs und läuft spätestens nach 3 Stunden ab.
 */
const STORE_KEY = 'songwunsch:session';
const SESSION_MS = 3 * 3600_000;

type MyWish = { id: string; title: string; artist: string; at: number; status: RequestStatus; position?: number | null };
type GuestSession = { token: string; started: number; wishes: MyWish[] };

function loadSession(): GuestSession {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null') as GuestSession | null;
    if (s && Date.now() - s.started < SESSION_MS) return s;
  } catch {}
  return { token: randomToken(), started: Date.now(), wishes: [] };
}

/**
 * Zufälliger Token für das Wunsch-Limit. Bewusst nicht crypto.randomUUID():
 * das gibt es nur über HTTPS/localhost, die App soll aber auch per http:// im WLAN laufen.
 */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const DONE_TEXT: Partial<Record<RequestStatus, string>> = {
  played: 'Gespielt ✓',
  declined: 'Diesmal leider nicht',
  gone: 'Abgelaufen',
};

function statusLabel(w: MyWish): { text: string; cls: string } {
  if (w.status === 'open' || w.status === 'next') {
    if (w.position === 1) return { text: 'Jetzt dran', cls: 'status-next' };
    if (w.position === 2) return { text: 'Als Nächstes', cls: 'status-next' };
    return { text: w.position ? `Wartet · Platz ${w.position}` : 'Wartet', cls: 'status-open' };
  }
  return { text: DONE_TEXT[w.status] ?? '', cls: `status-${w.status}` };
}

export default function GuestApp() {
  const [data, setData] = useState<PublicData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<SongFilter>(EMPTY_FILTER);
  const [selected, setSelected] = useState<PublicSong | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);

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
    setSession(loadSession());
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (session) sessionStorage.setItem(STORE_KEY, JSON.stringify(session));
  }, [session]);

  // Status der eigenen Wünsche regelmäßig abfragen, solange noch etwas offen ist
  const pendingIds = useMemo(
    () => (session?.wishes ?? []).filter((w) => w.status === 'open' || w.status === 'next').map((w) => w.id),
    [session],
  );
  const pendingKey = pendingIds.join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(',');
    const poll = async () => {
      try {
        const res = await fetch('/api/requests/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) return;
        const map = (await res.json()) as Record<string, GuestWishStatus>;
        setSession((s) => s && { ...s, wishes: s.wishes.map((w) => (map[w.id] ? { ...w, ...map[w.id] } : w)) });
      } catch {}
    };
    poll();
    const t = setInterval(poll, 10_000);
    return () => clearInterval(t);
  }, [pendingKey]);

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

      <header className="hero">
        <h1>{data.eventTitle}</h1>
        {data.welcomeText && <p>{data.welcomeText}</p>}
        <p className="hero-note">Kein Login. Name und Widmung werden gelöscht, sobald dein Lied gespielt ist, alles Übrige nach dem Event.</p>
      </header>

      {!data.requestsOpen && (
        <div className="banner">Gerade werden keine Wünsche angenommen. Schau später noch einmal vorbei.</div>
      )}

      {session && session.wishes.length > 0 && (
        <section className="card my-wishes" aria-live="polite">
          <div className="label">Deine Wünsche</div>
          {session.wishes.map((w) => (
            <div className="wish-row" key={w.id}>
              <div className="song-main">
                <div className="song-title">{w.title}</div>
                <div className="song-artist">{w.artist}</div>
              </div>
              <span className={`status ${statusLabel(w).cls}`}>{statusLabel(w).text}</span>
            </div>
          ))}
        </section>
      )}

      <SongFilterBar songs={data.songs} filter={filter} onChange={setFilter} resultCount={songs.length} />

      {songs.length === 0 ? (
        <div className="empty">Keine passenden Lieder gefunden.</div>
      ) : (
        <ul className="song-list">
          {songs.map((s) => (
            <li key={s.id}>
              <button className="song-btn" onClick={() => setSelected(s)} disabled={!data.requestsOpen}>
                <div className="song-main">
                  <div className="song-title">{s.title}</div>
                  <div className="song-artist">{s.artist}</div>
                  <div className="song-tags">
                    {s.genre && <span className="tag">{s.genre}</span>}
                    {s.year && <span className="tag">{decadeLabel(decadeOf(s.year))}</span>}
                    {s.wished > 0 && <span className="tag">schon gewünscht</span>}
                  </div>
                </div>
                {data.requestsOpen && (
                  <span className="song-plus">
                    <PlusIcon size={18} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="guest-footer">
        <div className="wordmark-name">{BRAND.name}</div>
        <div className="label">{BRAND.claim}</div>
        <p>Live-Gesang und Gitarre für Hochzeiten, Firmenfeiern und Geburtstage.</p>
        <BookingLinks eventTitle={data.eventTitle} />
      </footer>

      {selected && session && (
        <WishSheet
          song={selected}
          limits={data.limits}
          eventTitle={data.eventTitle}
          guestToken={session.token}
          onClose={() => setSelected(null)}
          onSent={(id) => {
            setSession((s) =>
              s && {
                ...s,
                wishes: [
                  { id, title: selected.title, artist: selected.artist, at: Date.now(), status: 'open' } as MyWish,
                  ...s.wishes,
                ].slice(0, 10),
              },
            );
            load();
          }}
        />
      )}
    </main>
  );
}

function WishSheet({
  song,
  limits,
  eventTitle,
  guestToken,
  onClose,
  onSent,
}: {
  song: PublicSong;
  limits: PublicData['limits'];
  eventTitle: string;
  guestToken: string;
  onClose: () => void;
  onSent: (id: string) => void;
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
        body: JSON.stringify({ songId: song.id, name, dedication, guestToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Das hat leider nicht geklappt.');
      onSent(body.id);
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
              „{song.title}“ steht jetzt auf der Liste. Unter „Deine Wünsche“ siehst du, wann dein Lied dran ist.
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
            <div className="field">
              <label htmlFor="wish-dedication">Widmung (optional)</label>
              <textarea
                id="wish-dedication"
                className="textarea"
                placeholder="z. B. Für das Brautpaar – auf die nächsten 50 Jahre!"
                maxLength={limits.dedication}
                value={dedication}
                onChange={(e) => setDedication(e.target.value)}
              />
              <span className="hint">
                Simon liest sie vor, wenn dein Lied dran ist · {dedication.length}/{limits.dedication}
              </span>
            </div>

            <p className="privacy">
              Kein Login. Name und Widmung sieht nur Simon. Sie werden gelöscht, sobald dein Lied gespielt ist, alle
              Daten spätestens 12 Stunden nach deinem Wunsch. Es werden keine Cookies gesetzt.
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
