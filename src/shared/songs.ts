import type { Song } from './types.ts';

export function decadeOf(year: number | null): number | null {
  return year ? Math.floor(year / 10) * 10 : null;
}

export function decadeLabel(decade: number | null): string {
  if (decade === null) return '';
  return decade >= 2000 ? `${decade}er` : `${String(decade).slice(2)}er`;
}

export type SongFilter = {
  search: string;
  artist: string;
  genre: string;
  decade: string;
  sort: 'artist' | 'title';
};

export const EMPTY_FILTER: SongFilter = { search: '', artist: '', genre: '', decade: '', sort: 'artist' };

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Sortiert ohne führendes "The " / "Die " etc., damit "The Beatles" unter B steht. */
const sortKey = (s: string) => s.replace(/^(the|die|der|das)\s+/i, '');

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function filterSongs<T extends Song>(songs: T[], f: SongFilter): T[] {
  const words = norm(f.search).split(/\s+/).filter(Boolean);
  const list = songs.filter((s) => {
    if (f.artist && s.artist !== f.artist) return false;
    if (f.genre && s.genre !== f.genre) return false;
    if (f.decade && String(decadeOf(s.year)) !== f.decade) return false;
    if (words.length) {
      const hay = norm(`${s.title} ${s.artist}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  return list.sort((a, b) =>
    f.sort === 'title'
      ? collator.compare(a.title, b.title) || collator.compare(sortKey(a.artist), sortKey(b.artist))
      : collator.compare(sortKey(a.artist), sortKey(b.artist)) || collator.compare(a.title, b.title),
  );
}

export function filterOptions(songs: Song[]) {
  const artists = [...new Set(songs.map((s) => s.artist))].sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
  const genres = [...new Set(songs.map((s) => s.genre).filter(Boolean))].sort(collator.compare);
  const decades = [...new Set(songs.map((s) => decadeOf(s.year)).filter((d): d is number => d !== null))].sort(
    (a, b) => a - b,
  );
  return { artists, genres, decades };
}
