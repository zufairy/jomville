export interface JukeboxTrack {
  id: string;
  title: string;
  vibe: string;
  youtubeId: string;
}

export const JUKEBOX_TRACKS: JukeboxTrack[] = [
  { id: 'lofi-live', title: '2026 Hits Radio', vibe: 'current pop lepak', youtubeId: 'jfKfPfyJRdk' },
  { id: 'coffee-jazz', title: 'KL Date Night 2026', vibe: 'soft romance', youtubeId: 'Dx5qFachd3A' },
  { id: 'city-pop', title: 'Midnight City Pop', vibe: 'retro crush', youtubeId: '6GEI3PpXEAo' },
  { id: 'tropical-house', title: 'Pantai Party Mix', vibe: 'beach dance', youtubeId: 'YxjY_YTksKM' },
  { id: 'arcade-funk', title: 'Game Den Hype', vibe: 'arcade energy', youtubeId: 'y0sF5xhGreA' },
  { id: 'romance-pop', title: 'Love Quest Anthems', vibe: 'gf/bf cooking vibe', youtubeId: 'hTWKbfoikeg' },
];

export const DEFAULT_JUKEBOX_TRACK = JUKEBOX_TRACKS[0];

export function jukeboxTrack(id: unknown): JukeboxTrack | undefined {
  return typeof id === 'string' ? JUKEBOX_TRACKS.find((t) => t.id === id) : undefined;
}
