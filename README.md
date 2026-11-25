# Songwunsch – Vite + React + Hono (ohne Datenbank)

Musikwünsche per QR-Code für **Simon Weichert – Musiker für besondere Anlässe**. Gäste suchen sich ein Lied aus, optional mit Namen und Widmung; Simon sieht die Wünsche live auf der Bühne und liest die Widmungen vor.

Dieselbe App gibt es auch als Next.js + PostgreSQL-Version (lokal im Ordner `../simon-app`, mit eigener Git-Historie). Diese hier ist die **schlanke Variante**: ein Node-Prozess, keine Datenbank.

## Starten

```bash
npm install
cp .env.example .env        # ADMIN_PASSWORD setzen
npm run dev
```

| | Adresse |
| --- | --- |
| Gäste | http://localhost:5173 |
| Musiker | http://localhost:5173/admin |
| Danke-Seite für Gastgeber | http://localhost:5173/danke |

Vom Handy im selben WLAN: die Adresse, die Vite als „Network“ anzeigt (z. B. `http://192.168.x.x:5173`).

**Produktion** (ein Port für alles):

```bash
npm run build
npm start                   # http://localhost:3001 (PORT in .env änderbar)
```

## Bühnenansicht (Musiker)

- **Jetzt dran:** Titel, Name (oder „anonym“) und Widmung groß zum Vorlesen.
  - **✓ Gespielt – weiter:** nächstes Lied rückt nach, der Wunsch wird gelöscht.
  - **Überspringen:** tauscht mit dem nächsten Lied (nichts wird gelöscht; nochmal tippen tauscht zurück).
  - **Entfernen** (rötlich): löscht den Wunsch. Beides mit 6 s „Rückgängig“ unten rechts.
- **Warteschlange:** neue Lieder kommen ans Ende, mehrfach gewünschte Lieder behalten ihren Platz und zeigen alle Namen. Die oberste Zeile ist **Als Nächstes** (hervorgehoben). Reihenfolge per Griff ändern: ziehen mit Maus oder Finger, oder Griff fokussieren und Pfeiltasten.
- Echtzeit-Updates, Ton bei neuen Wünschen (standardmäßig aus), Vollbild, Wünsche pausieren.
- **Widmungen pro Event an/aus** (Einstellungen): z. B. bei Firmenfeiern ausschalten. Gäste sehen dann kein Widmungsfeld, der Server verwirft mitgeschickte Widmungen, und der Standard-Begrüßungstext erwähnt keine Widmung.

## Aufbau

```
index.html                  Einstieg für Vite
src/client/                 Oberfläche (React, läuft im Browser)
  main.tsx                  wählt anhand des Pfads: Gäste, /admin, /danke
  components/               Gäste-Ansicht, Danke-Seite, Klangkreis, Icons …
  admin/                    Musiker-Bereich (wird nur bei Bedarf geladen)
  styles.css                Design „Simon Weichert“ (dunkles Thema)
src/server/                 Server (Hono, läuft in Node)
  index.ts                  alle API-Routen, Live-Stream, Auslieferung von dist/
  store.ts                  Songliste (Datei) + Wünsche (Arbeitsspeicher)
  auth.ts                   Musiker-Login (signiertes Cookie)
src/shared/                 Typen, Filter/Sortierung, Validierung – von beiden genutzt
seed/songs.json             Beispielsongs für den ersten Start
data/                       songs.json + settings.json (entsteht zur Laufzeit, nicht in Git)
```

- **Kein Build für den Server:** Node ≥ 22.18 führt TypeScript direkt aus (Type Stripping). Deshalb Importe mit `.ts`-Endung und nur „löschbare“ TS-Syntax (`erasableSyntaxOnly`).
- **Entwicklung:** Vite (5173) liefert die Oberfläche mit Hot Reload und leitet `/api` an Hono (3001) weiter; `node --watch` startet den Server bei Änderungen neu.
- **Prüfen:** `npm run typecheck` (TypeScript 7, getrennt für Browser und Server).

## Daten und Datenschutz

**Prinzip: Ein Wunsch existiert nur, solange er in der Warteschlange steht.**

| Was | Wo | Wie lange |
| --- | --- | --- |
| Songliste, Einstellungen (Simons Daten) | `data/*.json` | dauerhaft |
| Wunsch: Lied, Name, Widmung, Zeitpunkt, gehashter Tab-Code | **nur Arbeitsspeicher** | bis „Gespielt“ oder „Entfernen“ – dann **komplett gelöscht**, ohne Status oder Spuren („Überspringen“ verschiebt nur). Nicht drangekommene Wünsche spätestens nach 12 Std. (`REQUEST_TTL_HOURS`); „Event beenden“ löscht sofort |
| Zähler „x gespielt“ | Arbeitsspeicher | bis „Event beenden“ oder Neustart – eine Zahl ohne Bezug zu Lied oder Person |
| Gäste-IP-Adressen | – | werden **nicht** gespeichert (nur beim Musiker-Login als Schutz gegen Passwort-Raten, 10 Min.) |

- Gästedaten werden **nie auf die Festplatte geschrieben** und nicht geloggt. Nach einem Neustart ist die Warteschlange leer; die Songliste bleibt.
- Das Limit (max. 3 offene Wünsche pro Gast) zählt nur Wünsche, die ohnehin noch in der Schlange stehen.
- Nach dem Spielen weiß der Server nichts mehr über den Wunsch. Auch das Handy des Gastes merkt sich nicht, was er gewünscht hat – im Browser-Tab (`sessionStorage`, weg beim Schließen) liegen nur ein Zufallscode für das Limit und ob die Begrüßung schon gezeigt wurde.
- Gäste bekommen keine Cookies und brauchen kein Konto.
- Hinweis fürs Hosting: Ein vorgeschalteter Webserver (z. B. nginx, Caddy) oder Hosting-Anbieter kann eigene Zugriffs-Logs mit IP-Adressen führen. Die sollte man dort abschalten oder kurz halten.

## Hosting

Braucht einen **dauerhaft laufenden Node-Prozess** mit beschreibbarem Ordner für `data/` – z. B. ein kleiner VPS (mit Caddy/nginx für HTTPS, dann `TRUST_PROXY=true`), Railway, Fly.io oder Render mit Persistent Disk. Serverless (Vercel, Netlify Functions) passt nicht: dort gibt es weder Arbeitsspeicher zwischen Anfragen noch dauerhafte Dateien.

## Vergleich mit der Next.js-Version

| | Next.js + PostgreSQL | Vite + React + Hono |
| --- | --- | --- |
| Produktions-Abhängigkeiten | next, react, react-dom, pg, qrcode, server-only | hono, @hono/node-server |
| Pakete in `node_modules` (oberste Ebene) | 316 | 65 |
| Server/API-Code | 908 Zeilen in 25 Dateien + SQL-Schema | 729 Zeilen in 8 Dateien |
| Routing der API | eine Datei pro Route (`app/api/**/route.ts`) | alle Routen in `server/index.ts` |
| Speicher | Tabellen in PostgreSQL | JSON-Dateien + Arbeitsspeicher |
| Echtzeit | DB-Trigger → `LISTEN/NOTIFY` → SSE, ca. 60–130 ms | EventEmitter → SSE, ca. 35 ms |
| Lokal nötig | Node + PostgreSQL | nur Node |
| Hosting | auch Serverless (mit Einschränkungen beim Live-Stream) | ein Dauer-Prozess |
| Übersteht Neustart | ja, inkl. Warteschlange | Songliste ja, Warteschlange nein |
| Mehrere Server-Instanzen | ja (Trigger erreichen alle) | nein (Zustand liegt in einem Prozess) |
| Stolpersteine unterwegs | Caching-Modell (`cacheComponents`), `allowedDevOrigins`, Next-16-Neuerungen | Vite-Proxy + zwei Prozesse in der Entwicklung |

**Faustregel:** Ein Musiker, ein Event zur Zeit, fast nur temporäre Daten → die schlanke Variante reicht und ist leichter zu verstehen. Mehrere Musiker, Verlauf/Statistiken oder Serverless-Hosting → Datenbank und Next.js lohnen sich.
