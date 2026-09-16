export interface JukeboxTrack {
  id: string;
  title: string;
  vibe: string;
  youtubeId: string;
}

export const JUKEBOX_TRACKS: JukeboxTrack[] = [
  { id: 'lofi-live', title: 'Lofi Study Radio', vibe: 'soft lepak', youtubeId: 'jfKfPfyJRdk' },
  { id: 'coffee-jazz', title: 'Coffee Shop Jazz', vibe: 'date night', youtubeId: 'Dx5qFachd3A' },
  { id: 'city-pop', title: 'City Pop Drive', vibe: 'retro crush', youtubeId: '6GEI3PpXEAo' },
  { id: 'tropical-house', title: 'Tropical House Mix', vibe: 'beach party', youtubeId: 'YxjY_YTksKM' },
  { id: 'arcade-funk', title: 'Arcade Funk Mix', vibe: 'game room', youtubeId: 'y0sF5xhGreA' },
  { id: 'romance-pop', title: 'Romantic Pop Mix', vibe: 'love quest', youtubeId: 'hTWKbfoikeg' },
];

export const DEFAULT_JUKEBOX_TRACK = JUKEBOX_TRACKS[0];

export function jukeboxTrack(id: unknown): JukeboxTrack | undefined {
  return typeof id === 'string' ? JUKEBOX_TRACKS.find((t) => t.id === id) : undefined;
}
