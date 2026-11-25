import crypto from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const COOKIE = 'admin_session';
const SESSION_SECONDS = 24 * 3600;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function secret(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  // Ändert sich das Passwort, werden alle bestehenden Sitzungen ungültig.
  return pw ? sha256(`${process.env.SESSION_SECRET ?? ''}|${pw}`) : null;
}

const sign = (payload: string, key: string) => crypto.createHmac('sha256', key).update(payload).digest('hex');

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export const isPasswordConfigured = () => !!process.env.ADMIN_PASSWORD;

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && safeEqual(sha256(input), sha256(pw));
}

/** HTTPS erkennen – direkt oder hinter einem Reverse Proxy (X-Forwarded-Proto). */
function isHttps(c: Context) {
  return new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';
}

export function createSession(c: Context) {
  const key = secret();
  if (!key) throw new Error('ADMIN_PASSWORD fehlt');
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  setCookie(c, COOKIE, `${exp}.${sign(exp, key)}`, {
    httpOnly: true,
    sameSite: 'Strict',
    // Secure nur über HTTPS – so funktioniert der Login auch per http:// im WLAN
    secure: isHttps(c),
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export const destroySession = (c: Context) => deleteCookie(c, COOKIE, { path: '/' });

export function isAdmin(c: Context): boolean {
  const key = secret();
  const value = getCookie(c, COOKIE);
  if (!key || !value) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || !safeEqual(sig, sign(exp, key))) return false;
  return Number(exp) * 1000 > Date.now();
}

/** Middleware für /api/admin/*: ohne gültige Sitzung → 401. */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (!isAdmin(c)) return c.json({ error: 'Nicht angemeldet' }, 401);
  await next();
};
