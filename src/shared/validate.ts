import type { Song } from './types.ts';

const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, max);
}

/** Akzeptiert "1985", "85", "80er" → Jahr als Zahl, sonst null. */
export function parseYear(value: unknown): number | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})$/);
  if (m) {
    const y = Number(m[1]);
    return y >= 1900 && y <= 2100 ? y : null;
  }
  m = s.match(/^(\d{2})(?:er)?$/i);
  if (m) {
    const n = Number(m[1]);
    return n <= 30 ? 2000 + n : 1900 + n;
  }
  return null;
}

export function normalizeSong(input: Record<string, unknown>): Omit<Song, 'id'> | null {
  const artist = clean(input.artist, 120);
  const title = clean(input.title, 120);
  if (!artist || !title) return null;
  return { artist, title, genre: clean(input.genre, 40), year: parseYear(input.year) };
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
