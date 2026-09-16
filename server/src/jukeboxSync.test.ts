import { describe, expect, it } from 'vitest';
import { jukeboxPosition, nextJukeboxTrack, JUKEBOX_TRACKS, buildSeatIndex, seatAt, FURNITURE, type Placement } from '@dovey/shared';

describe('room playback timeline', () => {
  it('joins at the elapsed position and preserves paused progress', () => {
    expect(jukeboxPosition({ positionMs: 12000, playing: true, updatedAt: 100000 }, 108000)).toBe(20);
    expect(jukeboxPosition({ positionMs: 12000, playing: false, updatedAt: 100000 }, 108000)).toBe(12);
  });
  it('does not seek backwards on future timestamps or unstarted rooms', () => {
    expect(jukeboxPosition({ positionMs: 0, playing: true, updatedAt: 100000 }, 90000)).toBe(0);
    expect(jukeboxPosition({ positionMs: 0, playing: false, updatedAt: 0 }, Date.now())).toBe(0);
  });
  it('wraps the playlist and recovers removed legacy tracks', () => {
    expect(nextJukeboxTrack(JUKEBOX_TRACKS.at(-1)!.id)).toEqual(JUKEBOX_TRACKS[0]);
    expect(nextJukeboxTrack('lofi-live')).toEqual(JUKEBOX_TRACKS[0]);
  });
});

describe('crowded-room seat cache', () => {
  it('matches scanning for overlapping furniture, rotations and empty tiles', () => {
    const placements = FURNITURE.slice(0, 100).map((def, i) => ({ id: String(i), def: def.id, x: i % 10, y: Math.floor(i / 10), rot: i % 4 })) as Placement[];
    const index = buildSeatIndex(placements);
    for (let x = -1; x < 15; x++) for (let y = -1; y < 15; y++) {
      expect(index.get(`${x},${y}`) ?? null).toEqual(seatAt(x, y, placements));
    }
    expect(buildSeatIndex([]).size).toBe(0);
  });
});
