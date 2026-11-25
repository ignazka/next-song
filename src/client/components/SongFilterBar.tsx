import { decadeLabel, EMPTY_FILTER, filterOptions, type SongFilter } from '../../shared/songs';
import type { Song } from '../../shared/types';
import { SearchIcon } from './Icons';

type Props = {
  songs: Song[];
  filter: SongFilter;
  onChange: (f: SongFilter) => void;
  resultCount: number;
};

export default function SongFilterBar({ songs, filter, onChange, resultCount }: Props) {
  const { artists, decades } = filterOptions(songs);
  const set = (patch: Partial<SongFilter>) => onChange({ ...filter, ...patch });
  const active = !!(filter.search || filter.artist || filter.decade);

  return (
    <div className="filters">
      <div className="search">
        <SearchIcon />
        <input
          className="input"
          type="search"
          inputMode="search"
          placeholder="Lied oder Interpret"
          value={filter.search}
          onChange={(e) => set({ search: e.target.value })}
          aria-label="Suche"
        />
      </div>
      <div className="filter-grid">
        <select
          className={`select ${filter.artist ? 'active' : ''}`}
          value={filter.artist}
          onChange={(e) => set({ artist: e.target.value })}
          aria-label="Interpret"
        >
          <option value="">Interpret</option>
          {artists.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          className={`select ${filter.decade ? 'active' : ''}`}
          value={filter.decade}
          onChange={(e) => set({ decade: e.target.value })}
          aria-label="Jahrzehnt"
        >
          <option value="">Jahrzehnt</option>
          {decades.map((d) => (
            <option key={d} value={String(d)}>{decadeLabel(d)}</option>
          ))}
        </select>
      </div>
      <div className="filter-meta">
        <span>
          {resultCount} {resultCount === 1 ? 'Lied' : 'Lieder'}
        </span>
        {active && (
          <button type="button" className="linkbtn" onClick={() => onChange({ ...EMPTY_FILTER, sort: filter.sort })}>
            Filter zurücksetzen
          </button>
        )}
        <span className="spacer" />
        <span className="dim">Sortieren:</span>
        <div className="seg" role="group" aria-label="Sortierung">
          <button type="button" className={filter.sort === 'artist' ? 'on' : ''} onClick={() => set({ sort: 'artist' })}>
            Interpret
          </button>
          <button type="button" className={filter.sort === 'title' ? 'on' : ''} onClick={() => set({ sort: 'title' })}>
            Titel
          </button>
        </div>
      </div>
    </div>
  );
}
