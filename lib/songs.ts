
import { supabase } from './supabase';

export type OnlineSong = {
  id: string;
  title: string;
  artist_name: string;
  album_name: string | null;
  audio_path: string;
  artwork_path: string | null;
  duration_seconds: number | null;
  audioUrl: string;
  artworkUrl: string | null;
};

export async function getPublishedSongs(
  searchTerm = ''
): Promise<OnlineSong[]> {
  let request = supabase
    .from('songs')
    .select(
      'id, title, artist_name, album_name, audio_path, artwork_path, duration_seconds'
    )
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  const term = searchTerm.trim();

  if (term) {
    const safeTerm = term.replace(/[,%()]/g, ' ').trim();

    if (safeTerm) {
      request = request.or(
        `title.ilike.%${safeTerm}%,artist_name.ilike.%${safeTerm}%,album_name.ilike.%${safeTerm}%`
      );
    }
  }

  const { data, error } = await request;

  if (error) throw error;

  return (data ?? []).map((song) => {
    const { data: audio } = supabase.storage
      .from('music-audio')
      .getPublicUrl(song.audio_path);

    const artwork = song.artwork_path
      ? supabase.storage
          .from('music-artwork')
          .getPublicUrl(song.artwork_path).data.publicUrl
      : null;

    return {
      ...song,
      audioUrl: audio.publicUrl,
      artworkUrl: artwork,
    };
  });
}
