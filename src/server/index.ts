/**
 * Songwunsch-Server: Hono auf Node.js. Ein Prozess für alles:
 * API, Live-Stream (SSE) für den Musiker und – in Produktion – die gebaute Oberfläche aus dist/.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { checkPassword, createSession, destroySession, isAdmin, isPasswordConfigured, requireAdmin } from './auth.ts';
import { DIST_DIR, LIMITS, PORT, TRUST_PROXY } from './config.ts';
import * as store from './store.ts';
import { clean, isUuid, normalizeSong } from '../shared/validate.ts';
import type { AdminQueue, PublicData, Settings } from '../shared/types.ts';

const app = new Hono();

// ---------- Hilfen ----------
type Body = Record<string, unknown>;
async function body(c: Context): Promise<Body> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' ? (b as Body) : {};
  } catch {
    return {};
  }
}

/** In-Memory-Limit gegen Passwort-Raten beim Musiker-Login (betrifft keine Gäste). */
const LOGIN_WINDOW_MS = 10 * 60_000;
const buckets = new Map<string, number[]>();
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  const ok = list.length < max;
  if (ok) list.push(now);
  buckets.set(key, list);
  return ok;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (!v.some((t) => now - t < LOGIN_WINDOW_MS)) buckets.delete(k);
}, 60_000).unref();

function clientIp(c: Context): string {
  if (TRUST_PROXY) {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  }
  return getConnInfo(c).remote.address ?? 'unknown';
}

// ---------- Allgemein ----------
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
});
app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 }));
app.use('/api/*', async (c, next) => {
  await next();
  if (!c.res.headers.get('Cache-Control')) c.header('Cache-Control', 'no-store');
});

// ---------- Öffentlich (Gäste) ----------
app.get('/api/public', (c) => {
  const s = store.getSettings();
  const counts = store.wishedCounts();
  const data: PublicData = {
    eventTitle: s.eventTitle,
    // Standardtext erwähnt Widmungen – sind sie aus, die passende Variante zeigen
    welcomeText:
      !s.dedicationsEnabled && s.welcomeText === store.DEFAULT_WELCOME ? store.DEFAULT_WELCOME_NO_DEDICATION : s.welcomeText,
    dedicationsEnabled: s.dedicationsEnabled,
    limits: { name: LIMITS.name, dedication: LIMITS.dedication },
    songs: store.listSongs().map((song) => ({ ...song, wished: counts.get(song.id) ?? 0 })),
  };
  return c.json(data);
});

app.post('/api/requests', async (c) => {
  const b = await body(c);
  const songId = clean(b.songId, 64);
  if (!store.findSong(songId)) return c.json({ error: 'Lied nicht gefunden.' }, 404);

  // Limit ohne zusätzliche Speicherung: gezählt werden nur die offenen Wünsche dieses Gastes,
  // die ohnehin in der Warteschlange stehen. Keine IP-Adressen, keine Zeitstempel danach.
  // Der Token stammt aus dem sessionStorage des Gastes und wird nur gehasht am Wunsch gehalten.
  const token = clean(b.guestToken, 64);
  const guestKey = token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 32) : '';
  if (guestKey && store.openWishesOf(guestKey) >= LIMITS.openPerGuest) {
    return c.json(
      { error: `Du hast schon ${LIMITS.openPerGuest} offene Wünsche – sobald eins davon gespielt ist, kannst du dir wieder etwas wünschen.` },
      429,
    );
  }

  const id = store.addWish({
    songId,
    name: clean(b.name, LIMITS.name),
    // Widmungen ausgeschaltet → auch eine mitgeschickte Widmung wird verworfen
    dedication: store.getSettings().dedicationsEnabled ? clean(b.dedication, LIMITS.dedication) : '',
    guestKey,
  });
  return c.json({ id }, 201);
});

// ---------- Musiker: Login ----------
app.post('/api/admin/login', async (c) => {
  if (!isPasswordConfigured()) {
    return c.json({ error: 'Es ist kein Passwort eingerichtet. Bitte ADMIN_PASSWORD in der .env setzen.' }, 503);
  }
  if (!rateLimit(`login:${clientIp(c)}`, 10, LOGIN_WINDOW_MS)) {
    return c.json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut probieren.' }, 429);
  }
  const b = await body(c);
  if (!checkPassword(String(b.password ?? ''))) return c.json({ error: 'Falsches Passwort.' }, 401);
  createSession(c);
  return c.json({ ok: true });
});
app.post('/api/admin/logout', (c) => {
  destroySession(c);
  return c.json({ ok: true });
});
app.get('/api/admin/me', (c) => c.json({ loggedIn: isAdmin(c), passwordConfigured: isPasswordConfigured() }));

// Alles Weitere unter /api/admin nur mit Login
const admin = new Hono();
admin.use('*', requireAdmin);

// ---------- Musiker: Warteschlange ----------
admin.get('/requests', (c) => {
  const data: AdminQueue = {
    requests: store.queue(),
    playedCount: store.getPlayedCount(),
  };
  return c.json(data);
});

/** Mehrere Wünsche erledigen. Body: { ids, status: 'played' | 'declined' } – Name und Widmung sind danach weg. */
admin.patch('/requests', async (c) => {
  const b = await body(c);
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter(isUuid).slice(0, 200);
  if (b.status !== 'played' && b.status !== 'declined') return c.json({ error: 'Ungültiger Status' }, 400);
  if (!ids.length) return c.json({ error: 'Keine Wünsche angegeben' }, 400);
  return c.json({ ok: true, updated: store.finishWishes(ids, b.status) });
});

/** Event beenden: alle Wünsche löschen. */
admin.delete('/requests', (c) => {
  store.clearWishes();
  return c.json({ ok: true });
});

/** Reihenfolge der Warteschlange ändern (Überspringen, Ziehen). Body: { songIds: string[] } */
admin.put('/order', async (c) => {
  const b = await body(c);
  const songIds = (Array.isArray(b.songIds) ? b.songIds : []).map(String).filter(isUuid).slice(0, 500);
  store.setOrder(songIds);
  return c.json({ ok: true });
});

/** Live-Stream: bei jeder Änderung ein "change"-Event; der Browser lädt dann die Warteschlange neu. */
admin.get('/stream', (c) => {
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('X-Accel-Buffering', 'no');
  return streamSSE(c, async (stream) => {
    let alive = true;
    const onChange = () => {
      void stream.writeSSE({ event: 'change', data: String(Date.now()) });
    };
    store.events.on('change', onChange);
    stream.onAbort(() => {
      alive = false;
      store.events.off('change', onChange);
    });
    // 2 KB Polster: Safari und manche Proxys puffern die ersten Bytes einer Antwort.
    await stream.write(`:${' '.repeat(2048)}\n\n`);
    await stream.writeSSE({ event: 'change', data: 'connected', retry: 2000 });
    while (alive) {
      await stream.sleep(15_000);
      if (alive) await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
    }
  });
});

// ---------- Musiker: Einstellungen ----------
admin.get('/settings', (c) => c.json({ settings: store.getSettings() }));

admin.put('/settings', async (c) => {
  const b = await body(c);
  const patch: Partial<Settings> = {};
  if ('eventTitle' in b) patch.eventTitle = clean(b.eventTitle, 80) || 'Wünsch dir ein Lied';
  if ('welcomeText' in b) patch.welcomeText = clean(b.welcomeText, 300);
  if ('dedicationsEnabled' in b) patch.dedicationsEnabled = !!b.dedicationsEnabled;
  store.updateSettings(patch);
  return c.json({ ok: true, settings: store.getSettings() });
});

// ---------- Musiker: Songliste ----------
admin.get('/songs', (c) => c.json(store.listSongs()));

admin.post('/songs', async (c) => {
  const s = normalizeSong(await body(c));
  if (!s) return c.json({ error: 'Interpret und Titel sind Pflichtfelder.' }, 400);
  const song = store.addSong(s);
  return song ? c.json(song, 201) : c.json({ error: 'Diesen Song gibt es schon.' }, 409);
});

admin.put('/songs/:id', async (c) => {
  const s = normalizeSong(await body(c));
  if (!s) return c.json({ error: 'Interpret und Titel sind Pflichtfelder.' }, 400);
  const r = store.updateSong(c.req.param('id'), s);
  if (r === 'missing') return c.json({ error: 'Nicht gefunden' }, 404);
  if (r === 'duplicate') return c.json({ error: 'Diesen Song gibt es schon.' }, 409);
  return c.json(r);
});

admin.delete('/songs/:id', (c) =>
  store.deleteSong(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'Nicht gefunden' }, 404),
);

/**
 * Eine Zeile pro Song: „Interpret; Titel; Jahr“ (Trennzeichen ; Tab oder ,), Jahr optional.
 * Alte Listen mit Genre-Spalte („Interpret; Titel; Genre; Jahr“) gehen auch – das Genre wird ignoriert.
 */
admin.post('/songs/import', async (c) => {
  const b = await body(c);
  const lines = String(b.text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5000);
  const valid = [];
  const errors: string[] = [];
  for (const [i, line] of lines.entries()) {
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const cols = line.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    const [artist, title] = cols;
    const year = cols.length >= 4 ? cols[3] : cols[2];
    if (i === 0 && /^(interpret|artist|künstler)$/i.test(artist ?? '')) continue; // Kopfzeile
    const s = normalizeSong({ artist, title, year });
    if (s) valid.push(s);
    else errors.push(`Zeile ${i + 1}: Interpret oder Titel fehlt`);
  }
  return c.json({ ...store.addSongs(valid), errors: errors.slice(0, 20) });
});

admin.get('/songs/export', (c) => {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = store
    .listSongs()
    .slice()
    .sort((a, b) => a.artist.localeCompare(b.artist, 'de') || a.title.localeCompare(b.title, 'de'));
  const csv = ['Interpret;Titel;Jahr', ...rows.map((s) => [s.artist, s.title, s.year].map(esc).join(';'))];
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="songliste.csv"');
  return c.body('﻿' + csv.join('\r\n'));
});

app.route('/api/admin', admin);
app.all('/api/*', (c) => c.json({ error: 'Nicht gefunden' }, 404));

// ---------- Oberfläche (nur Produktion: nach `npm run build`) ----------
if (fs.existsSync(DIST_DIR)) {
  app.use(
    '/assets/*',
    serveStatic({ root: './dist', onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }),
  );
  app.use('*', serveStatic({ root: './dist' }));
  // Alle anderen Pfade (/, /admin) → die App entscheidet im Browser, was angezeigt wird
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  const mode = fs.existsSync(DIST_DIR) ? 'App + API' : 'nur API (Oberfläche über `npm run dev` / Vite)';
  console.log(`Songwunsch-Server läuft auf http://localhost:${info.port} – ${mode}`);
  if (!isPasswordConfigured()) console.warn('Achtung: ADMIN_PASSWORD ist nicht gesetzt – Login nicht möglich.');
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ist schon belegt. Anderen Port in .env setzen (PORT=…) oder das andere Programm beenden.`);
    process.exit(1);
  }
  throw err;
});
