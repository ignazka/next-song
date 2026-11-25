import path from 'node:path';

// 3001 statt 3000, damit die App neben der Next-Version (Port 3000) laufen kann
export const PORT = Number(process.env.PORT) || 3001;
export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const SEED_FILE = path.resolve('seed', 'songs.json');
export const DIST_DIR = path.resolve('dist');
export const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

/** Wünsche (inkl. Name und Widmung) werden spätestens nach dieser Zeit gelöscht. */
export const REQUEST_TTL_MS = (Number(process.env.REQUEST_TTL_HOURS) || 12) * 3600_000;

export const LIMITS = {
  name: 40,
  dedication: 300,
  /** Max. Wünsche pro Gast (Browser-Tab) im Zeitfenster */
  perGuest: 3,
  /** Max. Wünsche pro IP im Zeitfenster (großzügig, weil viele Gäste dasselbe WLAN nutzen) */
  perIp: 60,
  windowMs: 10 * 60_000,
} as const;
