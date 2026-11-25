import path from 'node:path';

// 3001 statt 3000, damit die App neben der Next-Version (Port 3000) laufen kann
export const PORT = Number(process.env.PORT) || 3001;
export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const SEED_FILE = path.resolve('seed', 'songs.json');
export const DIST_DIR = path.resolve('dist');
export const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

/** Nicht gespielte Wünsche werden spätestens nach dieser Zeit gelöscht (gespielte sofort). */
export const REQUEST_TTL_MS = (Number(process.env.REQUEST_TTL_HOURS) || 12) * 3600_000;

export const LIMITS = {
  name: 40,
  dedication: 300,
  /** Max. offene Wünsche gleichzeitig pro Gast (Browser-Tab) */
  openPerGuest: 3,
} as const;
