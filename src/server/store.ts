/**
 * Der gesamte Zustand der App – ohne Datenbank.
 *
 * - Songliste und Einstellungen: JSON-Dateien in DATA_DIR (überstehen Neustarts)
 * - Wünsche: nur im Arbeitsspeicher. Name und Widmung landen nie auf der Festplatte.
 *   Nach einem Neustart ist die Warteschlange leer – für die Dauer eines Events vertretbar.
 *
 * Jede Änderung löst das Event "change" aus; die Musiker-Ansichten hängen per SSE daran.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, REQUEST_TTL_MS, SEED_FILE } from './config.ts';
import type { AdminRequest, Settings, Song } from '../shared/types.ts';

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
/** Nur die bekannten Felder übernehmen (ältere Listen hatten z. B. noch ein Genre). */
const toSong = (s: Partial<Song>): Song => ({
  id: s.id || crypto.randomUUID(),
  artist: String(s.artist ?? ''),
  title: String(s.title ?? ''),
  year: typeof s.year === 'number' ? s.year : null,
});

let songs: Song[];
if (fs.existsSync(SONGS_FILE)) {
  const raw = readJson<Partial<Song>[]>(SONGS_FILE, []);
  songs = raw.map(toSong);
  // Alte Felder einmalig aus der Datei entfernen
  if (JSON.stringify(raw) !== JSON.stringify(songs)) writeJson(SONGS_FILE, songs);
} else {
  // Erster Start: Beispielsongs übernehmen, damit die App nicht leer ist
  songs = readJson<Partial<Song>[]>(SEED_FILE, []).map(toSong);
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
  finishWishes(wishes.filter((w) => w.songId === id).map((w) => w.id), 'declined');
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
/** Standard-Begrüßungen mit und ohne Widmung (beide im Musiker-Bereich änderbar). */
export const DEFAULT_WELCOME = 'Such dir ein Lied aus, gerne mit einer kleinen Widmung. Ich lese sie vor, wenn dein Lied dran ist.';
export const DEFAULT_WELCOME_NO_DEDICATION = 'Such dir ein Lied aus. Ich spiele es, sobald es gut passt.';

const DEFAULT_SETTINGS: Settings = {
  eventTitle: 'Wünsch dir ein Lied',
  welcomeText: DEFAULT_WELCOME,
  welcomeTextNoDedication: DEFAULT_WELCOME_NO_DEDICATION,
  dedicationsEnabled: true,
};
// Nur bekannte Einstellungen übernehmen (entfernte Optionen aus älteren Dateien fallen weg)
const savedSettings = readJson<Partial<Record<keyof Settings, unknown>>>(SETTINGS_FILE, {});
let settings: Settings = { ...DEFAULT_SETTINGS };
for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
  if (key in savedSettings) (settings as Record<string, unknown>)[key] = savedSettings[key];
}

export const getSettings = (): Settings => settings;
export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  writeJson(SETTINGS_FILE, settings);
  changed();
}

// ---------- Wünsche (nur im Arbeitsspeicher) ----------
//
// Datenschutz-Prinzip: Ein Wunsch existiert nur, solange er in der Warteschlange steht.
// Sobald der Musiker ihn als gespielt markiert (oder überspringt), wird er vollständig
// gelöscht – es bleibt kein Eintrag, kein Status, kein Zeitstempel und kein Gast-Kennzeichen.
// Übrig bleibt nur der Zähler „x gespielt“ (eine Zahl ohne Bezug zu Lied oder Person).
type Wish = {
  id: string;
  songId: string;
  name: string;
  dedication: string;
  /** gehashter Zufalls-Token des Browser-Tabs – nur für das Limit offener Wünsche */
  guestKey: string;
  createdAt: number;
};
let wishes: Wish[] = [];
let playedCount = 0;
/**
 * Reihenfolge der Warteschlange als Liste von Song-IDs (ein Platz pro Lied).
 * Neue Lieder kommen ans Ende; wird ein Lied mehrfach gewünscht, behält es seinen Platz.
 * Der Musiker kann die Reihenfolge ändern (Überspringen, Ziehen).
 */
let order: string[] = [];

/** Lieder ohne offene Wünsche aus der Reihenfolge entfernen. */
function pruneOrder() {
  const open = new Set(wishes.map((w) => w.songId));
  order = order.filter((id) => open.has(id));
}

export function addWish(input: { songId: string; name: string; dedication: string; guestKey: string }): string {
  const wish: Wish = { id: crypto.randomUUID(), createdAt: Date.now(), ...input };
  wishes.push(wish);
  if (!order.includes(wish.songId)) order.push(wish.songId);
  changed();
  return wish.id;
}

/**
 * Neue Reihenfolge setzen. Unbekannte IDs werden ignoriert; Lieder, die im Request fehlen
 * (z. B. weil gerade ein neuer Wunsch kam), behalten ihre Reihenfolge und kommen ans Ende.
 */
export function setOrder(songIds: string[]) {
  const current = new Set(order);
  const head = [...new Set(songIds)].filter((id) => current.has(id));
  const rest = order.filter((id) => !head.includes(id));
  order = [...head, ...rest];
  changed();
}

/** Offene Wünsche dieses Gastes (für das Limit – erledigte Wünsche sind ja gelöscht). */
export function openWishesOf(guestKey: string): number {
  return wishes.filter((w) => w.guestKey === guestKey).length;
}

/** Gespielt oder entfernt: Wunsch komplett löschen. */
export function finishWishes(ids: string[], status: 'played' | 'declined'): number {
  const remove = new Set(ids);
  const before = wishes.length;
  wishes = wishes.filter((w) => !remove.has(w.id));
  const n = before - wishes.length;
  if (status === 'played') playedCount += n;
  pruneOrder();
  if (n) changed();
  return n;
}

/** Event beenden: alles vergessen. */
export function clearWishes() {
  wishes = [];
  order = [];
  playedCount = 0;
  changed();
}

/** Offene Wünsche für den Musiker in der Reihenfolge der Warteschlange (innerhalb eines Lieds: ältester zuerst). */
export function queue(): AdminRequest[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return wishes
    .slice()
    .sort((a, b) => (pos.get(a.songId) ?? Infinity) - (pos.get(b.songId) ?? Infinity) || a.createdAt - b.createdAt)
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

// ---------- Automatisches Löschen nicht gespielter Wünsche ----------
setInterval(() => {
  const cutoff = Date.now() - REQUEST_TTL_MS;
  const before = wishes.length;
  wishes = wishes.filter((w) => w.createdAt >= cutoff);
  if (wishes.length !== before) {
    pruneOrder();
    changed();
  }
}, 60_000).unref();
