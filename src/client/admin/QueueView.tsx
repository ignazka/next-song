import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Unauthorized } from './api';
import type { AdminQueue, AdminRequest, QueueItem } from '../../shared/types';

/** Sicherheitsnetz, falls der Live-Stream unbemerkt hängt. */
const FALLBACK_POLL_MS = 20_000;
/** So lange kann „Gespielt“ / „Überspringen“ rückgängig gemacht werden. */
const UNDO_MS = 6_000;

type Live = 'connecting' | 'live' | 'offline';
type FinishStatus = 'played' | 'declined';
type Pending = { ids: string[]; status: FinishStatus; label: string; timer: ReturnType<typeof setTimeout> };

/** Wünsche zum selben Song zusammenfassen; Reihenfolge = Zeit des ersten Wunsches. */
function groupQueue(requests: AdminRequest[], hidden: Set<string>): QueueItem[] {
  const bySong = new Map<string, QueueItem>();
  for (const r of requests) {
    if (hidden.has(r.id)) continue;
    let item = bySong.get(r.songId);
    if (!item) {
      item = { songId: r.songId, artist: r.artist, title: r.title, firstAt: r.createdAt, wishes: [] };
      bySong.set(r.songId, item);
    }
    item.wishes.push(r);
  }
  return [...bySong.values()];
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  return `vor ${Math.floor(min / 60)} Std. ${min % 60} Min.`;
}

/** Kurzer, dezenter Ton bei neuen Wünschen. */
function chime() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close(), 800);
  } catch {}
}

function sendFinish(ids: string[], status: FinishStatus, keepalive = false) {
  return fetch('/api/admin/requests', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, status }),
    keepalive,
  });
}

function GuestName({ name }: { name: string }) {
  return name ? <strong>{name}</strong> : <em className="anon">anonym</em>;
}

type Props = { onUnauthorized: () => void; onCount: (n: number) => void; visible: boolean };

export default function QueueView({ onUnauthorized, onCount, visible }: Props) {
  const [queue, setQueue] = useState<AdminQueue | null>(null);
  const [live, setLive] = useState<Live>('connecting');
  const [err, setErr] = useState('');
  // Hinweiston bei neuen Wünschen: standardmäßig aus, per Schalter „Ton“ einschaltbar
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  const pendingRef = useRef<Pending | null>(null);
  const loading = useRef<{ busy: boolean; again: boolean }>({ busy: false, again: false });

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // ---------- Daten laden (überlappende Aufrufe werden zusammengefasst) ----------
  const load = useCallback(async () => {
    if (loading.current.busy) {
      loading.current.again = true;
      return;
    }
    loading.current.busy = true;
    try {
      do {
        loading.current.again = false;
        const q = await api<AdminQueue>('/api/admin/requests');
        const ids = new Set(q.requests.map((r) => r.id));
        if (known.current && soundRef.current && q.requests.some((r) => !known.current!.has(r.id))) chime();
        known.current = ids;
        setQueue(q);
        setNow(Date.now());
        setErr('');
        // Ausgeblendete IDs vergessen, sobald der Server sie nicht mehr liefert
        setHidden((h) => (h.size && [...h].some((id) => !ids.has(id)) ? new Set([...h].filter((id) => ids.has(id))) : h));
      } while (loading.current.again);
    } catch (e) {
      if (e instanceof Unauthorized) onUnauthorized();
      else setErr('Keine Verbindung zum Server – versuche es weiter …');
    } finally {
      loading.current.busy = false;
    }
  }, [onUnauthorized]);

  // ---------- Echtzeit: Server-Sent Events + Sicherheits-Polling ----------
  useEffect(() => {
    load();
    const es = new EventSource('/api/admin/stream');
    es.addEventListener('open', () => setLive('live'));
    es.addEventListener('change', () => {
      setLive('live');
      load();
    });
    es.addEventListener('ping', () => setLive('live'));
    es.addEventListener('error', () => {
      setLive('offline');
      // Bei 401 o. Ä. schließt der Browser die Verbindung endgültig → Login prüfen
      if (es.readyState === EventSource.CLOSED) load();
    });
    const poll = setInterval(load, FALLBACK_POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      es.close();
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const items = useMemo(() => (queue ? groupQueue(queue.requests, hidden) : []), [queue, hidden]);
  useEffect(() => onCount(items.length), [items.length, onCount]);

  // Bildschirm während des Auftritts nicht ausgehen lassen (nur über HTTPS/localhost verfügbar)
  useEffect(() => {
    if (!visible || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => {});
    acquire();
    const onVis = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [visible]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---------- Gespielt / Überspringen mit Rückgängig ----------
  const commit = useCallback(
    async (p: Pending, keepalive = false) => {
      clearTimeout(p.timer);
      if (pendingRef.current === p) {
        pendingRef.current = null;
        setPending(null);
      }
      try {
        const res = await sendFinish(p.ids, p.status, keepalive);
        if (res.status === 401) return onUnauthorized();
        if (!res.ok) throw new Error();
      } catch {
        // Fehlgeschlagen → wieder einblenden, damit nichts verloren geht
        setHidden((h) => new Set([...h].filter((id) => !p.ids.includes(id))));
        setErr('Konnte nicht gespeichert werden – bitte nochmal versuchen.');
      }
      load();
    },
    [load, onUnauthorized],
  );

  function finish(item: QueueItem, status: FinishStatus) {
    if (pendingRef.current) void commit(pendingRef.current); // vorherige Aktion sofort abschließen
    const ids = item.wishes.map((w) => w.id);
    setHidden((h) => new Set([...h, ...ids]));
    const label = `„${item.title}“ ${status === 'played' ? 'als gespielt markiert' : 'übersprungen'}`;
    const p: Pending = { ids, status, label, timer: setTimeout(() => commit(p), UNDO_MS) };
    pendingRef.current = p;
    setPending(p);
  }

  function undo() {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPending(null);
    setHidden((h) => new Set([...h].filter((id) => !p.ids.includes(id))));
  }

  // Offene Aktion beim Verlassen der Seite trotzdem speichern
  useEffect(() => {
    const flush = () => pendingRef.current && commit(pendingRef.current, true);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [commit]);

  async function toggleOpen(open: boolean) {
    setQueue((q) => q && { ...q, requestsOpen: open });
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { requestsOpen: open } });
    } catch (e) {
      if (e instanceof Unauthorized) return onUnauthorized();
      setErr((e as Error).message);
    }
  }

  async function clearAll() {
    if (!window.confirm('Event beenden und ALLE Wünsche endgültig löschen?')) return;
    try {
      await api('/api/admin/requests', { method: 'DELETE' });
    } catch (e) {
      if (e instanceof Unauthorized) return onUnauthorized();
      setErr((e as Error).message);
    }
    load();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  if (!queue) return <p className="empty">{err || 'Lädt …'}</p>;

  const [current, next, ...later] = items;
  const playedCount = queue.playedCount + (pending?.status === 'played' ? pending.ids.length : 0);

  return (
    <section className="stage">
      <div className="stage-bar">
        <span className={`live live-${live}`} role="status">
          <span className="live-dot" />
          {live === 'live' ? 'Live' : live === 'connecting' ? 'Verbinde …' : 'Verbindung unterbrochen'}
        </span>
        <span className="muted small">
          {items.length} {items.length === 1 ? 'Song' : 'Songs'} in der Warteschlange · {playedCount} gespielt
        </span>
        <span className="spacer" />
        <label className="switch small">
          <input type="checkbox" checked={queue.requestsOpen} onChange={(e) => toggleOpen(e.target.checked)} />
          <span className="knob" />
          {queue.requestsOpen ? 'Wünsche offen' : 'Wünsche pausiert'}
        </label>
        <label className="switch small">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          <span className="knob" />
          Ton
        </label>
        <button className="btn btn-sm btn-ghost" onClick={toggleFullscreen}>
          {fullscreen ? 'Vollbild beenden' : 'Vollbild'}
        </button>
      </div>
      {err && <p className="error-text">{err}</p>}

      <div className="stage-grid">
        {!current ? (
          <div className="now now-empty">
            <div className="eyebrow">Warteschlange leer</div>
            <p className="muted">Sobald ein Gast sich etwas wünscht, erscheint es hier sofort.</p>
          </div>
        ) : (
          <article className="now" aria-live="polite">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> Jetzt dran
            </div>
            <h2 className="now-title">{current.title}</h2>
            <div className="now-artist">{current.artist}</div>

            <div className="now-wishes">
              {current.wishes.map((w) => (
                <div key={w.id} className="now-wish">
                  <div className="now-from">
                    Gewünscht von <GuestName name={w.name} />
                    <span className="now-time">
                      {clock(w.createdAt)} Uhr · {ago(w.createdAt, now)}
                    </span>
                  </div>
                  {w.dedication ? (
                    <blockquote className="now-dedication">{w.dedication}</blockquote>
                  ) : (
                    <div className="now-nodedication">ohne Widmung</div>
                  )}
                </div>
              ))}
            </div>

            <div className="now-actions">
              <button className="btn btn-success btn-xl" onClick={() => finish(current, 'played')}>
                ✓ Gespielt – weiter
              </button>
              <button className="btn btn-ghost" onClick={() => finish(current, 'declined')}>
                Überspringen
              </button>
            </div>
          </article>
        )}

        <aside className="stage-side">
          {next && (
            <article className="up-next">
              <div className="eyebrow eyebrow-small">Als Nächstes</div>
              <div className="next-title">
                {next.title} <span className="next-artist">– {next.artist}</span>
              </div>
              <div className="next-from">
                von <GuestName name={next.wishes[0].name} />
                {next.wishes.length > 1 && ` und ${next.wishes.length - 1} weiteren`}
                <span className="dim"> · {clock(next.firstAt)} Uhr</span>
              </div>
              {next.wishes[0].dedication && <p className="next-dedication">„{next.wishes[0].dedication}“</p>}
            </article>
          )}

          {later.length > 0 && (
            <div className="later">
              <h3 className="later-head">Danach</h3>
              <ol className="later-list" start={3}>
                {later.map((item, i) => (
                  <li key={item.songId} className="later-row">
                    <span className="later-pos">{i + 3}</span>
                    <span className="later-main">
                      <strong>{item.title}</strong> <span className="muted">– {item.artist}</span>
                      <span className="later-meta">
                        {item.wishes.map((w) => w.name || 'anonym').join(', ')}
                        {item.wishes.some((w) => w.dedication) && ' · mit Widmung'}
                      </span>
                    </span>
                    <span className="later-time dim">{clock(item.firstAt)}</span>
                    <button
                      className="btn btn-sm btn-danger later-x"
                      onClick={() => finish(item, 'declined')}
                      aria-label={`${item.title} entfernen`}
                      title="Entfernen"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>

      <div className="row stage-footer">
        <span className="dim small">
          Erledigte Wünsche werden sofort anonymisiert. Nach dem Event alles löschen:
        </span>
        <button className="btn btn-sm btn-danger" onClick={clearAll}>
          Event beenden & alle Wünsche löschen
        </button>
      </div>

      {pending && (
        <div className="toast" role="status">
          <span>{pending.label}</span>
          <button className="btn btn-sm btn-primary" onClick={undo}>
            Rückgängig
          </button>
        </div>
      )}
    </section>
  );
}
