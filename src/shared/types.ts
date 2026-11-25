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
};

export type Settings = {
  eventTitle: string;
  welcomeText: string;
  /** Dürfen Gäste eine Widmung schreiben? (z. B. bei Firmenfeiern ausschalten) */
  dedicationsEnabled: boolean;
};
