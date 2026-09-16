export interface JukeboxTrack {
  id: string;
  title: string;
  vibe: string;
  youtubeId: string;
}

export const JUKEBOX_TRACKS: JukeboxTrack[] = [
  { id: 'lofi-live', title: '2026 Hits Radio', vibe: 'current pop lepak', youtubeId: 'jfKfPfyJRdk' },
  { id: 'on-and-on', title: 'On & On', vibe: 'feel good squad', youtubeId: 'K4DyBUG242c' },
  { id: 'sky-high', title: 'Sky High Arcade', vibe: 'win streak energy', youtubeId: 'TW9d8vYrVFQ' },
  { id: 'invincible', title: 'Invincible Run', vibe: 'boss mode', youtubeId: 'J2X5mJ3HDYE' },
  { id: 'heroes-tonight', title: 'Heroes Tonight', vibe: 'late night hype', youtubeId: '3nQNiWdeH2Q' },
  { id: 'feel-good', title: 'Feel Good 2026', vibe: 'sweet upbeat', youtubeId: 'q1ULJ92aldE' },
  { id: 'blank', title: 'Blank Space Dash', vibe: 'melodic rush', youtubeId: 'p7ZsBPK656s' },
  { id: 'adventure', title: 'Adventure Mode', vibe: 'quest together', youtubeId: 'f2xGxd9xPYA' },
  { id: 'ark', title: 'Ark Party', vibe: 'future bass', youtubeId: '8xlDwukxjnA' },
  { id: 'fearless', title: 'Fearless Duo', vibe: 'main character', youtubeId: 'S19UcWdOA-I' },
  { id: 'invisible', title: 'Invisible Crush', vibe: 'trap sparkle', youtubeId: 'QglaLzo_aPk' },
  { id: 'angel', title: 'Angel Date', vibe: 'soft romance', youtubeId: 'A5UM2RCs63c' },
  { id: 'better-days', title: 'Better Days', vibe: 'sunset lepak', youtubeId: 'RXLzvo6kvVQ' },
  { id: 'coffee-jazz', title: 'KL Date Night 2026', vibe: 'slow jazz love', youtubeId: 'Dx5qFachd3A' },
  { id: 'city-pop', title: 'Midnight City Pop', vibe: 'retro crush', youtubeId: '6GEI3PpXEAo' },
];

export const DEFAULT_JUKEBOX_TRACK = JUKEBOX_TRACKS[0];

export function jukeboxTrack(id: unknown): JukeboxTrack | undefined {
  return typeof id === 'string' ? JUKEBOX_TRACKS.find((t) => t.id === id) : undefined;
}

export function nextJukeboxTrack(id: unknown): JukeboxTrack {
  const current = typeof id === 'string' ? JUKEBOX_TRACKS.findIndex((t) => t.id === id) : -1;
  return JUKEBOX_TRACKS[(current + 1 + JUKEBOX_TRACKS.length) % JUKEBOX_TRACKS.length] ?? DEFAULT_JUKEBOX_TRACK;
}
