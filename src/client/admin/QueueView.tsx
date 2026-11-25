import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Unauthorized } from './api';
import { GripIcon } from '../components/Icons';
import type { AdminQueue, AdminRequest, QueueItem } from '../../shared/types';

/** Sicherheitsnetz, falls der Live-Stream unbemerkt hängt. */
const FALLBACK_POLL_MS = 20_000;
/** So lange kann „Gespielt“ / „Entfernen“ rückgängig gemacht werden. */
const UNDO_MS = 6_000;

type Live = 'connecting' | 'live' | 'offline';
type FinishStatus = 'played' | 'declined';
type Pending = { ids: string[]; status: FinishStatus; label: string; timer: ReturnType<typeof setTimeout> };

/** Wünsche zum selben Lied zusammenfassen; die Reihenfolge kommt vom Server. */
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
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** Reihenfolge, die lokal schon gilt, bevor der Server sie bestätigt hat (Ziehen, Überspringen). */
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const pendingRef = useRef<Pending | null>(null);
  const loading = useRef<{ busy: boolean; again: boolean }>({ busy: false, again: false });
  const listRef = useRef<HTMLOListElement>(null);
  const drag = useRef<{ start: string[]; order: string[] } | null>(null);

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

  const items = useMemo(() => {
    const base = queue ? groupQueue(queue.requests, hidden) : [];
    if (!localOrder) return base;
    const pos = new Map(localOrder.map((id, i) => [id, i]));
    return base.slice().sort((a, b) => (pos.get(a.songId) ?? Infinity) - (pos.get(b.songId) ?? Infinity));
  }, [queue, hidden, localOrder]);
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

  // ---------- Reihenfolge ändern (Überspringen, Ziehen) ----------
  const applyOrder = useCallback(
    async (songIds: string[]) => {
      setLocalOrder(songIds); // sofort anzeigen
      try {
        await api('/api/admin/order', { method: 'PUT', body: { songIds } });
        await load();
      } catch (e) {
        if (e instanceof Unauthorized) return onUnauthorized();
        setErr('Reihenfolge konnte nicht gespeichert werden – bitte nochmal versuchen.');
      } finally {
        if (!drag.current) setLocalOrder(null);
      }
    },
    [load, onUnauthorized],
  );

  /** Überspringen: aktuelles Lied mit dem nächsten tauschen (nichts wird gelöscht). */
  function skip() {
    if (items.length < 2) return;
    const ids = items.map((i) => i.songId);
    applyOrder([ids[1], ids[0], ...ids.slice(2)]);
  }

  // Ziehen mit Maus oder Finger am Griff. Die Liste ordnet sich live um, losgelassen wird gespeichert.
  function onDragStart(e: React.PointerEvent, songId: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = items.map((i) => i.songId);
    drag.current = { start, order: start };
    setLocalOrder(start);
    setDragId(songId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragId || !drag.current || !listRef.current) return;
    const others = [...listRef.current.querySelectorAll<HTMLElement>('[data-song]')].filter(
      (row) => row.dataset.song !== dragId,
    );
    let index = others.findIndex((row) => {
      const box = row.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });
    if (index === -1) index = others.length;
    const upcoming = others.map((row) => row.dataset.song!);
    upcoming.splice(index, 0, dragId);
    const next = [drag.current.order[0], ...upcoming];
    if (next.join() !== drag.current.order.join()) {
      drag.current.order = next;
      setLocalOrder(next);
    }
  }

  function onDragEnd() {
    if (!drag.current) return;
    const { start, order } = drag.current;
    drag.current = null;
    setDragId(null);
    if (order.join() !== start.join()) applyOrder(order);
    else setLocalOrder(null);
  }

  /** Tastatur: Griff fokussieren, dann mit Pfeil hoch/runter verschieben. */
  function onHandleKey(e: React.KeyboardEvent, songId: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const ids = items.map((i) => i.songId);
    const i = ids.indexOf(songId);
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 1 || j >= ids.length) return; // „Jetzt dran“ bleibt oben – dafür gibt es „Überspringen“
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(ids);
  }

  // ---------- Gespielt / Entfernen mit Rückgängig ----------
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
    const label = `„${item.title}“ ${status === 'played' ? 'gespielt' : 'entfernt'}`;
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

  const [current, ...upcoming] = items;
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
              <button
                className="btn btn-outline"
                onClick={skip}
                disabled={upcoming.length === 0}
                title="Mit dem nächsten Lied tauschen – nichts wird gelöscht"
              >
                Überspringen
              </button>
              <button
                className="btn btn-remove"
                onClick={() => finish(current, 'declined')}
                title="Wunsch löschen (kann kurz rückgängig gemacht werden)"
              >
                Entfernen
              </button>
            </div>
          </article>
        )}

        <aside className="stage-side">
          {upcoming.length > 0 && (
            <div className="later">
              <h3 className="later-head">Warteschlange · zum Sortieren ziehen</h3>
              <ol className="later-list" ref={listRef}>
                {upcoming.map((item, i) => {
                  const isNext = i === 0;
                  const firstDedication = item.wishes.find((w) => w.dedication)?.dedication;
                  return (
                    <li
                      key={item.songId}
                      data-song={item.songId}
                      className={`later-row${isNext ? ' is-next' : ''}${dragId === item.songId ? ' is-dragging' : ''}`}
                    >
                      <button
                        type="button"
                        className="drag-handle"
                        aria-label={`${item.title} verschieben (ziehen oder Pfeiltasten)`}
                        title="Ziehen zum Sortieren"
                        onPointerDown={(e) => onDragStart(e, item.songId)}
                        onPointerMove={onDragMove}
                        onPointerUp={onDragEnd}
                        onPointerCancel={onDragEnd}
                        onKeyDown={(e) => onHandleKey(e, item.songId)}
                      >
                        <GripIcon size={18} />
                      </button>
                      <span className="later-pos">{i + 2}</span>
                      <span className="later-main">
                        {isNext && <span className="next-badge">Als Nächstes</span>}
                        <span className="later-title">
                          <strong>{item.title}</strong> <span className="muted">– {item.artist}</span>
                        </span>
                        <span className="later-meta">
                          {item.wishes.map((w) => w.name || 'anonym').join(', ')}
                          {!isNext && firstDedication && ' · mit Widmung'}
                        </span>
                        {isNext && firstDedication && <span className="later-dedication">„{firstDedication}“</span>}
                      </span>
                      <span className="later-time dim">{clock(item.firstAt)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </aside>
      </div>

      <div className="row stage-footer">
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
