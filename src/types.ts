
export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  uri: string;
  duration?: number;
  liked: boolean;
  addedAt: number;
  source?: 'local' | 'online';
  artworkUri?: string | null;
};

export type TabName =
  | 'Home'
  | 'Search'
  | 'Library'
  | 'Settings';
