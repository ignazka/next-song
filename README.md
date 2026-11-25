# Songwunsch

Musikwünsche per QR-Code für Live-Musiker auf Hochzeiten, Feiern und Events. Gäste scannen den Code, suchen sich ein Lied aus der Songliste aus und können optional ihren Namen und eine Widmung angeben. Der Musiker sieht die Wünsche live in einer Warteschlange und pflegt seine Songliste selbst.

Gebaut mit Vite, React und Hono. Keine Datenbank, nur ein Node-Prozess.

## Starten

```bash
npm install
cp .env.example .env    # ADMIN_PASSWORD setzen
npm run dev
```

- Gäste: http://localhost:5173
- Musiker-Bereich: http://localhost:5173/admin

Produktion:

```bash
npm run build
npm start
```

## Funktionen

**Gäste**
- Songliste durchsuchen, filtern nach Interpret und Jahrzehnt, sortieren nach Interpret oder Titel
- Wunsch mit optionalem Namen und optionaler Widmung
- Kein Login, keine Cookies

**Musiker**
- Live-Warteschlange mit „Jetzt dran“, Widmung zum Vorlesen und Vollbild-Modus
- Gespielt, Überspringen und Entfernen (mit Rückgängig), Reihenfolge per Drag & Drop
- Songliste pflegen, Import und Export als CSV
- Event-Einstellungen: Überschrift, Begrüßungstexte, Widmungen an oder aus
- QR-Code zum Drucken oder als PNG

## Datenschutz

Ein Wunsch existiert nur, solange er in der Warteschlange steht. Wünsche liegen ausschließlich im Arbeitsspeicher und werden gelöscht, sobald das Lied gespielt oder entfernt wurde. Nicht gespielte Wünsche verschwinden automatisch nach 2 Stunden. Gästedaten werden nicht auf die Festplatte geschrieben, IP-Adressen von Gästen nicht gespeichert.

Dauerhaft gespeichert werden nur die Songliste und die Einstellungen.

## Hosting

Die App braucht einen dauerhaft laufenden Node-Prozess mit beschreibbarem Speicher, zum Beispiel einen kleinen VPS. Serverless-Plattformen und Gratis-Container ohne dauerhaften Speicher sind nicht geeignet.

Name, Kontaktlinks und die feste Adresse für den QR-Code werden in `src/shared/brand.ts` eingetragen.
