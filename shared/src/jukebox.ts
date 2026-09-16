export interface JukeboxTrack {
  id: string;
  title: string;
  vibe: string;
  youtubeId: string;
}

// Curated from the 16 September 2026 music-video trending chart.
// Source: https://kworb.net/youtube/trending.html
export const JUKEBOX_TRACKS: JukeboxTrack[] = [
  { id: 'sawadika', title: 'SaWaDiKa', vibe: 'LISA · trending in Malaysia', youtubeId: 'FyS5dAywkEo' },
  { id: 'click', title: 'CLICK', vibe: 'JISOO · K-pop', youtubeId: 'sf02ugzPFE4' },
  { id: 'joseph', title: 'Joseph', vibe: 'Falling In Reverse · rock', youtubeId: 'Tk9TM7-eTmw' },
  { id: 'talk-to-god', title: 'If I Ever Talk To God', vibe: 'Landon Barker · pop rock', youtubeId: 'pcKNqPP0C9o' },
  { id: 'benim-olsana', title: 'BENİM OLSANA', vibe: 'CRUSH · global pop', youtubeId: 'ZVVylrAkmfg' },
  { id: 'regalo', title: 'Regalo de Luna', vibe: 'Cristy Nodal · Latin', youtubeId: 'sFSwQn0J1po' },
];

export const DEFAULT_JUKEBOX_TRACK = JUKEBOX_TRACKS[0];

export function jukeboxTrack(id: unknown): JukeboxTrack | undefined {
  return typeof id === 'string' ? JUKEBOX_TRACKS.find((t) => t.id === id) : undefined;
}

export function nextJukeboxTrack(id: unknown): JukeboxTrack {
  const current = typeof id === 'string' ? JUKEBOX_TRACKS.findIndex((t) => t.id === id) : -1;
  return JUKEBOX_TRACKS[(current + 1 + JUKEBOX_TRACKS.length) % JUKEBOX_TRACKS.length] ?? DEFAULT_JUKEBOX_TRACK;
}

/** The authoritative room timeline, in seconds (clock offset is measured by the client). */
export function jukeboxPosition(state: { positionMs: number; playing: boolean; updatedAt: number }, now: number): number {
  return Math.max(0, state.positionMs + (state.playing && state.updatedAt > 0 ? Math.max(0, now - state.updatedAt) : 0)) / 1000;
}
