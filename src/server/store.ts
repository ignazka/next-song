/**
 * Der gesamte Zustand der App – ohne Datenbank.
 *
 * - Songliste und Einstellungen: JSON-Dateien in DATA_DIR (überstehen Neustarts)
 * - Wünsche: nur im Arbeitsspeicher. Name und Widmung landen nie auf der Festplatte.
 *   Nach einem Neustart ist die Warteschlange leer – für den Abend eines Events vertretbar.
 *
 * Jede Änderung löst das Event "change" aus; die Musiker-Ansichten hängen per SSE daran.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, LIMITS, REQUEST_TTL_MS, SEED_FILE } from './config.ts';
import type { AdminRequest, RequestStatus, Settings, Song } from '../shared/types.ts';

// ---------- Dateien ----------
const SONGS_FILE = path.join(DATA_DIR, 'songs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Erst in eine Temp-Datei schreiben, dann umbenennen – so ist die Datei nie halb geschrieben. */
function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Änderungs-Events (Echtzeit) ----------
export const events = new EventEmitter();
events.setMaxListeners(0);
let changeTimer: ReturnType<typeof setTimeout> | undefined;
/** Mehrere Änderungen kurz hintereinander zu einem Update zusammenfassen. */
function changed() {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => events.emit('change'), 30);
}

// ---------- Songliste ----------
let songs: Song[] = readJson<Song[] | null>(SONGS_FILE, null) ?? [];
if (!fs.existsSync(SONGS_FILE)) {
  // Erster Start: Beispielsongs übernehmen, damit die App nicht leer ist
  songs = readJson<Omit<Song, 'id'>[]>(SEED_FILE, []).map((s) => ({ id: crypto.randomUUID(), ...s }));
  writeJson(SONGS_FILE, songs);
}
const songKey = (s: Pick<Song, 'artist' | 'title'>) => `${s.artist.toLowerCase()}|${s.title.toLowerCase()}`;
const saveSongs = () => writeJson(SONGS_FILE, songs);

export const listSongs = (): Song[] => songs;
export const findSong = (id: string) => songs.find((s) => s.id === id);

export function addSong(input: Omit<Song, 'id'>): Song | null {
  if (songs.some((s) => songKey(s) === songKey(input))) return null;
  const song = { id: crypto.randomUUID(), ...input };
  songs.push(song);
  saveSongs();
  changed();
  return song;
}

export function updateSong(id: string, input: Omit<Song, 'id'>): Song | 'missing' | 'duplicate' {
  const song = findSong(id);
  if (!song) return 'missing';
  if (songs.some((s) => s.id !== id && songKey(s) === songKey(input))) return 'duplicate';
  Object.assign(song, input);
  saveSongs();
  changed();
  return song;
}

export function deleteSong(id: string): boolean {
  const before = songs.length;
  songs = songs.filter((s) => s.id !== id);
  if (songs.length === before) return false;
  // offene Wünsche zu diesem Song mit entfernen
  for (const w of wishes.filter((w) => w.songId === id)) finish(w.id, 'declined');
  saveSongs();
  changed();
  return true;
}

/** Fügt mehrere Songs hinzu; Duplikate werden übersprungen. */
export function addSongs(list: Omit<Song, 'id'>[]): { added: number; skipped: number } {
  const keys = new Set(songs.map(songKey));
  let added = 0;
  for (const s of list) {
    if (keys.has(songKey(s))) continue;
    keys.add(songKey(s));
    songs.push({ id: crypto.randomUUID(), ...s });
    added++;
  }
  if (added) {
    saveSongs();
    changed();
  }
  return { added, skipped: list.length - added };
}

// ---------- Einstellungen ----------
const DEFAULT_SETTINGS: Settings = {
  eventTitle: 'Wünsch dir ein Lied',
  welcomeText: 'Such dir ein Lied aus, gerne mit einer kleinen Widmung. Ich lese sie vor, wenn dein Lied dran ist.',
  requestsOpen: true,
  publicUrl: process.env.PUBLIC_URL ?? '',
  reviewUrl: '',
  hostFormal: false,
};
let settings: Settings = { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_FILE, {}) };

export const getSettings = (): Settings => settings;
export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  writeJson(SETTINGS_FILE, settings);
  changed();
}

// ---------- Wünsche (nur im Arbeitsspeicher) ----------
type Wish = {
  id: string;
  songId: string;
  name: string;
  dedication: string;
  /** gehashter Zufalls-Token des Browser-Tabs – nur für das Wunsch-Limit */
  guestKey: string;
  createdAt: number;
};
let wishes: Wish[] = [];
/** Erledigte Wünsche: nur ID → Status, ohne personenbezogene Daten (für die Statusanzeige beim Gast). */
const done = new Map<string, { status: Exclude<RequestStatus, 'open' | 'next'>; at: number; createdAt: number }>();
let playedCount = 0;

export function addWish(input: { songId: string; name: string; dedication: string; guestKey: string }): string {
  const wish: Wish = { id: crypto.randomUUID(), createdAt: Date.now(), ...input };
  wishes.push(wish);
  changed();
  return wish.id;
}

/** Wünsche dieses Gastes im Zeitfenster (offene und erledigte zählen, damit das Limit nicht umgangen wird). */
export function recentWishesOf(guestKey: string): number {
  const since = Date.now() - LIMITS.windowMs;
  return wishes.filter((w) => w.guestKey === guestKey && w.createdAt > since).length + recentDoneKeys(guestKey, since);
}
// Für das Limit merken wir uns nach dem Erledigen nur den Zeitpunkt pro Gast – im Speicher, 10 Minuten lang.
const doneByGuest = new Map<string, number[]>();
function recentDoneKeys(guestKey: string, since: number) {
  return (doneByGuest.get(guestKey) ?? []).filter((t) => t > since).length;
}

function finish(id: string, status: 'played' | 'declined'): boolean {
  const i = wishes.findIndex((w) => w.id === id);
  if (i === -1) return false;
  const [w] = wishes.splice(i, 1); // damit sind Name und Widmung gelöscht
  done.set(id, { status, at: Date.now(), createdAt: w.createdAt });
  if (w.guestKey) doneByGuest.set(w.guestKey, [...(doneByGuest.get(w.guestKey) ?? []), w.createdAt]);
  if (status === 'played') playedCount++;
  return true;
}

export function finishWishes(ids: string[], status: 'played' | 'declined'): number {
  const n = ids.filter((id) => finish(id, status)).length;
  if (n) changed();
  return n;
}

/** Event beenden: alles vergessen. */
export function clearWishes() {
  for (const w of wishes) done.set(w.id, { status: 'gone', at: Date.now(), createdAt: w.createdAt });
  wishes = [];
  doneByGuest.clear();
  playedCount = 0;
  changed();
}

/** Offene Wünsche für den Musiker, ältester zuerst. */
export function queue(): AdminRequest[] {
  return wishes
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((w) => {
      const song = findSong(w.songId);
      if (!song) return [];
      return [
        {
          id: w.id,
          songId: w.songId,
          artist: song.artist,
          title: song.title,
          name: w.name,
          dedication: w.dedication,
          createdAt: new Date(w.createdAt).toISOString(),
        },
      ];
    });
}

export const getPlayedCount = () => playedCount;

/** Anzahl offener Wünsche je Song (für „schon gewünscht“ in der Gäste-Liste). */
export function wishedCounts(): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of wishes) m.set(w.songId, (m.get(w.songId) ?? 0) + 1);
  return m;
}

/**
 * Status für den Gast. Die Position entspricht der Musiker-Warteschlange:
 * Songs in Reihenfolge des ersten Wunsches, mehrfach gewünschte Songs zählen als ein Platz.
 */
export function wishStatus(id: string): { status: RequestStatus; position: number | null } {
  const w = wishes.find((x) => x.id === id);
  if (!w) return { status: done.get(id)?.status ?? 'gone', position: null };
  const order: string[] = [];
  for (const x of wishes.slice().sort((a, b) => a.createdAt - b.createdAt)) {
    if (!order.includes(x.songId)) order.push(x.songId);
  }
  return { status: 'open', position: order.indexOf(w.songId) + 1 };
}

// ---------- Automatisches Löschen ----------
function purge() {
  const cutoff = Date.now() - REQUEST_TTL_MS;
  const before = wishes.length;
  wishes = wishes.filter((w) => w.createdAt >= cutoff);
  for (const [id, d] of done) if (d.createdAt < cutoff) done.delete(id);
  const windowStart = Date.now() - LIMITS.windowMs;
  for (const [k, times] of doneByGuest) {
    const fresh = times.filter((t) => t > windowStart);
    if (fresh.length) doneByGuest.set(k, fresh);
    else doneByGuest.delete(k);
  }
  if (wishes.length !== before) changed();
}
setInterval(purge, 60_000).unref();
