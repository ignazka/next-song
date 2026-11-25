export type Song = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
};

export type PublicSong = Song & { wished: number };

export type PublicData = {
  eventTitle: string;
  welcomeText: string;
  requestsOpen: boolean;
  dedicationsEnabled: boolean;
  limits: { name: number; dedication: number };
  songs: PublicSong[];
};

export type AdminRequest = {
  id: string;
  songId: string;
  artist: string;
  title: string;
  name: string;
  dedication: string;
  createdAt: string;
};

/** Ein Platz in der Warteschlange: ein Song mit allen Wünschen dazu (ältester zuerst). */
export type QueueItem = {
  songId: string;
  artist: string;
  title: string;
  firstAt: string;
  wishes: AdminRequest[];
};

export type AdminQueue = {
  requests: AdminRequest[];
  playedCount: number;
  requestsOpen: boolean;
};

export type Settings = {
  eventTitle: string;
  welcomeText: string;
  requestsOpen: boolean;
  publicUrl: string;
  /** Link zur Google-Bewertung (z. B. https://g.page/r/…/review) für die Danke-Seite */
  reviewUrl: string;
  /** Danke-Seite in der Sie-Form (Firmen, Trauerfeiern) statt du-Form (Paare) */
  hostFormal: boolean;
  /** Dürfen Gäste eine Widmung schreiben? (z. B. bei Firmenfeiern ausschalten) */
  dedicationsEnabled: boolean;
};

/** Öffentliche Daten für die Danke-Seite des Gastgebers. */
export type ThanksData = { reviewUrl: string; formal: boolean };
