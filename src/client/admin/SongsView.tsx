import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Unauthorized } from './api';
import SongFilterBar from '../components/SongFilterBar';
import { decadeLabel, decadeOf, EMPTY_FILTER, filterOptions, filterSongs, type SongFilter } from '../../shared/songs';
import type { Song } from '../../shared/types';

type Draft = { artist: string; title: string; genre: string; year: string };
const EMPTY_DRAFT: Draft = { artist: '', title: '', genre: '', year: '' };

export default function SongsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [filter, setFilter] = useState<SongFilter>(EMPTY_FILTER);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fail = useCallback(
    (e: unknown, set: (m: { ok: boolean; text: string }) => void) => {
      if (e instanceof Unauthorized) onUnauthorized();
      else set({ ok: false, text: (e as Error).message });
    },
    [onUnauthorized],
  );

  const load = useCallback(async () => {
    try {
      setSongs(await api<Song[]>('/api/admin/songs'));
    } catch (e) {
      fail(e, setMsg);
    }
  }, [fail]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => (songs ? filterSongs(songs, filter) : []), [songs, filter]);
  const genres = useMemo(() => (songs ? filterOptions(songs).genres : []), [songs]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      if (editId) {
        await api(`/api/admin/songs/${editId}`, { method: 'PUT', body: draft });
        setMsg({ ok: true, text: `„${draft.title}“ gespeichert.` });
      } else {
        await api('/api/admin/songs', { method: 'POST', body: draft });
        setMsg({ ok: true, text: `„${draft.title}“ hinzugefügt.` });
      }
      // Interpret & Genre stehen lassen – praktisch beim Eintragen mehrerer Songs eines Künstlers
      setDraft(editId ? EMPTY_DRAFT : { ...EMPTY_DRAFT, artist: draft.artist, genre: draft.genre });
      setEditId(null);
      load();
    } catch (e) {
      fail(e, setMsg);
    }
  }

  function edit(s: Song) {
    setEditId(s.id);
    setDraft({ artist: s.artist, title: s.title, genre: s.genre, year: s.year ? String(s.year) : '' });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(s: Song) {
    if (!window.confirm(`„${s.title}“ von ${s.artist} wirklich löschen?`)) return;
    try {
      await api(`/api/admin/songs/${s.id}`, { method: 'DELETE' });
      if (editId === s.id) {
        setEditId(null);
        setDraft(EMPTY_DRAFT);
      }
      load();
    } catch (e) {
      fail(e, setMsg);
    }
  }

  async function runImport() {
    setImportMsg(null);
    try {
      const r = await api<{ added: number; skipped: number; errors: string[] }>('/api/admin/songs/import', {
        method: 'POST',
        body: { text: importText },
      });
      const parts = [`${r.added} hinzugefügt`];
      if (r.skipped) parts.push(`${r.skipped} schon vorhanden`);
      if (r.errors.length) parts.push(`${r.errors.length} fehlerhaft (${r.errors.slice(0, 3).join('; ')})`);
      setImportMsg({ ok: r.errors.length === 0, text: parts.join(' · ') });
      if (r.added) setImportText('');
      load();
    } catch (e) {
      fail(e, setImportMsg);
    }
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <div className="grid-2">
      <div style={{ display: 'grid', gap: 18 }}>
        <form className="card" onSubmit={save}>
          <h2 className="card-title">{editId ? 'Song bearbeiten' : 'Song hinzufügen'}</h2>
          <div className="field">
            <label htmlFor="s-artist">Interpret *</label>
            <input id="s-artist" className="input" required maxLength={120} value={draft.artist} onChange={set('artist')} />
          </div>
          <div className="field">
            <label htmlFor="s-title">Titel *</label>
            <input id="s-title" className="input" required maxLength={120} value={draft.title} onChange={set('title')} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="s-genre">Genre</label>
              <input id="s-genre" className="input" list="genre-list" maxLength={40} value={draft.genre} onChange={set('genre')} />
              <datalist id="genre-list">
                {genres.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="s-year">Jahr</label>
              <input id="s-year" className="input" inputMode="numeric" placeholder="1985" maxLength={4} value={draft.year} onChange={set('year')} />
            </div>
          </div>
          {msg && <p className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</p>}
          <div className="row">
            <button className="btn btn-primary">{editId ? 'Speichern' : 'Hinzufügen'}</button>
            {editId && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditId(null);
                  setDraft(EMPTY_DRAFT);
                }}
              >
                Abbrechen
              </button>
            )}
          </div>
        </form>

        <div className="card">
          <h2 className="card-title">Viele Songs auf einmal</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Eine Zeile pro Song: <code>Interpret; Titel; Genre; Jahr</code>. Genre und Jahr sind optional. Du kannst
            auch Spalten aus Excel einfügen.
          </p>
          <textarea
            className="textarea"
            rows={6}
            placeholder={'Queen; Bohemian Rhapsody; Rock; 1975\nAdele; Make You Feel My Love; Pop; 2008'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {importMsg && <p className={importMsg.ok ? 'ok-text' : 'error-text'}>{importMsg.text}</p>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" disabled={!importText.trim()} onClick={runImport}>
              Importieren
            </button>
            <span className="spacer" />
            <a className="btn btn-ghost btn-sm" href="/api/admin/songs/export" download>
              Als CSV exportieren
            </a>
          </div>
        </div>
      </div>

      <div>
        {!songs ? (
          <p className="empty">Lädt …</p>
        ) : (
          <>
            <SongFilterBar songs={songs} filter={filter} onChange={setFilter} resultCount={visible.length} />
            {visible.length === 0 ? (
              <p className="empty">{songs.length ? 'Keine passenden Songs.' : 'Noch keine Songs – leg links los!'}</p>
            ) : (
              <table className="admin-songs">
                <thead>
                  <tr>
                    <th onClick={() => setFilter({ ...filter, sort: 'title' })}>Titel {filter.sort === 'title' && '↓'}</th>
                    <th onClick={() => setFilter({ ...filter, sort: 'artist' })}>
                      Interpret {filter.sort === 'artist' && '↓'}
                    </th>
                    <th className="hide-sm">Genre</th>
                    <th className="hide-sm">Jahr</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.title}</strong>
                      </td>
                      <td className="muted">{s.artist}</td>
                      <td className="hide-sm">{s.genre && <span className="tag">{s.genre}</span>}</td>
                      <td className="hide-sm dim" title={s.year ? decadeLabel(decadeOf(s.year)) : ''}>
                        {s.year ?? ''}
                      </td>
                      <td className="actions">
                        <button className="btn btn-sm btn-ghost" onClick={() => edit(s)}>
                          Bearbeiten
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(s)} aria-label={`${s.title} löschen`}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
