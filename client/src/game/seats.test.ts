import { describe, expect, it } from 'vitest';
import { seatPose } from './seats';
import { PX } from './pixelArt';
import { TRADE_SOFA_SEAT_Z } from './tradingPixels';
import { THRONE_SEAT_Z } from './casinoPixels';

/**
 * Hips go one world px below the cushion top, like the upholstered sofa and
 * armchair (cushion top 12 + 5 = 17 px, pose z 16): the cut at the hips sinks
 * just into the padding instead of hovering on it.
 */
const SINK = 1;

describe('seat poses', () => {
  it('upholstered sofa sets the reference: hips 1px into a 17px cushion', () => {
    expect(seatPose('sofa').z).toBe(17 - SINK);
  });

  it('trade sofa sits avatars on its measured cushion top', () => {
    expect(TRADE_SOFA_SEAT_Z * PX).toBe(24);
    expect(seatPose('trade_sofa').z).toBe(TRADE_SOFA_SEAT_Z * PX - SINK);
    expect(seatPose('trade_sofa').back).toBe(true);
  });

  it('golden throne sits avatars on its velvet cushion, not inside the seat block', () => {
    expect(THRONE_SEAT_Z * PX).toBe(22);
    expect(seatPose('throne').z).toBe(THRONE_SEAT_Z * PX - SINK);
    expect(seatPose('throne').back).toBe(true);
  });
});
